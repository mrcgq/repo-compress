/**
 * Web UI Application Logic
 * 新增：远程仓库支持（--remote）
 */

// ============================================
// 常量
// ============================================

const OUTPUT_FORMATS    = { MARKDOWN: 'markdown', XML: 'xml', TXT: 'txt' };
const FORMAT_EXTENSIONS = { markdown: '.md', xml: '.xml', txt: '.txt' };

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**', 'bower_components/**', 'vendor/**',
  '.git/**', '.svn/**', '.hg/**',
  'dist/**', 'build/**', 'out/**', '.next/**', '.nuxt/**', 'coverage/**',
  '*.min.js', '*.min.css', '*.bundle.js', '*.map', '*.d.ts.map',
  '*.exe', '*.dll', '*.so', '*.dylib', '*.pdf',
  '*.jpg', '*.jpeg', '*.png', '*.gif', '*.svg', '*.ico',
  '*.mp4', '*.mp3', '*.wav', '*.webp', '*.woff', '*.woff2', '*.ttf',
  '.vscode/**', '.idea/**', '*.swp', '.DS_Store',
  '*.log', 'logs/**', 'tmp/**', 'temp/**',
  '.env', '.env.*', '*.key', '*.pem',
  '*.db', '*.sqlite', '.cache/**', '.turbo/**',
];

const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE:   500 * 1024,
  MAX_TOTAL_SIZE:  10 * 1024 * 1024,
  WARN_TOTAL_SIZE:  5 * 1024 * 1024,
};

const LANGUAGE_MAP = {
  '.js': 'javascript', '.ts': 'typescript', '.jsx': 'jsx', '.tsx': 'tsx',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.fs': 'fsharp',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html', '.xml': 'xml', '.svg': 'xml',
  '.json': 'json', '.jsonc': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.mdx': 'markdown',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'bash',
  '.ps1': 'powershell',
  '.sql': 'sql', '.graphql': 'graphql',
  '.rb': 'ruby', '.php': 'php', '.lua': 'lua',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.kt': 'kotlin', '.swift': 'swift', '.scala': 'scala',
  '.r': 'r', '.R': 'r', '.jl': 'julia',
};

const CACHE_BUSTERS = {
  TIMESTAMP:  /["'`]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?["'`]/,
  RANDOM_ID:  /["'`][0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["'`]/i,
  USER_ID:    /(?:user_id|userId|uid)\s*[:=]\s*\d{3,}/i,
  SESSION:    /(?:session_id|sessionId|session_token)\s*[:=]\s*["'`][a-zA-Z0-9+/]{16,}["'`]/i,
  ENV_VAR:    /(?:process\.env|import\.meta\.env)\.[A-Z_]{3,}/,
  GIT_HASH:   /(?:commit|sha|hash|revision)\s*[:=]\s*["'`]?[0-9a-f]{7,40}["'`]?/i,
  AGENT_LIST: /agents?\s*[:=]\s*\[/i,
  TOOL_LIST:  /tools?\s*[:=]\s*\[/i,
};

// ============================================
// Binary / Text 判断
// ============================================

const TEXT_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.cts', '.mts',
  '.py', '.pyw', '.pyi',
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  '.go', '.rs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.cs', '.fs', '.vb', '.razor', '.cshtml',
  '.rb', '.php', '.pl', '.pm', '.lua',
  '.r', '.R', '.jl',
  '.swift', '.m', '.mm',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.bat', '.cmd',
  '.html', '.htm', '.xml', '.svg', '.xhtml', '.xsl', '.xslt',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.json', '.jsonc', '.json5', '.ndjson',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.csv', '.tsv',
  '.md', '.mdx', '.rst', '.txt', '.text', '.adoc',
  '.tex', '.latex',
  '.sql', '.prisma',
  '.graphql', '.gql',
  '.vue', '.svelte', '.astro',
  '.lock', '.mod', '.sum', '.properties', '.plist',
  '.podspec', '.gemspec',
  '.csproj', '.fsproj', '.vbproj', '.sln',
  '.editorconfig',
  '.eslintrc', '.prettierrc', '.stylelintrc',
  '.babelrc', '.swcrc',
  '.htaccess', '.gitmodules', '.gitattributes',
  '.npmrc', '.nvmrc', '.node-version', '.tool-versions',
]);

const TEXT_FILENAMES = new Set([
  'makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile',
  'brewfile', 'fastfile', 'podfile', 'cartfile',
  'procfile', 'caddyfile', 'jenkinsfile',
  'license', 'licence', 'notice', 'patents',
  'authors', 'contributors', 'maintainers',
  'readme', 'changelog', 'changes', 'history', 'news', 'todo',
  'copying', 'credits',
  '.gitignore', '.gitkeep', '.dockerignore', '.npmignore',
  '.eslintignore', '.prettierignore', '.stylelintignore',
  '.hgignore', '.svnignore',
  'robots.txt', 'humans.txt', 'security.txt',
]);

const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp',
  '.tiff', '.tif', '.avif', '.heic', '.raw',
  '.mp4', '.mp3', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.mkv', '.flv', '.wmv', '.aac', '.flac', '.m4a', '.m4v',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
  '.wasm',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.db', '.sqlite', '.sqlite3', '.mdb',
  '.pyc', '.pyo', '.class', '.jar', '.war',
  '.dex', '.apk', '.ipa', '.aab',
  '.map',
  '.pak', '.dat', '.psd', '.ai', '.sketch', '.fig',
  '.blend', '.fbx', '.stl',
]);

function getExtension(name) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return name.slice(lastDot);
}

function shouldSkipFile(path, uint8) {
  const name = path.split('/').pop();
  const ext  = getExtension(name).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext))  return { skip: true,  reason: 'binary extension' };
  if (TEXT_EXTENSIONS.has(ext))    return { skip: false };
  if (ext === '' && TEXT_FILENAMES.has(name.toLowerCase())) return { skip: false };
  const sampleLen = Math.min(uint8.length, 8000);
  for (let i = 0; i < sampleLen; i++) {
    if (uint8[i] === 0) return { skip: true, reason: `unknown extension "${ext}", null byte detected` };
  }
  return { skip: false };
}

// ============================================
// 编码检测 + 解码
// ============================================

function decodeBytes(uint8) {
  if (uint8.length >= 2) {
    if (uint8[0] === 0xFF && uint8[1] === 0xFE)
      return { text: new TextDecoder('utf-16le').decode(uint8.slice(2)), encoding: 'utf-16le' };
    if (uint8[0] === 0xFE && uint8[1] === 0xFF)
      return { text: new TextDecoder('utf-16be').decode(uint8.slice(2)), encoding: 'utf-16be' };
    if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF)
      return { text: new TextDecoder('utf-8').decode(uint8.slice(3)), encoding: 'utf-8-bom' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(uint8), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('latin1').decode(uint8), encoding: 'latin1' };
  }
}

// ============================================
// ZIP 解析
// ============================================

function validateZipData(data) {
  if (!data) return { valid: false, error: 'No data provided' };
  const size = typeof data.size === 'number' ? data.size
             : typeof data.byteLength === 'number' ? data.byteLength
             : data.length ?? 0;
  if (size === 0) return { valid: false, error: 'Empty file' };
  if (size > FILE_SIZE_LIMITS.MAX_TOTAL_SIZE)
    return { valid: false, error: `文件过大: ${(size / 1024 / 1024).toFixed(2)}MB（最大 10MB）` };
  return { valid: true };
}

function stripTopLevelDir(paths) {
  if (paths.length === 0) return { paths, stripped: '' };
  const first  = paths.map(p => p.split('/')[0]);
  const unique = new Set(first);
  if (unique.size !== 1) return { paths, stripped: '' };
  const topDir = [...unique][0];
  if (!paths.every(p => p.includes('/'))) return { paths, stripped: '' };
  return { paths: paths.map(p => p.slice(topDir.length + 1)), stripped: topDir };
}

async function parseZip(zipData) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip not loaded');

  const zip      = await JSZip.loadAsync(zipData);
  const rawFiles = new Map();
  const skipped  = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    let uint8;
    try {
      uint8 = await zipEntry.async('uint8array');
    } catch (err) {
      skipped.push({ path, reason: `read error: ${err.message}` });
      continue;
    }
    const check = shouldSkipFile(path, uint8);
    if (check.skip) {
      skipped.push({ path, reason: check.reason });
      continue;
    }
    const { text, encoding } = decodeBytes(uint8);
    const name = path.split('/').pop();
    const ext  = getExtension(name);
    rawFiles.set(path, { path, content: text, size: text.length, name, extension: ext, encoding });
  }

  const allPaths = Array.from(rawFiles.keys());
  const { paths: strippedPaths, stripped: strippedDir } = stripTopLevelDir(allPaths);

  const files = new Map();
  allPaths.forEach((orig, i) => {
    const newPath = strippedPaths[i];
    files.set(newPath, { ...rawFiles.get(orig), path: newPath });
  });

  if (strippedDir) {
    for (const item of skipped) {
      if (item.path.startsWith(strippedDir + '/'))
        item.path = item.path.slice(strippedDir.length + 1);
    }
  }

  return { files, skipped, strippedDir };
}

// ============================================
// 文件过滤
// ============================================

const patternCache = new Map();
function patternToRegex(pattern) {
  if (patternCache.has(pattern)) return patternCache.get(pattern);
  let s = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');
  if (!s.startsWith('.*')) s = '(^|/)' + s;
  if (!s.endsWith('.*'))   s = s + '($|/)';
  const r = new RegExp(s);
  patternCache.set(pattern, r);
  return r;
}

function matchesAny(path, patterns) {
  const n = path.replace(/\\/g, '/');
  return patterns.some(p => patternToRegex(p).test(n));
}

function filterFiles(files, options = {}) {
  const ignorePatterns  = [...DEFAULT_IGNORE_PATTERNS, ...(options.exclude || [])];
  const includePatterns = options.include?.length > 0 ? options.include : null;

  const stats = {
    totalFiles: files.size, includedFiles: 0,
    totalSize: 0, languages: {}, warnings: [],
  };
  const filtered = new Map();
  let totalSize  = 0;

  const sortedEntries = Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [path, file] of sortedEntries) {
    if (includePatterns && !matchesAny(path, includePatterns)) continue;
    if (matchesAny(path, ignorePatterns)) continue;
    if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      stats.warnings.push(
        `Skipped large file: ${path} (${(file.size / 1024).toFixed(1)}KB > ${FILE_SIZE_LIMITS.MAX_FILE_SIZE / 1024}KB limit)`
      );
      continue;
    }
    if (totalSize + file.size > FILE_SIZE_LIMITS.MAX_TOTAL_SIZE) {
      stats.warnings.push(
        `Total size limit reached. Some files skipped. Consider using include filters.`
      );
      break;
    }
    filtered.set(path, file);
    totalSize += file.size;
    const ext = file.extension || '(no ext)';
    stats.languages[ext] = (stats.languages[ext] || 0) + 1;
  }

  stats.includedFiles = filtered.size;
  stats.totalSize     = totalSize;

  if (totalSize > FILE_SIZE_LIMITS.WARN_TOTAL_SIZE) {
    stats.warnings.push(
      `Output is large (${(totalSize / 1024 / 1024).toFixed(2)}MB). AI context limits may be exceeded.`
    );
  }

  return { filtered, stats };
}

// ============================================
// Markdown fence 自适应
// ============================================

function safeMarkdownFence(content, lang = '') {
  let maxBackticks = 2;
  const matches = content.match(/`+/g);
  if (matches) {
    for (const m of matches) {
      if (m.length > maxBackticks) maxBackticks = m.length;
    }
  }
  const fence = '`'.repeat(maxBackticks + 1);
  return `${fence}${lang}\n${content}\n${fence}`;
}

// ============================================
// Manifest
// ============================================

function escapeMarkdownCell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildManifest(filteredFiles, stats, skipped = []) {
  const lines = [];
  lines.push('## 📋 File Manifest\n');
  lines.push(`- **Included**: ${stats.includedFiles} files`);
  lines.push(`- **Total in ZIP**: ${stats.totalFiles} files`);
  const totalSkipped = stats.totalFiles - stats.includedFiles;
  lines.push(totalSkipped > 0 ? `- **Skipped**: ${totalSkipped} files\n` : '');

  const filterWarnings = stats.warnings.filter(w =>
    w.includes('Skipped large file') || w.includes('Total size limit')
  );
  if (filterWarnings.length > 0) {
    lines.push('### ⚠️ Filter Warnings\n');
    for (const w of filterWarnings) lines.push(`- ${w}`);
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push('### 🚫 Skipped by Parser\n');
    lines.push('| File | Reason |');
    lines.push('|------|--------|');
    for (const { path, reason } of skipped.slice(0, 50)) {
      lines.push(`| \`${escapeMarkdownCell(path)}\` | ${escapeMarkdownCell(reason)} |`);
    }
    if (skipped.length > 50) lines.push(`| *(${skipped.length - 50} more not shown)* | |`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================
// 格式转换
// ============================================

function estimateTokens(bytes) { return Math.ceil(bytes / 3); }

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${u[i]}`;
}

function formatNumber(n) { return n.toLocaleString('zh-CN'); }

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeCdata(content) {
  return String(content).replace(/\]\]>/g, ']]>]]><![CDATA[');
}

function generateTree(files) {
  const tree = {};
  for (const path of files.keys()) {
    const parts = path.split('/').filter(Boolean);
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part   = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        current[part] = current[part] ?? null;
      } else {
        if (!current[part] || current[part] === null) current[part] = {};
        current = current[part];
      }
    }
  }
  const lines = [];
  function render(node, indent = '') {
    const entries = Object.entries(node).sort(([aN, aV], [bN, bV]) => {
      const aD = aV !== null ? 1 : 0;
      const bD = bV !== null ? 1 : 0;
      if (aD !== bD) return bD - aD;
      return aN.localeCompare(bN);
    });
    entries.forEach(([name, children], idx) => {
      const isLast      = idx === entries.length - 1;
      const connector   = isLast ? '└── ' : '├── ';
      const childIndent = isLast ? '    ' : '│   ';
      lines.push(indent + connector + name);
      if (children !== null && typeof children === 'object') render(children, indent + childIndent);
    });
  }
  render(tree);
  return lines.join('\n');
}

function convert(files, stats, format, meta = {}) {
  if (!files || files.size === 0) throw new Error('No files to convert');
  const sortedPaths = Array.from(files.keys()).sort((a, b) => a.localeCompare(b));
  switch (format) {
    case 'markdown': return convertToMarkdown(files, sortedPaths, stats, meta);
    case 'xml':      return convertToXML(files, sortedPaths, stats, meta);
    case 'txt':      return convertToText(files, sortedPaths, stats, meta);
    default: throw new Error(`Unknown format: ${format}`);
  }
}

function convertToMarkdown(files, sortedPaths, stats, meta) {
  const skipped = meta.skipped || [];
  const lines   = [];
  lines.push('# 📦 Repository Content\n');
  lines.push(`> Generated by repo-compress | ${new Date().toISOString()}\n`);
  if (meta.sourceFile) lines.push(`> Source: \`${meta.sourceFile}\`\n`);
  lines.push('---\n');
  lines.push('## 📊 Statistics\n');
  lines.push(`- **Total Files**: ${stats.includedFiles}`);
  lines.push(`- **Total Size**: ${(stats.totalSize / 1024).toFixed(2)} KB`);
  lines.push(`- **Estimated Tokens**: ~${estimateTokens(stats.totalSize)}\n`);

  if (Object.keys(stats.languages).length > 0) {
    lines.push('### 🗂️ File Types\n');
    const sorted = Object.entries(stats.languages).sort(([, a], [, b]) => b - a);
    for (const [ext, count] of sorted)
      lines.push(`- \`${ext || '(no ext)'}\`: ${count} file${count > 1 ? 's' : ''}`);
    lines.push('');
  }

  const generalWarnings = stats.warnings.filter(w =>
    !w.includes('Skipped large file') && !w.includes('Total size limit')
  );
  if (generalWarnings.length > 0) {
    lines.push('### ⚠️ Warnings\n');
    for (const w of generalWarnings) lines.push(`- ${w}`);
    lines.push('');
  }

  lines.push('---\n');
  lines.push(buildManifest(files, stats, skipped));
  lines.push('---\n');
  lines.push('## 📁 Directory Structure\n');
  lines.push('');
  lines.push(generateTree(files));
  lines.push('\n');
  lines.push('---\n');
  lines.push('## 📄 File Contents\n');

  for (const path of sortedPaths) {
    const file = files.get(path);
    const lang = LANGUAGE_MAP[file.extension] || '';
    lines.push(`### \`${path}\`\n`);
    lines.push(safeMarkdownFence(file.content, lang));
    lines.push('');
  }

  return lines.join('\n');
}

function convertToXML(files, sortedPaths, stats, meta) {
  const skipped = meta.skipped || [];
  const lines   = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<repository>');
  lines.push('  <metadata>');
  lines.push(`    <generated>${new Date().toISOString()}</generated>`);
  if (meta.sourceFile) lines.push(`    <sourceFile>${escapeXml(meta.sourceFile)}</sourceFile>`);
  lines.push(`    <includedFiles>${stats.includedFiles}</includedFiles>`);
  lines.push(`    <totalFiles>${stats.totalFiles}</totalFiles>`);
  lines.push(`    <totalSize>${stats.totalSize}</totalSize>`);
  lines.push(`    <estimatedTokens>${estimateTokens(stats.totalSize)}</estimatedTokens>`);
  lines.push('  </metadata>');

  if (skipped.length > 0 || stats.warnings.length > 0) {
    lines.push('  <manifest>');
    if (stats.warnings.length > 0) {
      lines.push('    <warnings>');
      for (const w of stats.warnings) lines.push(`      <warning>${escapeXml(w)}</warning>`);
      lines.push('    </warnings>');
    }
    if (skipped.length > 0) {
      lines.push('    <skipped>');
      for (const { path, reason } of skipped)
        lines.push(`      <file path="${escapeXml(path)}" reason="${escapeXml(reason)}"/>`);
      lines.push('    </skipped>');
    }
    lines.push('  </manifest>');
  }

  lines.push('  <files>');
  for (const path of sortedPaths) {
    const file    = files.get(path);
    const encAttr = file.encoding ? ` encoding="${escapeXml(file.encoding)}"` : '';
    lines.push(`    <file path="${escapeXml(path)}"${encAttr}>`);
    lines.push('      <content>');
    lines.push(`<![CDATA[${escapeCdata(file.content)}]]>`);
    lines.push('      </content>');
    lines.push('    </file>');
  }
  lines.push('  </files>');
  lines.push('</repository>');
  return lines.join('\n');
}

function convertToText(files, sortedPaths, stats, meta) {
  const skipped = meta.skipped || [];
  const D = '='.repeat(60);
  const d = '-'.repeat(60);
  const lines = [D, 'REPOSITORY CONTENT', D, `Generated: ${new Date().toISOString()}`];
  if (meta.sourceFile) lines.push(`Source: ${meta.sourceFile}`);
  lines.push(
    `Included: ${stats.includedFiles} / Total: ${stats.totalFiles}`,
    `Size: ${(stats.totalSize / 1024).toFixed(2)} KB`,
    `Estimated Tokens: ~${estimateTokens(stats.totalSize)}`,
    D, '',
  );
  if (skipped.length > 0) {
    lines.push('SKIPPED BY PARSER:');
    for (const { path, reason } of skipped.slice(0, 50)) lines.push(`  [${reason}] ${path}`);
    if (skipped.length > 50) lines.push(`  ...(${skipped.length - 50} more)`);
    lines.push('');
  }
  if (stats.warnings.length > 0) {
    lines.push('FILTER WARNINGS:');
    for (const w of stats.warnings) lines.push(`  - ${w}`);
    lines.push('');
  }
  lines.push(D, '');
  for (const path of sortedPaths) {
    const file = files.get(path);
    lines.push(d, `FILE: ${path}`);
    if (file.encoding && file.encoding !== 'utf-8') lines.push(`ENCODING: ${file.encoding}`);
    lines.push(d, file.content, '');
  }
  return lines.join('\n');
}

// ============================================
// Cache buster detection
// ============================================

function getSeverity(issues) {
  const HIGH = ['TIMESTAMP', 'RANDOM_ID', 'SESSION'];
  const MED  = ['ENV_VAR', 'GIT_HASH', 'USER_ID'];
  for (const i of issues) { if (HIGH.includes(i)) return 'HIGH'; }
  for (const i of issues) { if (MED.includes(i))  return 'MEDIUM'; }
  return 'LOW';
}

function detectCacheBusters(files) {
  const detected    = [];
  const issueCounts = {};
  for (const [path, file] of files) {
    const issues = [];
    for (const [type, pattern] of Object.entries(CACHE_BUSTERS)) {
      if (pattern.test(file.content)) issues.push(type);
    }
    if (issues.length > 0) {
      detected.push({ path, issues, severity: getSeverity(issues) });
      for (const issue of issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const suggestions = [];
  if (detected.length > 0) {
    suggestions.push(`⚠️ Found ${detected.length} file(s) with dynamic content that may break prompt caching.`);
    const msgs = {
      TIMESTAMP:  c => `🕒 ${c} file(s) with timestamps detected.`,
      RANDOM_ID:  c => `🎲 ${c} file(s) with UUID/random IDs detected.`,
      USER_ID:    c => `👤 ${c} file(s) with user IDs detected.`,
      SESSION:    c => `🔐 ${c} file(s) with session IDs detected.`,
      ENV_VAR:    c => `⚙️ ${c} file(s) with environment variable access detected.`,
      GIT_HASH:   c => `📌 ${c} file(s) with git hashes detected.`,
      AGENT_LIST: c => `🤖 ${c} file(s) with agent lists detected.`,
      TOOL_LIST:  c => `🛠️ ${c} file(s) with tool lists detected.`,
    };
    for (const [issue, count] of Object.entries(issueCounts)) {
      if (msgs[issue]) suggestions.push(msgs[issue](count));
    }
  }
  return { detected, suggestions };
}

// ============================================
// 远程仓库获取
// ============================================

/**
 * 解析仓库输入
 * 支持格式：
 *   owner/repo
 *   owner/repo@branch
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 */
function parseRepoInput(input) {
  input = input.trim();

  // 完整 GitHub URL
  const urlMatch = input.match(
    /github\.com\/([^/]+\/[^/]+?)(?:\/tree\/([^/]+))?(?:\/|$)/
  );
  if (urlMatch) {
    return {
      repo:   urlMatch[1].replace(/\.git$/, ''),
      branch: urlMatch[2] || null,
    };
  }

  // owner/repo@branch
  const atMatch = input.match(/^([^@\s]+)@([^@\s]+)$/);
  if (atMatch) {
    return { repo: atMatch[1], branch: atMatch[2] };
  }

  // owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(input)) {
    return { repo: input, branch: null };
  }

  return null;
}

