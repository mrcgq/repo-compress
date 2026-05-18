
/**
 * ZIP 解析器
 * 职责：解析 ZIP 文件，生成文件树
 *
 * 修复：
 * P0-1: 编码修复 —— 使用 uint8array + TextDecoder，正确处理 UTF-8 / UTF-16 / Latin-1
 * P0-2: binary 检测 —— 改为 extension whitelist + null byte 检测，消除误判
 */

import JSZip from 'jszip';
import { FILE_SIZE_LIMITS } from '../utils/constants.js';

// ============================================
// P0-2：Extension 白名单 / 黑名单
// ============================================

/**
 * 已知文本文件扩展名（直接保留，不做内容检测）
 */
const TEXT_EXTENSIONS = new Set([
  // JavaScript 生态
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.cts', '.mts',
  // Python
  '.py', '.pyw', '.pyi',
  // JVM
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  // Go / Rust / C / C++
  '.go', '.rs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  // .NET
  '.cs', '.fs', '.vb', '.razor', '.cshtml',
  // Ruby / PHP / Perl / Lua
  '.rb', '.php', '.pl', '.pm', '.lua',
  // R / Julia
  '.r', '.R', '.jl',
  // Swift / ObjC
  '.swift', '.m', '.mm',
  // Shell
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.bat', '.cmd',
  // Web
  '.html', '.htm', '.xml', '.svg', '.xhtml', '.xsl', '.xslt',
  '.css', '.scss', '.sass', '.less', '.styl',
  // Data
  '.json', '.jsonc', '.json5', '.ndjson',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.csv', '.tsv',
  // Docs
  '.md', '.mdx', '.rst', '.txt', '.text', '.adoc', '.asciidoc',
  '.tex', '.latex',
  // Database
  '.sql', '.prisma',
  // GraphQL
  '.graphql', '.gql',
  // Frontend frameworks
  '.vue', '.svelte', '.astro',
  // Config / Dotfiles（无扩展名在下方单独处理）
  '.lock',         // Gemfile.lock / Cargo.lock
  '.mod',          // go.mod
  '.sum',          // go.sum
  '.gradle',
  '.properties',
  '.plist',
  '.podspec',
  '.gemspec',
  '.cabal',
  '.csproj', '.fsproj', '.vbproj', '.sln',
  '.pbxproj',
  '.editorconfig',
  '.eslintrc', '.prettierrc', '.stylelintrc',
  '.babelrc', '.swcrc', '.webpack',
  '.htaccess',
  '.gitmodules', '.gitattributes',
  '.npmrc', '.nvmrc', '.node-version', '.tool-versions',
  '.env',
]);

/**
 * 无扩展名但属于文本的常见文件名（精确匹配）
 */
const TEXT_FILENAMES = new Set([
  'makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile',
  'brewfile', 'fastfile', 'podfile', 'cartfile',
  'procfile', 'caddyfile', 'jenkinsfile',
  'license', 'licence', 'notice', 'patents',
  'authors', 'contributors', 'maintainers',
  'readme', 'changelog', 'changes', 'history', 'news', 'todo',
  'copying', 'credits', 'thanks',
  '.gitignore', '.gitkeep', '.dockerignore', '.npmignore',
  '.eslintignore', '.prettierignore', '.stylelintignore',
  '.hgignore', '.svnignore',
  'robots.txt', 'humans.txt', 'security.txt',
]);

/**
 * 已知二进制扩展名（直接跳过，不做内容检测）
 */
const BINARY_EXTENSIONS = new Set([
  // 图片
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp',
  '.tiff', '.tif', '.avif', '.heic', '.heif', '.raw',
  // 音视频
  '.mp4', '.mp3', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.mkv', '.flv', '.wmv', '.aac', '.flac', '.m4a', '.m4v',
  // 文档
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp',
  // 压缩包
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz', '.lz4',
  // 可执行 / 编译产物
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib',
  '.wasm',
  // 字体
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // 数据库
  '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb',
  // 编译缓存
  '.pyc', '.pyo', '.class', '.jar', '.war', '.ear',
  '.dex', '.apk', '.ipa', '.aab',
  // Source map（已在 ignore patterns，双重保险）
  '.map',
  // 其他
  '.pak', '.dat', '.cache', '.DS_Store', '.psd', '.ai', '.sketch',
  '.fig', '.blend', '.fbx', '.obj', '.stl',
]);

