/**
 * repo-compress - GitHub Content Script
 * 在 GitHub 仓库页面注入"AI Compress"按钮
 */

(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────

  // 把这里改成你的真实地址
  const WEB_UI_URL = 'https://mrcgq.github.io/repo-compress/';
  
  // ── 工具函数 ──────────────────────────────────

  /**
   * 解析当前页面的仓库信息
   * 支持：
   *   github.com/owner/repo
   *   github.com/owner/repo/tree/branch
   *   github.com/owner/repo/blob/branch/file
   */
  function parseCurrentPage() {
    const { pathname } = window.location;
    const parts = pathname.split('/').filter(Boolean);

    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo  = parts[1];

    // 提取分支（如果在 tree/ 或 blob/ 子页面）
    let branch = null;
    if (parts[2] === 'tree' || parts[2] === 'blob') {
      branch = parts[3] || null;
    }

    return { owner, repo, branch, full: `${owner}/${repo}` };
  }

  /**
   * 判断当前是否是仓库主页或 tree 页面
   */
  function isRepoPage() {
    const info = parseCurrentPage();
    if (!info) return false;

    const { pathname } = window.location;
    // 仓库根目录：/owner/repo 或 /owner/repo/tree/branch
    return (
      pathname === `/${info.owner}/${info.repo}` ||
      pathname === `/${info.owner}/${info.repo}/` ||
      pathname.startsWith(`/${info.owner}/${info.repo}/tree/`)
    );
  }

  // ── 按钮注入 ──────────────────────────────────

  let injected = false;

  function injectButton() {
    if (injected) return;
    if (!isRepoPage()) return;

    const info = parseCurrentPage();
    if (!info) return;

    // 找到 GitHub 的操作按钮区域（Code 按钮旁边）
    // GitHub 会更新 DOM 结构，用多个选择器兜底
    const targetSelectors = [
      // 2024+ GitHub UI
      '[data-testid="repository-header-actions"]',
      // 兜底：Code 按钮的父容器
      '.js-get-repo-btn',
      '.get-repo-btn-group',
      // 更宽泛的兜底
      'div.d-flex.gap-2',
    ];

    let container = null;
    for (const sel of targetSelectors) {
      container = document.querySelector(sel);
      if (container) break;
    }

    if (!container) {
      // 最终兜底：插入到文件列表上方
      container = document.querySelector('#repo-content-pjax-container > div');
    }

    if (!container) return;

    // 避免重复注入
    if (document.getElementById('rc-compress-btn')) return;

    // 创建按钮
    const btn = document.createElement('button');
    btn.id          = 'rc-compress-btn';
    btn.className   = 'rc-btn';
    btn.title       = '用 repo-compress 转换为 AI 友好格式';
    btn.innerHTML   = `
      <span class="rc-btn-icon">🗜️</span>
      <span class="rc-btn-text">AI Compress</span>
    `;

    btn.addEventListener('click', () => handleCompress(info));

    // 插入按钮
    container.insertAdjacentElement('afterend', btn);

    injected = true;
    console.log('[repo-compress] Button injected for', info.full);
  }

  // ── 压缩处理 ──────────────────────────────────

  async function handleCompress(info) {
    const btn = document.getElementById('rc-compress-btn');

    // 更新按钮状态
    btn.disabled        = true;
    btn.innerHTML       = `<span class="rc-btn-icon">⏳</span><span class="rc-btn-text">处理中...</span>`;
    btn.classList.add('rc-btn-loading');

    try {
      // 读取用户保存的 Token（与 Web UI 共享 localStorage 键名）
      // 注意：content script 不能直接读 Web UI 的 localStorage
      // 用 chrome.storage.local 代替
      const stored = await chrome.storage.local.get(['rc_github_token', 'rc_web_ui_url']);
      const token    = stored.rc_github_token || null;
      const webUiUrl = stored.rc_web_ui_url   || WEB_UI_URL;

      // 打开 Web UI
      const uiWindow = window.open(webUiUrl, '_blank');

      if (!uiWindow) {
        // 被 popup 拦截
        showNotification('请允许弹出窗口，然后重试', 'warning');
        return;
      }

      // 等待 Web UI 加载完成后发送消息
      const payload = {
        type:   'REPO_COMPRESS_FETCH',
        repo:   info.full,
        branch: info.branch,
        token,
      };

      // 轮询等待目标窗口 ready（最多 10 秒）
      let attempts = 0;
      const maxAttempts = 20;

      const pollInterval = setInterval(() => {
        attempts++;
        try {
          uiWindow.postMessage(payload, '*');
        } catch (e) {
          // 窗口可能还没加载完，忽略错误
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      }, 500);

      showNotification(`✅ 已打开 repo-compress，正在处理 ${info.full}`, 'success');

    } catch (err) {
      console.error('[repo-compress]', err);
      showNotification(`❌ 出错：${err.message}`, 'error');
    } finally {
      setTimeout(() => {
        btn.disabled  = false;
        btn.innerHTML = `<span class="rc-btn-icon">🗜️</span><span class="rc-btn-text">AI Compress</span>`;
        btn.classList.remove('rc-btn-loading');
      }, 2000);
    }
  }

  // ── 通知 ──────────────────────────────────────

  function showNotification(message, type = 'info') {
    // 移除旧通知
    document.getElementById('rc-notification')?.remove();

    const div = document.createElement('div');
    div.id        = 'rc-notification';
    div.className = `rc-notification rc-notification-${type}`;
    div.textContent = message;

    document.body.appendChild(div);

    // 3 秒后自动消失
    setTimeout(() => div.remove(), 3500);
  }

  // ── 监听 DOM 变化（GitHub 是 SPA）────────────

  // GitHub 使用 Turbo/pjax 导航，需要监听路由变化
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl   = currentUrl;
      injected  = false; // 重置，允许在新页面重新注入
      setTimeout(injectButton, 800); // 等待 GitHub 渲染完成
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 首次注入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectButton, 500));
  } else {
    setTimeout(injectButton, 500);
  }

})();
