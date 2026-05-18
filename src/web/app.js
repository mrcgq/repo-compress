/**
 * Web UI Application Logic
 *
 * 修复记录：
 * - [本次] 消除与 src/core/ 的代码重复，改为直接 import
 * - [本次] 修复 escapeCdata bug（随 core/converter.js 一起修复）
 * - [本次] 加入省钱计算器展示
 * - [本次] 首页描述更新，突出缓存价值
 */

// ============================================
// 直接复用 core 模块（消除重复代码）
// ============================================

import { parseZip, validateZipData } from '../core/parser.js';
import { filterFiles }               from '../core/filter.js';
import { convert }                   from '../core/converter.js';
import { detectCacheBusters }        from '../core/detector.js';
import { OUTPUT_FORMATS, FORMAT_EXTENSIONS } from '../utils/constants.js';
import { formatSize, formatNumber }  from '../utils/helpers.js';

// ============================================
// 本地常量（仅 Web UI 需要的）
// ============================================

/**
 * Claude Prompt Cache 定价参考（美元）
 * 来源：https://www.anthropic.com/pricing
 * claude-3-5-sonnet 为例
 */
const PRICING = {
  // 未命中缓存：输入 token 全价
  INPUT_PER_M:        3.00,   // $3.00 / 1M tokens
  // 命中缓存：读取价格（约为全价的 10%）
  CACHE_READ_PER_M:   0.30,   // $0.30 / 1M tokens
  // 缓存写入（只有第一次）
  CACHE_WRITE_PER_M:  3.75,   // $3.75 / 1M tokens
};

// ============================================
// State
// ============================================

let state = {
  file:        null,
  output:      null,
  format:      OUTPUT_FORMATS.MARKDOWN,
  detectCache: true,
  skipped:     [],
  sourceLabel: '',
  lastStats:   null,  // 保存最后一次的 stats，供计算器使用
};

// ============================================
// DOM References
// ============================================

const el = {
  // Tabs
  tabBtns:         document.querySelectorAll('.tab-btn'),
  tabLocal:        document.getElementById('tab-local'),
  tabRemote:       document.getElementById('tab-remote'),
  // Local
  dropzone:        document.getElementById('dropzone'),
  fileInput:       document.getElementById('fileInput'),
  // Remote
  repoUrl:         document.getElementById('repoUrl'),
  githubToken:     document.getElementById('githubToken'),
  fetchBtn:        document.getElementById('fetchBtn'),
  tokenHelpBtn:    document.getElementById('tokenHelpBtn'),
  tokenHint:       document.getElementById('tokenHint'),
  // File Info
  fileInfo:        document.getElementById('fileInfo'),
  fileName:        document.getElementById('fileName'),
  fileSize:        document.getElementById('fileSize'),
  clearBtn:        document.getElementById('clearBtn'),
  // Options
  optionsSection:  document.getElementById('optionsSection'),
  convertBtn:      document.getElementById('convertBtn'),
  detectCacheChk:  document.getElementById('detectCache'),
  // Progress
  progressSection: document.getElementById('progressSection'),
  progressFill:    document.getElementById('progressFill'),
  progressText:    document.getElementById('progressText'),
  // Results
  resultsSection:  document.getElementById('resultsSection'),
  statFiles:       document.getElementById('statFiles'),
  statSize:        document.getElementById('statSize'),
  statTokens:      document.getElementById('statTokens'),
  statFormat:      document.getElementById('statFormat'),
  languageStats:   document.getElementById('languageStats'),
  warningsCard:    document.getElementById('warningsCard'),
  warningsList:    document.getElementById('warningsList'),
  cacheCard:       document.getElementById('cacheCard'),
  cacheResults:    document.getElementById('cacheResults'),
  // 省钱计算器
  savingsCard:     document.getElementById('savingsCard'),
  savingsContent:  document.getElementById('savingsContent'),
  // 输出
  outputContent:   document.getElementById('outputContent'),
  copyBtn:         document.getElementById('copyBtn'),
  copyText:        document.getElementById('copyText'),
  downloadBtn:     document.getElementById('downloadBtn'),
  resetBtn:        document.getElementById('resetBtn'),
  helpLink:        document.getElementById('helpLink'),
  helpModal:       document.getElementById('helpModal'),
  closeModal:      document.getElementById('closeModal'),
  toast:           document.getElementById('toast'),
};

