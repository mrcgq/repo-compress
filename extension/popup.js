/**
 * repo-compress - Extension Popup Logic
 */

const elWebUiUrl    = document.getElementById('webUiUrl');
const elGithubToken = document.getElementById('githubToken');
const elSaveBtn     = document.getElementById('saveBtn');
const elStatus      = document.getElementById('status');

// 加载已保存的设置
chrome.storage.local.get(['rc_web_ui_url', 'rc_github_token'], (result) => {
  if (result.rc_web_ui_url)    elWebUiUrl.value    = result.rc_web_ui_url;
  if (result.rc_github_token)  elGithubToken.value = result.rc_github_token;
});

// 保存设置
elSaveBtn.addEventListener('click', () => {
  const url   = elWebUiUrl.value.trim();
  const token = elGithubToken.value.trim();

  if (url && !url.startsWith('http')) {
    elStatus.style.color = '#ef4444';
    elStatus.textContent = '❌ 请输入有效的 URL';
    return;
  }

  chrome.storage.local.set({
    rc_web_ui_url:    url   || 'https://mrcgq.github.io/repo-compress/',
    rc_github_token:  token || '',
  }, () => {
    elStatus.style.color = '#10b981';
    elStatus.textContent = '✅ 已保存';
    setTimeout(() => { elStatus.textContent = ''; }, 2000);
  });
});
