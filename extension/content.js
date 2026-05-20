/**
 * repo-compress - GitHub Content Script
 * 在 GitHub 仓库页面注入"AI Compress"按钮
 *
 * 修复记录：
 * - [本次] 重构通信机制：盲发 setInterval 轮询 → 双向信标握手
 *   网页初始化完成后主动发送 REPO_COMPRESS_READY 信标，
 *   插件收到信标后精准一次性发送数据，彻底消除消息丢失风险。
 *   超时 10 秒自动降级兜底，并强制销毁监听器防止内存泄漏（Law-39）。
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
    btn.id        = 'rc-compress-btn';
    btn.className = 'rc-btn';
    btn.title     = '用 repo-compress 转换为 AI 友好格式';
    btn.innerHTML = `
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
    btn.disabled  = true;
    btn.innerHTML = `<span class="rc-btn-icon">⏳</span><span class="rc-btn-text">处理中...</span>`;
    btn.classList.add('rc-btn-loading');

    try {
      // 读取用户保存的 Token 和自定义 Web UI 地址
      // content script 不能直接读 Web UI 的 localStorage，改用 chrome.storage.local
      const stored   = await chrome.storage.local.get(['rc_github_token', 'rc_web_ui_url']);
      const token    = stored.rc_github_token || null;
      const webUiUrl = stored.rc_web_ui_url   || WEB_UI_URL;

      // 打开 Web UI
      const uiWindow = window.open(webUiUrl, '_blank');

      if (!uiWindow) {
        // 被浏览器弹窗拦截
        showNotification('请允许弹出窗口，然后重试', 'warning');
        return;
      }

      const payload = {
        type:   'REPO_COMPRESS_FETCH',
        repo:   info.full,
        branch: info.branch,
        token,
      };

      // ── 双向信标握手 ────────────────────────────────────────────────────
      //
      // 旧方案（已废弃）：setInterval 每 500ms 盲发一次，最多 20 次（10 秒）。
      //   问题：低端机/慢网络下网页加载超过 10 秒时消息全部丢失；
      //         重复发送有时导致 Web UI 重复触发 handleRemoteFetch。
      //
      // 新方案：网页初始化完成后主动广播 REPO_COMPRESS_READY 信标，
      //         插件监听到后精准发送一次 payload，随即销毁监听器。
      //         超时 10 秒自动降级兜底 + 强制销毁监听器（Law-39 生命周期管理）。
      // ────────────────────────────────────────────────────────────────────

      // 声明握手回调（需要具名，以便后续精准移除）
      function handleHandshake(event) {
        if (event.data?.type !== 'REPO_COMPRESS_READY') return;

        // 收到信标：清理超时定时器，精准发送数据
        clearTimeout(timeoutId);
        try {
          uiWindow.postMessage(payload, '*');
        } catch (e) {
          console.warn('[repo-compress] postMessage failed after handshake:', e);
        }

        // 功成身退，移除监听器（防止重复触发和内存泄漏）
        window.removeEventListener('message', handleHandshake);
        showNotification(`✅ 已成功传送数据至 repo-compress，正在处理 ${info.full}`, 'success');
      }

      // 注册信标监听器
      window.addEventListener('message', handleHandshake);

      // 超时降级定时器：
      // 如果 10 秒内网页没有回应 READY 信标（极慢网络 / 浏览器隔离策略），
      // 自动清理监听器并尝试盲发一次，给用户最后一次机会。
      const timeoutId = setTimeout(() => {
        // 先移除监听器，防止事后 READY 信标到达导致重复发送
        window.removeEventListener('message', handleHandshake);

        showNotification(
          '⚠️ 网页响应超时，已尝试降级发送，若无反应请手动刷新 Web UI 页面',
          'warning',
        );

        // 降级兜底：盲发一次
        try {
          uiWindow.postMessage(payload, '*');
        } catch (e) {
          console.warn('[repo-compress] Fallback postMessage failed:', e);
        }
      }, 10_000);

    } catch (err) {
      console.error('[repo-compress]', err);
      showNotification(`❌ 出错：${err.message}`, 'error');
    } finally {
      // 无论成功失败，2 秒后恢复按钮状态
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
    div.id          = 'rc-notification';
    div.className   = `rc-notification rc-notification-${type}`;
    div.textContent = message;

    document.body.appendChild(div);

    // 3.5 秒后自动消失
    setTimeout(() => div.remove(), 3500);
  }

  // ── 监听 DOM 变化（GitHub 是 SPA）────────────

  // GitHub 使用 Turbo/pjax 导航，需要监听路由变化
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl  = currentUrl;
      injected = false; // 重置，允许在新页面重新注入
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
