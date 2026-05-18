/**
 * Web UI Application Logic
 *
 * 修复记录：
 * - 消除与 src/core/ 的代码重复，改为直接 import
 * - 修复 escapeCdata bug
 * - 加入省钱计算器展示
 * - 修复远程仓库 Failed to fetch（CORS）问题
 * - [本次] 移除文件大小硬性限制，改为警告
 */

import { validateZipData, parseZip } from '../core/parser.js';
import { filterFiles }               from '../core/filter.js';
import { convert }                   from '../core/converter.js';
import { detectCacheBusters }        from '../core/detector.js';
import { OUTPUT_FORMATS, FORMAT_EXTENSIONS } from '../utils/constants.js';
import { formatSize, formatNumber }  from '../utils/helpers.js';

// ============================================
// 定价常量
// ============================================

const PRICING = {
  INPUT_PER_M:       3.00,
  CACHE_READ_PER_M:  0.30,
  CACHE_WRITE_PER_M: 3.75,
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
  lastStats:   null,
  remoteFiles: null,
};

// ============================================
// DOM References
// ============================================

const el = {
  tabBtns:         document.querySelectorAll('.tab-btn'),
  tabLocal:        document.getElementById('tab-local'),
  tabRemote:       document.getElementById('tab-remote'),
  dropzone:        document.getElementById('dropzone'),
  fileInput:       document.getElementById('fileInput'),
  repoUrl:         document.getElementById('repoUrl'),
  githubToken:     document.getElementById('githubToken'),
  fetchBtn:        document.getElementById('fetchBtn'),
  tokenHelpBtn:    document.getElementById('tokenHelpBtn'),
  tokenHint:       document.getElementById('tokenHint'),
  fileInfo:        document.getElementById('fileInfo'),
  fileName:        document.getElementById('fileName'),
  fileSize:        document.getElementById('fileSize'),
  clearBtn:        document.getElementById('clearBtn'),
  optionsSection:  document.getElementById('optionsSection'),
  convertBtn:      document.getElementById('convertBtn'),
  detectCacheChk:  document.getElementById('detectCache'),
  progressSection: document.getElementById('progressSection'),
  progressFill:    document.getElementById('progressFill'),
  progressText:    document.getElementById('progressText'),
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
  savingsCard:     document.getElementById('savingsCard'),
  savingsContent:  document.getElementById('savingsContent'),
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
// Token Help & 持久化
// ============================================

el.tokenHelpBtn.addEventListener('click', () => {
  const hidden = el.tokenHint.style.display === 'none';
  el.tokenHint.style.display = hidden ? 'block' : 'none';
});

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

el.fetchBtn.addEventListener('click', handleRemoteFetch);
el.repoUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleRemoteFetch();
});

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
el.closeModal.addEventListener('click',  () => { el.helpModal.style.display = 'none'; });
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

  // validateZipData 只做格式校验，不限制大小
  const v = validateZipData(file);
  if (!v.valid) { showToast(v.error); return; }

  state.file        = file;
  state.remoteFiles = null;
  state.sourceLabel = file.name;
  showFileInfo(file.name, file.size);
}

// ============================================
// 远程仓库：解析输入
// ============================================

function parseRepoInput(input) {
  input = input.trim();

  const urlMatch = input.match(
    /github\.com\/([^/]+\/[^/]+?)(?:\/tree\/([^/]+))?(?:\/|$)/
  );
  if (urlMatch) {
    return { repo: urlMatch[1].replace(/\.git$/, ''), branch: urlMatch[2] || null };
  }

  const atMatch = input.match(/^([^@\s]+)@([^@\s]+)$/);
  if (atMatch) return { repo: atMatch[1], branch: atMatch[2] };

  if (/^[\w.-]+\/[\w.-]+$/.test(input)) return { repo: input, branch: null };

  return null;
}

// ============================================
// 远程仓库：通过 GitHub API 获取文件内容
// 完全避开 ZIP 下载的 CORS 问题
// ============================================

async function getDefaultBranch(repo, headers) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });

  if (res.status === 404) throw new Error(`仓库不存在: ${repo}`);
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub API 限流，请填写 Token 后重试（每小时 60→5000 次）');
  }
  if (!res.ok) throw new Error(`获取仓库信息失败 (HTTP ${res.status})`);

  const info = await res.json();
  return info.default_branch || 'main';
}