/**
 * 尝试下载仓库 ZIP
 * 自动 fallback：main → master → HEAD
 */
async function fetchRepoZip(repo, preferredBranch, token) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // 先用 API 获取默认分支
  let defaultBranch = preferredBranch;
  if (!defaultBranch) {
    try {
      const infoRes = await fetch(
        `https://api.github.com/repos/${repo}`,
        { headers }
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        defaultBranch = info.default_branch || 'main';
      } else if (infoRes.status === 404) {
        throw new Error(`仓库不存在: ${repo}`);
      } else if (infoRes.status === 403) {
        throw new Error('GitHub API 限流，请提供 Token 后重试');
      }
    } catch (e) {
      if (e.message.includes('仓库') || e.message.includes('限流')) throw e;
      defaultBranch = 'main'; // 网络问题时直接猜
    }
  }

  // 下载 ZIP
  const branchesToTry = [defaultBranch, 'main', 'master'].filter(Boolean);
  const tried = new Set();

  for (const branch of branchesToTry) {
    if (tried.has(branch)) continue;
    tried.add(branch);

    const url = `https://api.github.com/repos/${repo}/zipball/${branch}`;
    const res = await fetch(url, { headers });

    if (res.ok) {
      const blob = await res.blob();
      return { blob, branch };
    }

    if (res.status === 404) continue; // 尝试下一个分支
    if (res.status === 403) throw new Error('GitHub API 限流，请提供 Token 后重试');
    throw new Error(`下载失败 (HTTP ${res.status})`);
  }

  throw new Error(`找不到可用分支（尝试了: ${[...tried].join(', ')}）`);
}