// ============================================
// Toast
// ============================================

function showToast(message, type = 'error') {
  el.toast.textContent = message;
  el.toast.className   = `toast toast-${type} toast-show`;
  clearTimeout(el.toast._timer);
  el.toast._timer = setTimeout(() => { el.toast.className = 'toast'; }, 3500);
}

// ============================================
// Tab 切换
// ============================================

el.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    el.tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    el.tabLocal.classList.toggle('hidden',  tab !== 'local');
    el.tabRemote.classList.toggle('hidden', tab !== 'remote');
  });
});

// ============================================
// Token Help
// ============================================

el.tokenHelpBtn.addEventListener('click', () => {
  const hidden = el.tokenHint.style.display === 'none';
  el.tokenHint.style.display = hidden ? 'block' : 'none';
});

// Token 本地持久化（不上传服务器）
const savedToken = localStorage.getItem('rc_github_token');
if (savedToken) el.githubToken.value = savedToken;
el.githubToken.addEventListener('change', () => {
  const v = el.githubToken.value.trim();
  if (v) localStorage.setItem('rc_github_token', v);
  else   localStorage.removeItem('rc_github_token');
});

// ============================================
// Example Buttons
// ============================================

document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    el.repoUrl.value = btn.dataset.repo;
    el.repoUrl.focus();
  });
});

// ============================================
// Event Listeners
// ============================================

// 本地上传
el.dropzone.addEventListener('click',    () => el.fileInput.click());
el.fileInput.addEventListener('change',  e  => handleLocalFile(e.target.files[0]));
el.dropzone.addEventListener('dragover', e  => {
  e.preventDefault();
  el.dropzone.classList.add('dragover');
});
el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('dragover'));
el.dropzone.addEventListener('drop', e => {
  e.preventDefault();
  el.dropzone.classList.remove('dragover');
  handleLocalFile(e.dataTransfer.files[0]);
});

// 远程获取
el.fetchBtn.addEventListener('click', handleRemoteFetch);
el.repoUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleRemoteFetch();
});

// 通用
el.clearBtn.addEventListener('click', resetState);
document.querySelectorAll('input[name="format"]').forEach(radio => {
  radio.addEventListener('change', e => { state.format = e.target.value; });
});
el.detectCacheChk.addEventListener('change', e => { state.detectCache = e.target.checked; });
el.convertBtn.addEventListener('click', handleConvert);
el.copyBtn.addEventListener('click', copyToClipboard);
el.downloadBtn.addEventListener('click', downloadFile);
el.resetBtn.addEventListener('click', resetState);
el.helpLink.addEventListener('click', e => {
  e.preventDefault();
  el.helpModal.style.display = 'flex';
});
el.closeModal.addEventListener('click', () => { el.helpModal.style.display = 'none'; });
el.helpModal.addEventListener('click', e => {
  if (e.target === el.helpModal) el.helpModal.style.display = 'none';
});

// ============================================
// 本地文件处理
// ============================================

function handleLocalFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('请选择 .zip 格式的文件');
    return;
  }
  const v = validateZipData(file);
  if (!v.valid) { showToast(v.error); return; }

  state.file        = file;
  state.sourceLabel = file.name;
  showFileInfo(file.name, file.size);
}

// ============================================
// 远程仓库：解析输入
// ============================================

function parseRepoInput(input) {
  input = input.trim();

  // 完整 GitHub URL
  const urlMatch = input.match(
    /github\.com\/([^/]+\/[^/]+?)(?:\/tree\/([^/]+))?(?:\/|$)/
  );
  if (urlMatch) {
    return { repo: urlMatch[1].replace(/\.git$/, ''), branch: urlMatch[2] || null };
  }

  // owner/repo@branch
  const atMatch = input.match(/^([^@\s]+)@([^@\s]+)$/);
  if (atMatch) return { repo: atMatch[1], branch: atMatch[2] };

  // owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(input)) return { repo: input, branch: null };

  return null;
}

// ============================================
// 远程仓库：下载 ZIP
// ============================================

