
/**
 * 文件过滤器
 * 职责：根据规则过滤文件
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

  const ignorePatterns = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(options.exclude || []),
  ];

  const includePatterns = options.include?.length > 0 ? options.include : null;

  const stats = {
    ...STATS_TEMPLATE,
    totalFiles: files.size,
    languages: {},
    warnings: [],
  };

  const filtered = new Map();
  let totalSize = 0;

  // 修复：按路径排序后再遍历，确保截断行为可预测
  // src/ 开头的文件排在前面，确保源码优先被包含
  const sortedEntries = Array.from(files.entries()).sort(([a], [b]) => {
    // src 目录优先
    const aIsSrc = a.startsWith('src/') ? 0 : 1;
    const bIsSrc = b.startsWith('src/') ? 0 : 1;
    if (aIsSrc !== bIsSrc) return aIsSrc - bIsSrc;
    return a.localeCompare(b);
  });

  for (const [path, file] of sortedEntries) {
    // 包含规则
    if (includePatterns && !matchesAny(path, includePatterns)) {
      continue;
    }

    // 排除规则
    if (matchesAny(path, ignorePatterns)) {
      continue;
    }

    // 单文件大小限制
    if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      stats.warnings.push(
        `Skipped large file: ${path} (${(file.size / 1024).toFixed(1)}KB > ${FILE_SIZE_LIMITS.MAX_FILE_SIZE / 1024}KB limit)`
      );
      continue;
    }

    // 总大小限制
    if (totalSize + file.size > FILE_SIZE_LIMITS.MAX_TOTAL_SIZE) {
      stats.warnings.push(
        `Total size limit reached (${(FILE_SIZE_LIMITS.MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)}MB). ` +
        `${files.size - filtered.size} file(s) skipped. Consider using --include to narrow scope.`
      );
      break;
    }

    filtered.set(path, file);
    totalSize += file.size;

    const ext = file.extension || '(no ext)';
    stats.languages[ext] = (stats.languages[ext] || 0) + 1;
  }

  stats.includedFiles = filtered.size;
  stats.totalSize = totalSize;

  if (totalSize > FILE_SIZE_LIMITS.WARN_TOTAL_SIZE) {
    stats.warnings.push(
      `Output is large (${(totalSize / 1024 / 1024).toFixed(2)}MB). AI context limits may be exceeded.`
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
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.jsx': 'React JSX',
    '.tsx': 'React TSX',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.sh': 'Shell',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.toml': 'TOML',
    '.sql': 'SQL',
    '.kt': 'Kotlin',
    '.swift': 'Swift',
  };

  return Object.entries(stats.languages)
    .map(([ext, count]) => ({
      extension: ext,
      name: languageNames[ext] || ext,
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
    .replace(/\*\*/g, '\x00')       // 临时占位
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');

  // 不以 .* 开头时，允许匹配路径中任意位置
  if (!regexStr.startsWith('.*')) {
    regexStr = '(^|/)' + regexStr;
  }

  // 结尾如果是目录模式（.* 结尾），不加 $；否则加 $
  if (!regexStr.endsWith('.*')) {
    regexStr = regexStr + '($|/)';
  }

  const regex = new RegExp(regexStr);
  patternCache.set(pattern, regex);
  return regex;
}