async function getFileTree(repo, branch, headers) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );

  if (res.status === 404) throw new Error(`分支不存在: ${branch}`);
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub API 限流，请填写 Token 后重试');
  }
  if (!res.ok) throw new Error(`获取文件树失败 (HTTP ${res.status})`);

  const data = await res.json();
  if (data.truncated) {
    console.warn('[Remote] Tree truncated, large repo');
  }

  return data.tree.filter(item => item.type === 'blob');
}

const BINARY_EXTS = new Set([
  '.jpg','.jpeg','.png','.gif','.webp','.ico','.bmp','.tiff','.avif',
  '.mp4','.mp3','.wav','.ogg','.webm','.mov','.avi','.mkv','.aac','.flac',
  '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx',
  '.zip','.tar','.gz','.7z','.rar','.bz2','.xz',
  '.exe','.dll','.so','.dylib','.bin','.wasm',
  '.woff','.woff2','.ttf','.eot','.otf',
  '.db','.sqlite','.sqlite3',
  '.pyc','.class','.jar','.apk','.ipa',
  '.map','.psd','.ai','.sketch','.fig','.blend',
]);

const SKIP_PREFIXES = [
  'node_modules/', 'bower_components/', 'vendor/',
  '.git/', '.svn/', '.hg/',
  'dist/', 'build/', 'out/', '.next/', '.nuxt/', 'coverage/',
  '.vscode/', '.idea/', '.cache/', '.turbo/', '.parcel-cache/',
  'logs/', 'tmp/', 'temp/',
];

function shouldSkipPath(path) {
  if (SKIP_PREFIXES.some(p => path.startsWith(p) || path.includes('/' + p))) {
    return true;
  }
  const dot = path.lastIndexOf('.');
  if (dot > 0) {
    const ext = path.slice(dot).toLowerCase();
    if (BINARY_EXTS.has(ext)) return true;
  }
  return false;
}