async function fetchRepoZip(repo, preferredBranch, token) {
  const headers = {
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let defaultBranch = preferredBranch;
  if (!defaultBranch) {
    try {
      const infoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (infoRes.ok) {
        const info    = await infoRes.json();
        defaultBranch = info.default_branch || 'main';
      } else if (infoRes.status === 404) {
        throw new Error(`仓库不存在: ${repo}`);
      } else if (infoRes.status === 403) {
        throw new Error('GitHub API 限流，请提供 Token 后重试');
      }
    } catch (e) {
      if (e.message.includes('仓库') || e.message.includes('限流')) throw e;
      defaultBranch = 'main';
    }
  }

  const branchesToTry = [defaultBranch, 'main', 'master'].filter(Boolean);
  const tried         = new Set();

  for (const branch of branchesToTry) {
    if (tried.has(branch)) continue;
    tried.add(branch);

    const url = `https://api.github.com/repos/${repo}/zipball/${branch}`;
    const res = await fetch(url, { headers });

    if (res.ok) {
      const blob = await res.blob();
      return { blob, branch };
    }
    if (res.status === 404) continue;
    if (res.status === 403) throw new Error('GitHub API 限流，请提供 Token 后重试');
    throw new Error(`下载失败 (HTTP ${res.status})`);
  }

  throw new Error(`找不到可用分支（尝试了: ${[...tried].join(', ')}）`);
}

// ============================================
// 远程仓库处理
// ============================================

async function handleRemoteFetch() {
  const input = el.repoUrl.value.trim();
  if (!input) {
    showToast('请输入仓库地址，例如：owner/repo');
    return;
  }

  const parsed = parseRepoInput(input);
  if (!parsed) {
    showToast('格式不正确，请输入 owner/repo 或完整 GitHub URL');
    return;
  }

  const token = el.githubToken.value.trim() || null;

  el.fetchBtn.disabled    = true;
  el.fetchBtn.textContent = '⏳ 下载中...';

  try {
    setProgress(`正在获取仓库信息: ${parsed.repo}`, 10);
    el.progressSection.style.display = 'block';

    const { blob, branch } = await fetchRepoZip(parsed.repo, parsed.branch, token);

    setProgress('下载完成，准备解析...', 30);

    const fileName = `${parsed.repo.replace('/', '-')}@${branch}.zip`;
    const file     = new File([blob], fileName, { type: 'application/zip' });

    const v = validateZipData(file);
    if (!v.valid) throw new Error(v.error);

    state.file        = file;
    state.sourceLabel = `${parsed.repo}@${branch}`;
    showFileInfo(state.sourceLabel, file.size);

    el.progressSection.style.display = 'none';
    showToast(`✅ 已获取 ${parsed.repo}@${branch}`, 'success');

  } catch (err) {
    console.error('[Remote]', err);
    showToast(`获取失败：${err.message}`);
    el.progressSection.style.display = 'none';
  } finally {
    el.fetchBtn.disabled    = false;
    el.fetchBtn.textContent = '🌐 获取仓库';
  }
}

// ============================================
// 共用：显示文件信息
// ============================================

function showFileInfo(name, size) {
  el.fileName.textContent         = name;
  el.fileSize.textContent         = formatSize(size);
  el.fileInfo.style.display       = 'block';
  el.optionsSection.style.display = 'block';
}

// ============================================
// 转换
// ============================================

async function handleConvert() {
  if (!state.file) { showToast('请先选择文件或获取远程仓库'); return; }

  el.optionsSection.style.display = 'none';
  el.convertBtn.disabled          = true;

  try {
    setProgress('正在解析 ZIP 文件...', 15);
    const { files, skipped } = await parseZip(state.file);
    state.skipped = skipped;

    setProgress('正在过滤文件...', 40);
    const { filtered, stats } = filterFiles(files);
    state.lastStats = stats;

    let cacheDetection = null;
    if (state.detectCache) {
      setProgress('正在检测缓存破坏向量...', 60);
      cacheDetection = detectCacheBusters(filtered);
    }

    setProgress('正在生成输出...', 80);
    const meta = {
      skipped:    skipped,
      sourceFile: state.sourceLabel || state.file.name,
    };
    const output = convert(filtered, stats, state.format, meta);
    state.output = output;

    setProgress('完成！', 100);
    setTimeout(() => showResults(stats, cacheDetection), 400);

  } catch (error) {
    console.error('[Convert]', error);
    showToast(`转换失败：${error.message}`);
    el.convertBtn.disabled           = false;
    el.progressSection.style.display = 'none';
    el.optionsSection.style.display  = 'block';
  }
}

function setProgress(text, percent) {
  el.progressSection.style.display = 'block';
  el.progressText.textContent      = text;
  el.progressFill.style.width      = `${percent}%`;
}

// ============================================
// 省钱计算器
// ============================================

/**
 * 根据 token 数量和缓存命中情况，计算每月节省金额
 *
 * @param {number} tokens         - 本次打包的 token 数
 * @param {number} cacheBusters   - 检测到的缓存破坏文件数（0 = 完全可缓存）
 * @returns {string}              - HTML 字符串
 */
function buildSavingsCard(tokens, cacheBusters) {
  const DAILY_QUERIES  = 10;   // 假设每天问 10 次
  const MONTHLY_DAYS   = 22;   // 工作日
  const totalQueries   = DAILY_QUERIES * MONTHLY_DAYS;

  // 未使用缓存的月费用
  const costWithout = (tokens / 1_000_000) * PRICING.INPUT_PER_M * totalQueries;

  // 使用缓存的月费用
  // 第一次：写入费用
  const costCacheWrite = (tokens / 1_000_000) * PRICING.CACHE_WRITE_PER_M;
  // 后续：读取费用
  const costCacheRead  = (tokens / 1_000_000) * PRICING.CACHE_READ_PER_M * (totalQueries - 1);
  const costWith       = costCacheWrite + costCacheRead;

  const saved      = costWithout - costWith;
  const savePct    = Math.round((saved / costWithout) * 100);

  // 是否有缓存破坏问题
  const hasBusters = cacheBusters > 0;

  const statusIcon  = hasBusters ? '⚠️' : '✅';
  const statusColor = hasBusters ? '#f59e0b' : '#10b981';
  const statusText  = hasBusters
    ? `检测到 ${cacheBusters} 个文件会破坏缓存，修复后可完全命中缓存`
    : '未检测到缓存破坏向量，缓存可完全命中';

  return `
    <div class="savings-grid">
      <div class="savings-item">
        <span class="savings-label">本次打包 Token</span>
        <span class="savings-value">${formatNumber(tokens)}</span>
      </div>
      <div class="savings-item">
        <span class="savings-label">不用缓存的月费用</span>
        <span class="savings-value savings-bad">$${costWithout.toFixed(2)}</span>
        <span class="savings-note">按每天 ${DAILY_QUERIES} 次、每月 ${MONTHLY_DAYS} 工作日估算</span>
      </div>
      <div class="savings-item">
        <span class="savings-label">使用缓存的月费用</span>
        <span class="savings-value savings-good">$${costWith.toFixed(2)}</span>
      </div>
      <div class="savings-item savings-highlight">
        <span class="savings-label">每月节省</span>
        <span class="savings-value savings-good">$${saved.toFixed(2)} <small>(${savePct}%)</small></span>
      </div>
    </div>
    <div class="savings-status" style="border-color: ${statusColor}; color: ${statusColor}">
      ${statusIcon} ${statusText}
    </div>
    <p class="savings-footnote">
      * 基于 Claude 3.5 Sonnet 定价估算（输入 $3/M tokens，缓存读取 $0.30/M tokens）。
      实际费用因模型和用量而异。
    </p>
  `;
}

// ============================================
// 结果展示
// ============================================

function showResults(stats, cacheDetection) {
  el.progressSection.style.display = 'none';
  el.resultsSection.style.display  = 'block';
  el.resultsSection.classList.add('fade-in');

  // 基础统计
  el.statFiles.textContent  = formatNumber(stats.includedFiles);
  el.statSize.textContent   = formatSize(stats.totalSize);
  el.statTokens.textContent = '~' + formatNumber(Math.ceil(stats.totalSize / 3));
  el.statFormat.textContent = state.format.toUpperCase();

  // 语言分布
  const langEntries = Object.entries(stats.languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  el.languageStats.innerHTML = langEntries.length > 0
    ? '<h4 style="margin-bottom:0.5rem">文件类型分布</h4>' +
      langEntries.map(([ext, count]) =>
        `<div class="language-item">
           <span>${ext}</span>
           <span>${count} 个文件</span>
         </div>`
      ).join('')
    : '';

  // 警告
  if (stats.warnings.length > 0) {
    el.warningsCard.style.display = 'block';
    el.warningsList.innerHTML = stats.warnings.map(w => `<li>${w}</li>`).join('');
  } else {
    el.warningsCard.style.display = 'none';
  }

  // 省钱计算器（始终显示）
  const tokens      = Math.ceil(stats.totalSize / 3);
  const busters     = cacheDetection ? cacheDetection.detected.length : 0;
  el.savingsCard.style.display = 'block';
  el.savingsContent.innerHTML  = buildSavingsCard(tokens, busters);

  // 缓存破坏检测详情
  if (cacheDetection && cacheDetection.detected.length > 0) {
    el.cacheCard.style.display = 'block';
    el.cacheResults.innerHTML  =
      `<p style="margin-bottom:0.75rem">${cacheDetection.suggestions[0]}</p>` +
      '<ul style="margin-left:1.25rem;font-size:0.875rem">' +
      cacheDetection.suggestions.slice(1).map(s => `<li>${s}</li>`).join('') +
      '</ul>' +
      '<details style="margin-top:0.75rem">' +
      '<summary style="cursor:pointer;font-size:0.875rem">查看详细文件列表</summary>' +
      '<ul style="margin-left:1.25rem;margin-top:0.5rem;font-size:0.8rem">' +
      cacheDetection.detected.map(d =>
        `<li>
           <code>${d.path}</code>
           <span class="cache-severity ${d.severity.toLowerCase()}">${d.severity}</span>
         </li>`
      ).join('') +
      '</ul></details>';
  } else {
    el.cacheCard.style.display = 'none';
  }

  // 输出预览
  el.outputContent.textContent = state.output;
}

// ============================================
// 复制 / 下载
// ============================================

async function copyToClipboard() {
  if (!state.output) return;
  try {
    await navigator.clipboard.writeText(state.output);
    el.copyText.textContent = '✅ 已复制！';
    el.copyBtn.classList.add('btn-success');
    setTimeout(() => {
      el.copyText.textContent = '📋 复制到剪贴板';
      el.copyBtn.classList.remove('btn-success');
    }, 2000);
  } catch {
    showToast('复制失败，请手动选中后复制 (Ctrl+A, Ctrl+C)');
  }
}

function downloadFile() {
  if (!state.output) return;
  const ext      = FORMAT_EXTENSIONS[state.format];
  const baseName = (state.sourceLabel || state.file.name).replace(/\.zip$/i, '');
  const filename = baseName + ext;
  const blob     = new Blob([state.output], { type: 'text/plain;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// 重置
// ============================================

function resetState() {
  state = {
    file: null, output: null,
    format:      OUTPUT_FORMATS.MARKDOWN,
    detectCache: true,
    skipped:     [],
    sourceLabel: '',
    lastStats:   null,
  };

  el.fileInput.value               = '';
  el.repoUrl.value                 = '';
  el.fileInfo.style.display        = 'none';
  el.fileName.textContent          = '';
  el.fileSize.textContent          = '';
  el.optionsSection.style.display  = 'none';
  el.progressSection.style.display = 'none';
  el.resultsSection.style.display  = 'none';
  el.convertBtn.disabled           = false;
  el.warningsCard.style.display    = 'none';
  el.warningsList.innerHTML        = '';
  el.cacheCard.style.display       = 'none';
  el.cacheResults.innerHTML        = '';
  el.savingsCard.style.display     = 'none';
  el.savingsContent.innerHTML      = '';
  el.languageStats.innerHTML       = '';
  el.outputContent.textContent     = '';
  el.progressFill.style.width      = '0%';
  el.progressText.textContent      = '';

  const defaultRadio = document.querySelector('input[name="format"][value="markdown"]');
  if (defaultRadio) defaultRadio.checked = true;

  el.resultsSection.classList.remove('fade-in');
}

// ============================================
// 扩展消息接收（来自 Chrome Extension）
// ============================================

window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'REPO_COMPRESS_FETCH') return;

  const { repo, branch } = event.data;
  if (!repo) return;

  // 自动切换到远程 tab
  el.tabBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="remote"]').classList.add('active');
  el.tabLocal.classList.add('hidden');
  el.tabRemote.classList.remove('hidden');

  el.repoUrl.value = branch ? `${repo}@${branch}` : repo;
  await handleRemoteFetch();
});

console.log('[repo-compress] App initialized ✓');
