/**
 * 常量定义 - 单一真相源
 * 所有配置集中在此，禁止分散定义
 */

// ============================================
// 文件过滤规则
// ============================================

export const DEFAULT_IGNORE_PATTERNS = [
  // 依赖和包管理
  'node_modules/**',
  'bower_components/**',
  'vendor/**',
  'packages/**/node_modules/**',

  // 版本控制
  '.git/**',
  '.svn/**',
  '.hg/**',

  // 构建产物
  'dist/**',
  'build/**',
  'out/**',
  '.next/**',
  '.nuxt/**',
  'coverage/**',

  // 编译产物
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.map',
  '*.d.ts.map',

  // 二进制文件
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.pdf',

  // 媒体文件
  '*.jpg',
  '*.jpeg',
  '*.png',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.mp4',
  '*.mp3',
  '*.wav',
  '*.webp',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',

  // 编辑器和IDE
  '.vscode/**',
  '.idea/**',
  '*.swp',
  '*.swo',
  '*~',
  '.DS_Store',

  // 日志和临时文件
  '*.log',
  'logs/**',
  'tmp/**',
  'temp/**',
  '*.tmp',

  // 环境和配置（敏感）
  '.env',
  '.env.*',
  '*.key',
  '*.pem',
  '*.p12',

  // 数据库
  '*.db',
  '*.sqlite',
  '*.sqlite3',

  // 缓存
  '.cache/**',
  '*.cache',
  '.parcel-cache/**',
  '.turbo/**',
];

// ============================================
// 文件大小限制
// ============================================

export const FILE_SIZE_LIMITS = {
  // 单个文件最大 500KB
  MAX_FILE_SIZE: 500 * 1024,

  // 总输出最大 10MB
  MAX_TOTAL_SIZE: 10 * 1024 * 1024,

  // 警告阈值 5MB
  WARN_TOTAL_SIZE: 5 * 1024 * 1024,
};

// ============================================
// 输出格式配置
// ============================================

export const OUTPUT_FORMATS = {
  MARKDOWN: 'markdown',
  XML: 'xml',
  TXT: 'txt',
};

export const FORMAT_EXTENSIONS = {
  [OUTPUT_FORMATS.MARKDOWN]: '.md',
  [OUTPUT_FORMATS.XML]: '.xml',
  [OUTPUT_FORMATS.TXT]: '.txt',
};

// ============================================
// 缓存破坏向量检测
// 修复：收紧正则，降低误报率
// ============================================

export const CACHE_BUSTERS = {
  // ISO 8601 时间戳（精确匹配，避免匹配日期字符串变量名）
  TIMESTAMP: /["'`]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?["'`]/,

  // UUID v4 格式（严格匹配完整格式）
  RANDOM_ID: /["'`][0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["'`]/i,

  // 用户ID赋值（要求是赋值语句或键值对，且值是纯数字）
  USER_ID: /(?:user_id|userId|uid)\s*[:=]\s*\d{3,}/i,

  // 会话ID（赋值语句）
  SESSION: /(?:session_id|sessionId|session_token)\s*[:=]\s*["'`][a-zA-Z0-9+/]{16,}["'`]/i,

  // 环境变量访问（process.env 或 import.meta.env）
  ENV_VAR: /(?:process\.env|import\.meta\.env)\.[A-Z_]{3,}/,

  // Git 提交哈希（要求在特定上下文中：赋值或注释）
  GIT_HASH: /(?:commit|sha|hash|revision)\s*[:=]\s*["'`]?[0-9a-f]{7,40}["'`]?/i,

  // Agent 列表（数组赋值）
  AGENT_LIST: /agents?\s*[:=]\s*\[/i,

  // 工具列表（数组赋值）
  TOOL_LIST: /tools?\s*[:=]\s*\[/i,
};

// ============================================
// 语言扩展名映射（用于代码高亮）
// ============================================

export const LANGUAGE_MAP = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'jsx',
  '.tsx': 'tsx',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.xml': 'xml',
  '.sql': 'sql',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.toml': 'toml',
  '.ini': 'ini',
  '.dockerfile': 'dockerfile',
};

// ============================================
// AI Token 估算
// 修复：区分中英文，保守估算
// ============================================

export const TOKEN_ESTIMATE = {
  // 英文：1 token ≈ 4 字符
  CHARS_PER_TOKEN_ASCII: 4,
  // 中文：1 token ≈ 1.5 字符（保守估算）
  CHARS_PER_TOKEN_CJK: 1.5,
};

// ============================================
// 统计信息模板
// ============================================

export const STATS_TEMPLATE = {
  totalFiles: 0,
  includedFiles: 0,
  totalSize: 0,
  estimatedTokens: 0,
  languages: {},
  warnings: [],
};