async function fetchFileContent(repo, sha, headers) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/blobs/${sha}`,
    { headers }
  );
  if (!res.ok) throw new Error(`获取文件失败 (HTTP ${res.status})`);

  const data = await res.json();

  if (data.encoding === 'base64') {
    const binaryStr = atob(data.content.replace(/\n/g, ''));
    const bytes     = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('latin1').decode(bytes);
    }
  }

  return data.content;
}

async function fetchRepoViaAPI(repo, branch, token, onProgress) {
  const headers = {
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  onProgress('获取仓库信息...', 10);
  const defaultBranch = branch || await getDefaultBranch(repo, headers);

  onProgress(`获取文件列表 (${repo}@${defaultBranch})...`, 20);
  const tree = await getFileTree(repo, defaultBranch, headers);

  // 单文件大小限制与 constants.js 保持一致（2MB）
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const candidates = tree.filter(item => {
    if (shouldSkipPath(item.path))    return false;
    if (item.size > MAX_FILE_SIZE)    return false;
    return true;
  });

  if (candidates.length === 0) {
    throw new Error('过滤后没有可用文件，请检查仓库内容');
  }

  onProgress(`共 ${candidates.length} 个文件，开始下载内容...`, 30);

  const BATCH_SIZE = 5;
  const files      = new Map();
  const skipped    = [];
  let   done       = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (item) => {
      try {
        const content = await fetchFileContent(repo, item.sha, headers);
        const name    = item.path.split('/').pop();
        const dot     = name.lastIndexOf('.');
        const ext     = dot > 0 ? name.slice(dot) : '';

        files.set(item.path, {
          path:      item.path,
          content,
          size:      content.length,
          name,
          extension: ext,
          encoding:  'utf-8',
        });
      } catch (err) {
        skipped.push({ path: item.path, reason: err.message });
      }
    }));

    done += batch.length;
    const pct = 30 + Math.round((done / candidates.length) * 60);
    onProgress(
      `已下载 ${done} / ${candidates.length} 个文件...`,
      Math.min(pct, 90)
    );
  }

  return { files, skipped, branch: defaultBranch };
}

// ============================================
// 远程仓库处理（入口）
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
  el.fetchBtn.textContent = '⏳ 获取中...';
  el.progressSection.style.display = 'block';

  try {
    const { files, skipped, branch } = await fetchRepoViaAPI(
      parsed.repo,
      parsed.branch,
      token,
      (text, pct) => setProgress(text, pct)
    );

    setProgress('下载完成！', 100);

    let totalBytes = 0;
    for (const f of files.values()) totalBytes += f.size;

    state.remoteFiles = { files, skipped };
    state.file        = { name: `${parsed.repo}@${branch}.zip` };
    state.sourceLabel = `${parsed.repo}@${branch}`;

    setTimeout(() => {
      el.progressSection.style.display = 'none';
      showFileInfo(state.sourceLabel, totalBytes);
      showToast(`✅ 已获取 ${files.size} 个文件（${parsed.repo}@${branch}）`, 'success');
    }, 300);

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
  if (!state.file && !state.remoteFiles) {
    showToast('请先选择文件或获取远程仓库');
    return;
  }

  el.optionsSection.style.display = 'none';
  el.convertBtn.disabled          = true;

  try {
    let files, skipped;

    if (state.remoteFiles) {
      setProgress('准备文件...', 20);
      files   = state.remoteFiles.files;
      skipped = state.remoteFiles.skipped;
    } else {
      setProgress('正在解析 ZIP 文件...', 15);
      const parsed = await parseZip(state.file);
      files   = parsed.files;
      skipped = parsed.skipped;
    }

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
      sourceFile: state.sourceLabel || state.file?.name || 'unknown',
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

function buildSavingsCard(tokens, cacheBusters) {
  const DAILY_QUERIES = 10;
  const MONTHLY_DAYS  = 22;
  const totalQueries  = DAILY_QUERIES * MONTHLY_DAYS;

  const costWithout    = (tokens / 1_000_000) * PRICING.INPUT_PER_M * totalQueries;
  const costCacheWrite = (tokens / 1_000_000) * PRICING.CACHE_WRITE_PER_M;
  const costCacheRead  = (tokens / 1_000_000) * PRICING.CACHE_READ_PER_M * (totalQueries - 1);
  const costWith       = costCacheWrite + costCacheRead;
  const saved          = costWithout - costWith;
  const savePct        = Math.round((saved / costWithout) * 100);

  const hasBusters  = cacheBusters > 0;
  const statusColor = hasBusters ? '#f59e0b' : '#10b981';
  const statusIcon  = hasBusters ? '⚠️' : '✅';
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
        <span class="savings-value savings-good">
          $${saved.toFixed(2)} <small>(${savePct}%)</small>
        </span>
      </div>
    </div>
    <div class="savings-status" style="border-color:${statusColor};color:${statusColor}">
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

  el.statFiles.textContent  = formatNumber(stats.includedFiles);
  el.statSize.textContent   = formatSize(stats.totalSize);
  el.statTokens.textContent = '~' + formatNumber(Math.ceil(stats.totalSize / 3));
  el.statFormat.textContent = state.format.toUpperCase();

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

  if (stats.warnings.length > 0) {
    el.warningsCard.style.display = 'block';
    el.warningsList.innerHTML = stats.warnings.map(w => `<li>${w}</li>`).join('');
  } else {
    el.warningsCard.style.display = 'none';
  }

  const tokens  = Math.ceil(stats.totalSize / 3);
  const busters = cacheDetection ? cacheDetection.detected.length : 0;
  el.savingsCard.style.display = 'block';
  el.savingsContent.innerHTML  = buildSavingsCard(tokens, busters);

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
  const baseName = (state.sourceLabel || state.file?.name || 'output').replace(/\.zip$/i, '');
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
    remoteFiles: null,
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
// 扩展消息接收（Chrome Extension）
// ============================================

window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'REPO_COMPRESS_FETCH') return;
  const { repo, branch } = event.data;
  if (!repo) return;

  el.tabBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="remote"]').classList.add('active');
  el.tabLocal.classList.add('hidden');
  el.tabRemote.classList.remove('hidden');

  el.repoUrl.value = branch ? `${repo}@${branch}` : repo;
  await handleRemoteFetch();
});

console.log('[repo-compress] App initialized ✓');