// ============================================
// State
// ============================================

let state = {
  file:        null,
  output:      null,
  format:      OUTPUT_FORMATS.MARKDOWN,
  detectCache: true,
  skipped:     [],
  sourceLabel: '',   // 显示给用户看的来源标签
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
    el.tabLocal.classList.toggle('hidden', tab !== 'local');
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
el.dropzone.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', e => handleLocalFile(e.target.files[0]));
el.dropzone.addEventListener('dragover', e => {
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
el.helpLink.addEventListener('click', e => { e.preventDefault(); el.helpModal.style.display = 'flex'; });
el.closeModal.addEventListener('click', () => { el.helpModal.style.display = 'none'; });
el.helpModal.addEventListener('click', e => { if (e.target === el.helpModal) el.helpModal.style.display = 'none'; });

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

  // 显示进度
  el.fetchBtn.disabled    = true;
  el.fetchBtn.textContent = '⏳ 下载中...';

  try {
    setProgress(`正在获取仓库信息: ${parsed.repo}`, 10);
    el.progressSection.style.display = 'block';

    const { blob, branch } = await fetchRepoZip(parsed.repo, parsed.branch, token);

    setProgress('下载完成，准备解析...', 30);

    // 构造 File 对象
    const fileName = `${parsed.repo.replace('/', '-')}@${branch}.zip`;
    const file     = new File([blob], fileName, { type: 'application/zip' });

    const v = validateZipData(file);
    if (!v.valid) throw new Error(v.error);

    state.file        = file;
    state.sourceLabel = `${parsed.repo}@${branch}`;
    showFileInfo(state.sourceLabel, file.size);

    // 隐藏进度条（还没开始转换）
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
    el.convertBtn.disabled          = false;
    el.progressSection.style.display = 'none';
    el.optionsSection.style.display  = 'block';
  }
}

function setProgress(text, percent) {
  el.progressSection.style.display = 'block';
  el.progressText.textContent      = text;
  el.progressFill.style.width      = `${percent}%`;
}

function showResults(stats, cacheDetection) {
  el.progressSection.style.display = 'none';
  el.resultsSection.style.display  = 'block';
  el.resultsSection.classList.add('fade-in');

  el.statFiles.textContent  = formatNumber(stats.includedFiles);
  el.statSize.textContent   = formatSize(stats.totalSize);
  el.statTokens.textContent = '~' + formatNumber(estimateTokens(stats.totalSize));
  el.statFormat.textContent = state.format.toUpperCase();

  const langEntries = Object.entries(stats.languages).sort(([, a], [, b]) => b - a).slice(0, 8);
  el.languageStats.innerHTML = langEntries.length > 0
    ? '<h4 style="margin-bottom:0.5rem">文件类型分布</h4>' +
      langEntries.map(([ext, count]) =>
        `<div class="language-item"><span>${ext}</span><span>${count} 个文件</span></div>`
      ).join('')
    : '';

  if (stats.warnings.length > 0) {
    el.warningsCard.style.display = 'block';
    el.warningsList.innerHTML = stats.warnings.map(w => `<li>${w}</li>`).join('');
  } else {
    el.warningsCard.style.display = 'none';
  }

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
        `<li><code>${d.path}</code> <span class="cache-severity ${d.severity.toLowerCase()}">${d.severity}</span></li>`
      ).join('') +
      '</ul></details>';
  } else {
    el.cacheCard.style.display = 'none';
  }

  el.outputContent.textContent = state.output;
}

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

function resetState() {
  state = {
    file: null, output: null,
    format: OUTPUT_FORMATS.MARKDOWN,
    detectCache: true, skipped: [], sourceLabel: '',
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
  // 只接受同源消息（扩展通过 content script 注入）
  if (event.data?.type !== 'REPO_COMPRESS_FETCH') return;

  const { repo, branch } = event.data;
  if (!repo) return;

  // 自动切换到远程 tab
  el.tabBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="remote"]').classList.add('active');
  el.tabLocal.classList.add('hidden');
  el.tabRemote.classList.remove('hidden');

  el.repoUrl.value = branch ? `${repo}@${branch}` : repo;

  // 自动触发获取
  await handleRemoteFetch();
});

console.log('[repo-compress] App initialized ✓');
