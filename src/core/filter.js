/**
 * 文件过滤器
 * 职责：根据规则过滤文件
 *
 * 修复记录：
 * [本次] 移除硬性总大小截断，改为纯警告
 *        用户自己决定是否继续，工具不替用户做决定
 */

import { DEFAULT_IGNORE_PATTERNS, FILE_SIZE_LIMITS, STATS_TEMPLATE } from '../utils/constants.js';

/**
 * 过滤文件集合
 * @param {Map} files
 * @param {Object} options
 * @returns {{ filtered: Map, stats: Object }}
 */
export function filterFiles(files, options = {}) {
  if (!files || files.size === 0) {
    return {
      filtered: new Map(),
      stats: { ...STATS_TEMPLATE, warnings: ['No files to filter'] },
    };
  }

  const ignorePatterns  = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(options.exclude || []),
  ];
  const includePatterns = options.include?.length > 0 ? options.include : null;

  const stats = {
    ...STATS_TEMPLATE,
    totalFiles: files.size,
    languages:  {},
    warnings:   [],
  };

  const filtered = new Map();
  let   totalSize = 0;

  // 按字母序遍历，保证过滤行为可预测
  const sortedEntries = Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [path, file] of sortedEntries) {
    // 包含规则
    if (includePatterns && !matchesAny(path, includePatterns)) {
      continue;
    }

    // 排除规则
    if (matchesAny(path, ignorePatterns)) {
      continue;
    }

    // 单文件大小限制（在 parser.js 已经处理过一次，这里是 filter 层的防御）
    if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      stats.warnings.push(
        `Skipped large file: ${path} (${(file.size / 1024 / 1024).toFixed(2)}MB > ${FILE_SIZE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit per file)`
      );
      continue;
    }

    filtered.set(path, file);
    totalSize += file.size;

    const ext = file.extension || '(no ext)';
    stats.languages[ext] = (stats.languages[ext] || 0) + 1;
  }

  stats.includedFiles = filtered.size;
  stats.totalSize     = totalSize;

  // 总大小警告（只警告，不截断）
  if (totalSize > FILE_SIZE_LIMITS.WARN_LARGE_SIZE) {
    stats.warnings.push(
      `Output is very large (${(totalSize / 1024 / 1024).toFixed(2)}MB). ` +
      `Most AI context windows will be exceeded. Consider using --include to narrow scope.`
    );
  } else if (totalSize > FILE_SIZE_LIMITS.WARN_TOTAL_SIZE) {
    stats.warnings.push(
      `Output is large (${(totalSize / 1024 / 1024).toFixed(2)}MB). ` +
      `AI context limits may be exceeded. Consider using --include to narrow scope.`
    );
  }

  console.log(`[Filter] Kept ${filtered.size}/${files.size} files (${(totalSize / 1024).toFixed(1)}KB)`);

  return { filtered, stats };
}

/**
 * 获取语言统计的友好展示
 */
export function getLanguageStats(stats) {
  const languageNames = {
    '.js':     'JavaScript',
    '.ts':     'TypeScript',
    '.jsx':    'React JSX',
    '.tsx':    'React TSX',
    '.py':     'Python',
    '.java':   'Java',
    '.go':     'Go',
    '.rs':     'Rust',
    '.md':     'Markdown',
    '.json':   'JSON',
    '.css':    'CSS',
    '.scss':   'SCSS',
    '.html':   'HTML',
    '.vue':    'Vue',
    '.svelte': 'Svelte',
    '.rb':     'Ruby',
    '.php':    'PHP',
    '.sh':     'Shell',
    '.yaml':   'YAML',
    '.yml':    'YAML',
    '.toml':   'TOML',
    '.sql':    'SQL',
    '.kt':     'Kotlin',
    '.swift':  'Swift',
  };

  return Object.entries(stats.languages)
    .map(([ext, count]) => ({
      extension: ext,
      name:      languageNames[ext] || ext,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 检查路径是否匹配任意模式
 */
function matchesAny(path, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const normalizedPath = path.replace(/\\/g, '/');
  return patterns.some(pattern => patternToRegex(pattern).test(normalizedPath));
}

/**
 * 通配符转正则（带缓存）
 */
const patternCache = new Map();

function patternToRegex(pattern) {
  if (patternCache.has(pattern)) {
    return patternCache.get(pattern);
  }

  let regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');

  if (!regexStr.startsWith('.*')) {
    regexStr = '(^|/)' + regexStr;
  }

  if (!regexStr.endsWith('.*')) {
    regexStr = regexStr + '($|/)';
  }

  const regex = new RegExp(regexStr);
  patternCache.set(pattern, regex);
  return regex;
}
