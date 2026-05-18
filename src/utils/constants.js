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
//
// 设计原则：
// - 不硬性拒绝用户输入，只发出警告
// - 用户自己的机器，由用户决定是否继续
// - 真正的瓶颈是 AI 的 context window，不是本工具
// - 单文件过大（如自动生成的 JSON）才跳过，避免输出无意义内容
// ============================================

export const FILE_SIZE_LIMITS = {
  // 单个文件超过此大小则跳过（通常是自动生成的文件，对 AI 没有意义）
  // 从 500KB 提升到 2MB
  MAX_FILE_SIZE: 2 * 1024 * 1024,

  // 总输出超过此大小时发出警告（不强制截断）
  // 提示用户可能超出 AI context window
  WARN_TOTAL_SIZE: 10 * 1024 * 1024,

  // 总输出超过此大小时发出更严重警告
  // 依然不拒绝，让用户自己决定
  WARN_LARGE_SIZE: 50 * 1024 * 1024,
};

// ============================================
// 输出格式配置
// ============================================

export const OUTPUT_FORMATS = {
  MARKDOWN: 'markdown',
  XML:      'xml',
  TXT:      'txt',
};

export const FORMAT_EXTENSIONS = {
  [OUTPUT_FORMATS.MARKDOWN]: '.md',
  [OUTPUT_FORMATS.XML]:      '.xml',
  [OUTPUT_FORMATS.TXT]:      '.txt',
};

// ============================================
// 缓存破坏向量检测
// ============================================

export const CACHE_BUSTERS = {
  // ISO 8601 时间戳
  TIMESTAMP: /["'`]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?["'`]/,

  // UUID v4
  RANDOM_ID: /["'`][0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["'`]/i,

  // 用户ID赋值
  USER_ID: /(?:user_id|userId|uid)\s*[:=]\s*\d{3,}/i,

  // 会话ID
  SESSION: /(?:session_id|sessionId|session_token)\s*[:=]\s*["'`][a-zA-Z0-9+/]{16,}["'`]/i,

  // 环境变量访问
  ENV_VAR: /(?:process\.env|import\.meta\.env)\.[A-Z_]{3,}/,

  // Git 提交哈希
  GIT_HASH: /(?:commit|sha|hash|revision)\s*[:=]\s*["'`]?[0-9a-f]{7,40}["'`]?/i,

  // Agent 列表
  AGENT_LIST: /agents?\s*[:=]\s*\[/i,

  // 工具列表
  TOOL_LIST: /tools?\s*[:=]\s*\[/i,
};

// ============================================
// 语言扩展名映射（用于代码高亮）
// ============================================

export const LANGUAGE_MAP = {
  '.js':         'javascript',
  '.ts':         'typescript',
  '.jsx':        'jsx',
  '.tsx':        'tsx',
  '.mjs':        'javascript',
  '.cjs':        'javascript',
  '.py':         'python',
  '.java':       'java',
  '.go':         'go',
  '.rs':         'rust',
  '.c':          'c',
  '.cpp':        'cpp',
  '.h':          'c',
  '.hpp':        'cpp',
  '.cs':         'csharp',
  '.css':        'css',
  '.scss':       'scss',
  '.less':       'less',
  '.html':       'html',
  '.json':       'json',
  '.yaml':       'yaml',
  '.yml':        'yaml',
  '.md':         'markdown',
  '.sh':         'bash',
  '.bash':       'bash',
  '.zsh':        'bash',
  '.xml':        'xml',
  '.sql':        'sql',
  '.rb':         'ruby',
  '.php':        'php',
  '.swift':      'swift',
  '.kt':         'kotlin',
  '.vue':        'vue',
  '.svelte':     'svelte',
  '.toml':       'toml',
  '.ini':        'ini',
  '.dockerfile': 'dockerfile',
  '.r':          'r',
  '.R':          'r',
  '.jl':         'julia',
  '.lua':        'lua',
  '.ps1':        'powershell',
  '.graphql':    'graphql',
  '.proto':      'protobuf',
};

// ============================================
// AI Token 估算
// ============================================

export const TOKEN_ESTIMATE = {
  CHARS_PER_TOKEN_ASCII: 4,
  CHARS_PER_TOKEN_CJK:   1.5,
};

// ============================================
// 统计信息模板
// ============================================

export const STATS_TEMPLATE = {
  totalFiles:    0,
  includedFiles: 0,
  totalSize:     0,
  estimatedTokens: 0,
  languages:     {},
  warnings:      [],
};
