/**
 * ZIP 解析器
 * 职责：解析 ZIP 文件，生成文件树
 *
 * 修复记录：
 * P0-1: 编码修复 —— 使用 uint8array + TextDecoder，正确处理 UTF-8 / UTF-16 / Latin-1
 * P0-2: binary 检测 —— 改为 extension whitelist + null byte 检测，消除误判
 * P0-5: [本次] 移除硬性文件大小限制，改为无上限（validateZipData 只做格式校验）
 */

import JSZip from 'jszip';
import { FILE_SIZE_LIMITS } from '../utils/constants.js';

// ============================================
// P0-2：Extension 白名单 / 黑名单
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
  '.md', '.mdx', '.rst', '.txt', '.text', '.adoc', '.asciidoc',
  '.tex', '.latex',
  '.sql', '.prisma',
  '.graphql', '.gql',
  '.vue', '.svelte', '.astro',
  '.lock',
  '.mod',
  '.sum',
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
  '.proto',
]);

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

const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp',
  '.tiff', '.tif', '.avif', '.heic', '.heif', '.raw',
  '.mp4', '.mp3', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.mkv', '.flv', '.wmv', '.aac', '.flac', '.m4a', '.m4v',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz', '.lz4',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib',
  '.wasm',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb',
  '.pyc', '.pyo', '.class', '.jar', '.war', '.ear',
  '.dex', '.apk', '.ipa', '.aab',
  '.map',
  '.pak', '.dat', '.cache', '.DS_Store', '.psd', '.ai', '.sketch',
  '.fig', '.blend', '.fbx', '.obj', '.stl',
]);

function shouldSkipFile(path, uint8) {
  const name = path.split('/').pop();
  const ext  = getExtension(name).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) {
    return { skip: true, reason: 'binary extension' };
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return { skip: false };
  }
  if (ext === '') {
    if (TEXT_FILENAMES.has(name.toLowerCase())) {
      return { skip: false };
    }
  }

  // 未知扩展名：null byte 检测
  const sampleLen = Math.min(uint8.length, 8000);
  for (let i = 0; i < sampleLen; i++) {
    if (uint8[i] === 0) {
      return { skip: true, reason: `unknown extension "${ext}", null byte detected` };
    }
  }

  return { skip: false };
}

// ============================================
// P0-1：编码检测 + 解码
// ============================================

function decodeBytes(uint8) {
  if (uint8.length >= 2) {
    if (uint8[0] === 0xFF && uint8[1] === 0xFE) {
      return {
        text:     new TextDecoder('utf-16le').decode(uint8.slice(2)),
        encoding: 'utf-16le',
      };
    }
    if (uint8[0] === 0xFE && uint8[1] === 0xFF) {
      return {
        text:     new TextDecoder('utf-16be').decode(uint8.slice(2)),
        encoding: 'utf-16be',
      };
    }
    if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
      return {
        text:     new TextDecoder('utf-8').decode(uint8.slice(3)),
        encoding: 'utf-8-bom',
      };
    }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
    return { text, encoding: 'utf-8' };
  } catch {
    const text = new TextDecoder('latin1').decode(uint8);
    return { text, encoding: 'latin1' };
  }
}

// ============================================
// 工具函数
// ============================================

function getExtension(name) {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return name.slice(lastDot);
}

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
 *
 * P0-5：只做格式合法性校验，不做大小限制。
 * 大文件的处理交给用户自己决定。
 * filter.js 会在过滤阶段跳过超大单文件，并发出警告。
 */
export function validateZipData(data) {
  if (!data) {
    return { valid: false, error: 'No data provided' };
  }

  const typeName  = data.constructor?.name ?? '';
  const validTypes = ['File', 'Blob', 'ArrayBuffer', 'Buffer', 'Uint8Array'];
  if (!validTypes.some(t => typeName.includes(t))) {
    return { valid: false, error: `Unsupported data type: ${typeName}` };
  }

  const size = getDataSize(data);
  if (size === 0) {
    return { valid: false, error: 'Empty file' };
  }

  // 不再有硬性大小上限
  // filter.js 会处理单文件过大的情况，并通过 warnings 通知用户
  return { valid: true };
}

/**
 * 剥离 ZIP 顶层目录（处理 GitHub 的 "repo-main/" 前缀）
 */
function stripTopLevelDir(paths) {
  if (paths.length === 0) return { paths, stripped: '' };

  const firstSegments = paths.map(p => p.split('/')[0]);
  const unique        = new Set(firstSegments);

  if (unique.size !== 1) return { paths, stripped: '' };

  const topDir = [...unique][0];
  if (!paths.every(p => p.includes('/'))) return { paths, stripped: '' };

  return {
    paths:   paths.map(p => p.slice(topDir.length + 1)),
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
 *   files:      Map<string, FileEntry>,
 *   structure:  Object,
 *   strippedDir: string,
 *   skipped:    Array<{path: string, reason: string}>
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
  const skipped  = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    let uint8;
    try {
      uint8 = await zipEntry.async('uint8array');
    } catch (error) {
      console.warn(`[Parser] Failed to read ${path}: ${error.message}`);
      skipped.push({ path, reason: `read error: ${error.message}` });
      continue;
    }

    // 单文件大小检查：超过 MAX_FILE_SIZE 跳过（通常是自动生成文件）
    // 注意：这里用字节数判断，MAX_FILE_SIZE 已提升到 2MB
    if (uint8.byteLength > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      const sizeMB = (uint8.byteLength / 1024 / 1024).toFixed(2);
      console.info(`[Parser] Skipping large file ${path} (${sizeMB}MB)`);
      skipped.push({
        path,
        reason: `file too large (${sizeMB}MB > ${FILE_SIZE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB limit per file)`,
      });
      continue;
    }

    const check = shouldSkipFile(path, uint8);
    if (check.skip) {
      console.info(`[Parser] Skipping ${path}: ${check.reason}`);
      skipped.push({ path, reason: check.reason });
      continue;
    }

    const { text, encoding } = decodeBytes(uint8);
    const name = path.split('/').pop();
    const ext  = getExtension(name);

    rawFiles.set(path, {
      path,
      content:  text,
      size:     text.length,
      name,
      extension: ext,
      encoding,
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

  // 同步更新 skipped 中的路径
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
