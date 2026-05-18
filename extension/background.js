/**
 * repo-compress - Extension Background Service Worker
 * 负责：设置管理、跨 tab 通信
 */

// ── 安装时初始化默认设置 ──────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[repo-compress] Extension installed');

    // 设置默认配置
    await chrome.storage.local.set({
      rc_web_ui_url: 'https://yourusername.github.io/repo-compress/',
      rc_github_token: '',
    });
  }
});

// ── 监听来自 content script 的消息 ────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['rc_web_ui_url', 'rc_github_token'], (result) => {
      sendResponse(result);
    });
    return true; // 保持异步
  }

  if (message.type === 'SAVE_TOKEN') {
    chrome.storage.local.set({ rc_github_token: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