/**
 * 判断文件是否应该跳过
 * @param {string} path - 文件路径
 * @param {Uint8Array} uint8 - 原始字节
 * @returns {{ skip: boolean, reason?: string }}
 */
function shouldSkipFile(path, uint8) {
  const name = path.split('/').pop();
  const ext  = getExtension(name).toLowerCase();

  // 1. 已知二进制扩展名 → 直接跳过
  if (BINARY_EXTENSIONS.has(ext)) {
    return { skip: true, reason: 'binary extension' };
  }

  // 2. 已知文本扩展名 → 直接保留
  if (TEXT_EXTENSIONS.has(ext)) {
    return { skip: false };
  }

  // 3. 无扩展名 → 用小写文件名匹配已知文本文件名
  if (ext === '') {
    if (TEXT_FILENAMES.has(name.toLowerCase())) {
      return { skip: false };
    }
  }

  // 4. 未知扩展名 → 用 null byte 检测
  //    null byte (\0) 在文本文件中几乎不存在，在二进制中极常见
  const sampleLen = Math.min(uint8.length, 8000);
  for (let i = 0; i < sampleLen; i++) {
    if (uint8[i] === 0) {
      return { skip: true, reason: `unknown extension "${ext}", null byte detected` };
    }
  }

  // 5. 无 null byte → 当作文本处理
  return { skip: false };
}

// ============================================
// P0-1：编码检测 + 解码
// ============================================

/**
 * 将 Uint8Array 解码为字符串
 * 支持：UTF-8 / UTF-16 LE / UTF-16 BE / Latin-1 fallback
 *
 * @param {Uint8Array} uint8
 * @returns {{ text: string, encoding: string }}
 */
function decodeBytes(uint8) {
  // 检测 BOM
  if (uint8.length >= 2) {
    // UTF-16 LE BOM: FF FE
    if (uint8[0] === 0xFF && uint8[1] === 0xFE) {
      return {
        text: new TextDecoder('utf-16le').decode(uint8.slice(2)),
        encoding: 'utf-16le',
      };
    }
    // UTF-16 BE BOM: FE FF
    if (uint8[0] === 0xFE && uint8[1] === 0xFF) {
      return {
        text: new TextDecoder('utf-16be').decode(uint8.slice(2)),
        encoding: 'utf-16be',
      };
    }
    // UTF-8 BOM: EF BB BF（可选，但应处理）
    if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
      return {
        text: new TextDecoder('utf-8').decode(uint8.slice(3)),
        encoding: 'utf-8-bom',
      };
    }
  }

  // 尝试严格 UTF-8 解码（fatal: true 会在非法序列时抛出）
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
    return { text, encoding: 'utf-8' };
  } catch {
    // UTF-8 解码失败 → fallback Latin-1（单字节，永不失败）
    // 这保留了原始字节的可视表示，比乱码好
    const text = new TextDecoder('latin1').decode(uint8);
    return { text, encoding: 'latin1' };
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 获取文件扩展名（含点号，如 '.js'）
 * 隐藏文件（.gitignore）返回完整名称作为扩展名
 */
function getExtension(name) {
  const lastDot = name.lastIndexOf('.');
  // lastDot === 0 表示 ".gitignore" 这类隐藏文件，整个名字就是"扩展名"
  if (lastDot <= 0) return '';
  return name.slice(lastDot);
}

/**
 * 获取数据大小（兼容 File / Blob / ArrayBuffer / Buffer / Uint8Array）
 */
function getDataSize(data) {
  if (data == null) return 0;
  if (typeof data.size       === 'number') return data.size;
  if (typeof data.length     === 'number') return data.length;
  if (typeof data.byteLength === 'number') return data.byteLength;
  return 0;
}

// ============================================
// 公共 API
// ============================================

/**
 * 验证 ZIP 数据有效性
 */
export function validateZipData(data) {
  if (!data) {
    return { valid: false, error: 'No data provided' };
  }

  const typeName = data.constructor?.name ?? '';
  const validTypes = ['File', 'Blob', 'ArrayBuffer', 'Buffer', 'Uint8Array'];
  if (!validTypes.some(t => typeName.includes(t))) {
    return { valid: false, error: `Unsupported data type: ${typeName}` };
  }

  const size = getDataSize(data);
  if (size === 0) {
    return { valid: false, error: 'Empty file' };
  }
  if (size > FILE_SIZE_LIMITS.MAX_TOTAL_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: ${FILE_SIZE_LIMITS.MAX_TOTAL_SIZE / 1024 / 1024}MB)`,
    };
  }

  return { valid: true };
}

/**
 * 剥离 ZIP 顶层目录（处理 GitHub 的 "repo-main/" 前缀）
 */
function stripTopLevelDir(paths) {
  if (paths.length === 0) return { paths, stripped: '' };

  const firstSegments = paths.map(p => p.split('/')[0]);
  const unique = new Set(firstSegments);

  if (unique.size !== 1) return { paths, stripped: '' };

  const topDir = [...unique][0];
  if (!paths.every(p => p.includes('/'))) return { paths, stripped: '' };

  return {
    paths: paths.map(p => p.slice(topDir.length + 1)),
    stripped: topDir,
  };
}

/**
 * 添加路径到目录树
 */
function addToStructure(root, path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;

  let current = root;
  for (let i = 0; i < parts.length; i++) {
    const part   = parts[i];
    const isFile = i === parts.length - 1;

    if (isFile) {
      current.children.push({ name: part, type: 'file', path });
    } else {
      let child = current.children.find(c => c.name === part && c.type === 'directory');
      if (!child) {
        child = { name: part, type: 'directory', children: [] };
        current.children.push(child);
      }
      current = child;
    }
  }
}

/**
 * 解析 ZIP 文件
 *
 * @param {ArrayBuffer|Blob|File|Buffer} zipData
 * @returns {Promise<{
 *   files: Map<string, FileEntry>,
 *   structure: Object,
 *   strippedDir: string,
 *   skipped: Array<{path: string, reason: string}>
 * }>}
 */
export async function parseZip(zipData) {
  if (!zipData) throw new Error('ZIP data is required');

  let zip;
  try {
    zip = await JSZip.loadAsync(zipData);
  } catch (error) {
    throw new Error(`Failed to load ZIP: ${error.message}`);
  }

  const rawFiles = new Map();
  // P1-1：记录所有被跳过的文件及原因（供 manifest 使用）
  const skipped  = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    // P0-1：读取原始字节，不再使用 'string' 模式
    let uint8;
    try {
      uint8 = await zipEntry.async('uint8array');
    } catch (error) {
      console.warn(`[Parser] Failed to read ${path}: ${error.message}`);
      skipped.push({ path, reason: `read error: ${error.message}` });
      continue;
    }

    // P0-2：extension whitelist + null byte 检测
    const check = shouldSkipFile(path, uint8);
    if (check.skip) {
      console.info(`[Parser] Skipping ${path}: ${check.reason}`);
      skipped.push({ path, reason: check.reason });
      continue;
    }

    // P0-1：正确解码
    const { text, encoding } = decodeBytes(uint8);

    const name = path.split('/').pop();
    const ext  = getExtension(name);

    rawFiles.set(path, {
      path,
      content:  text,
      size:     text.length,
      name,
      extension: ext,
      encoding,           // 保留编码信息，供 manifest 展示
    });
  }

  // 剥离 GitHub ZIP 顶层目录
  const allPaths = Array.from(rawFiles.keys());
  const { paths: strippedPaths, stripped: strippedDir } = stripTopLevelDir(allPaths);

  const files = new Map();
  allPaths.forEach((originalPath, index) => {
    const newPath = strippedPaths[index];
    const file    = rawFiles.get(originalPath);
    files.set(newPath, { ...file, path: newPath });
  });

  // 同步更新 skipped 中的路径（剥离顶层目录后）
  if (strippedDir) {
    for (const item of skipped) {
      if (item.path.startsWith(strippedDir + '/')) {
        item.path = item.path.slice(strippedDir.length + 1);
      }
    }
  }

  // 构建目录树
  const structure = { name: 'root', type: 'directory', children: [] };
  for (const path of files.keys()) {
    addToStructure(structure, path);
  }

  console.log(
    `[Parser] Parsed ${files.size} files, skipped ${skipped.length}` +
    (strippedDir ? ` (stripped top dir: ${strippedDir}/)` : '')
  );

  return { files, structure, strippedDir, skipped };
}


