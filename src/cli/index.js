#!/usr/bin/env node

/**
 * repo-compress CLI
 * 新增：--remote 远程仓库支持
 */

import fs from 'fs';
import path from 'path';
import { parseZip, validateZipData } from '../core/parser.js';
import { filterFiles } from '../core/filter.js';
import { convert } from '../core/converter.js';
import { detectCacheBusters, generateCacheReport } from '../core/detector.js';
import { OUTPUT_FORMATS, FORMAT_EXTENSIONS } from '../utils/constants.js';
import { formatSize, formatNumber } from '../utils/helpers.js';

// ============================================
// 版本和帮助
// ============================================

const VERSION = '1.0.0';

const HELP_TEXT = `
🗜️  repo-compress v${VERSION}

将 GitHub 项目 ZIP 转换为 AI 友好的单文件格式

用法:
  repo-compress <input.zip> [options]
  repo-compress --remote <owner/repo> [options]

输入来源（二选一）:
  <input.zip>               本地 ZIP 文件路径
  -r, --remote <owner/repo> 远程 GitHub 仓库（自动下载）
                            支持格式：
                              owner/repo
                              owner/repo@branch
                              https://github.com/owner/repo

选项:
  -f, --format <type>      输出格式 (markdown|xml|txt)  默认: markdown
  -o, --output <file>      输出文件路径
  -i, --include <pattern>  只包含匹配的文件（可多次使用）
  -e, --exclude <pattern>  排除匹配的文件（可多次使用）
  -t, --token <token>      GitHub Personal Access Token
                           （避免 API 限流，也可用 GITHUB_TOKEN 环境变量）
  --no-cache-detect        禁用缓存破坏检测
  --stats                  显示详细统计信息
  -h, --help               显示帮助信息
  -v, --version            显示版本号

示例:
  # 本地 ZIP
  repo-compress project.zip
  repo-compress project.zip -f xml -o output.xml

  # 远程仓库（核心新功能）
  repo-compress --remote facebook/react
  repo-compress --remote facebook/react@main -f xml
  repo-compress -r vuejs/vue --stats

  # 只包含源码目录
  repo-compress --remote owner/repo -i "src/**" -i "*.md"

更多信息: https://github.com/yourusername/repo-compress
`;

// ============================================
// 参数解析
// ============================================

function parseArguments(args) {
  const options = {
    input:       null,
    remote:      null,   // owner/repo[@branch]
    token:       process.env.GITHUB_TOKEN || null,
    output:      null,
    format:      OUTPUT_FORMATS.MARKDOWN,
    include:     [],
    exclude:     [],
    detectCache: true,
    showStats:   false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 位置参数（输入文件）
    if (!arg.startsWith('-')) {
      if (!options.input) options.input = arg;
      continue;
    }

    // --remote / -r
    if (arg === '-r' || arg === '--remote') {
      options.remote = args[++i];
      continue;
    }

    // --token / -t
    if (arg === '-t' || arg === '--token') {
      options.token = args[++i];
      continue;
    }

    // --format / -f
    if (arg === '-f' || arg === '--format') {
      const format = args[++i];
      if (!Object.values(OUTPUT_FORMATS).includes(format)) {
        console.error(`❌ 无效格式 "${format}"，支持: markdown, xml, txt`);
        process.exit(1);
      }
      options.format = format;
      continue;
    }

    if (arg === '-o' || arg === '--output') { options.output  = args[++i]; continue; }
    if (arg === '-i' || arg === '--include') { options.include.push(args[++i]); continue; }
    if (arg === '-e' || arg === '--exclude') { options.exclude.push(args[++i]); continue; }
    if (arg === '--no-cache-detect') { options.detectCache = false; continue; }
    if (arg === '--stats') { options.showStats = true; continue; }

    console.error(`❌ 未知选项 "${arg}"`);
    console.log('使用 repo-compress --help 查看帮助');
    process.exit(1);
  }

  return options;
}

// ============================================
// 远程仓库下载
// ============================================

/**
 * 解析 owner/repo[@branch] 或完整 URL
 */
function parseRemoteInput(input) {
  input = input.trim();

  // 完整 URL
  const urlMatch = input.match(/github\.com\/([^/]+\/[^/]+?)(?:\/tree\/([^/]+))?(?:\/|$)/);
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

/**
 * 通过 GitHub API 下载仓库 ZIP
 * 自动 fallback：指定分支 → main → master
 */
async function downloadRemoteRepo(repo, preferredBranch, token) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': `repo-compress/${VERSION}`,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // 1. 获取默认分支
  let defaultBranch = preferredBranch;
  if (!defaultBranch) {
    process.stdout.write('   🔍 获取仓库信息...');
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });

    if (res.status === 404) throw new Error(`仓库不存在: ${repo}`);
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const msg   = reset
        ? `GitHub API 限流，将在 ${new Date(reset * 1000).toLocaleTimeString()} 后重置`
        : 'GitHub API 限流，请使用 --token 或 GITHUB_TOKEN 环境变量';
      throw new Error(msg);
    }
    if (!res.ok) throw new Error(`GitHub API 错误 (${res.status})`);

    const info  = await res.json();
    defaultBranch = info.default_branch || 'main';
    console.log(` 默认分支: ${defaultBranch}`);
  }

  // 2. 下载 ZIP，自动 fallback
  const branchesToTry = [...new Set([defaultBranch, 'main', 'master'].filter(Boolean))];

  for (const branch of branchesToTry) {
    const url = `https://api.github.com/repos/${repo}/zipball/${branch}`;
    process.stdout.write(`   📥 下载 ${repo}@${branch}...`);

    const res = await fetch(url, { headers });

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer      = Buffer.from(arrayBuffer);
      console.log(` ${formatSize(buffer.length)}`);
      return { buffer, branch };
    }

    if (res.status === 404) {
      console.log(' (分支不存在，尝试其他分支)');
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub API 限流，请使用 --token 或设置 GITHUB_TOKEN 环境变量');
    }
    throw new Error(`下载失败 (HTTP ${res.status})`);
  }

  throw new Error(`找不到可用分支（尝试了: ${branchesToTry.join(', ')}）`);
}

// ============================================
// 主流程
// ============================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`v${VERSION}`);
    process.exit(0);
  }

  const options = parseArguments(args);

  // 验证：至少提供一个输入来源
  if (!options.input && !options.remote) {
    console.error('❌ 请指定输入文件或使用 --remote 指定远程仓库');
    console.log('使用 repo-compress --help 查看帮助');
    process.exit(1);
  }

  // 不能同时指定两个
  if (options.input && options.remote) {
    console.error('❌ 不能同时指定本地文件和 --remote');
    process.exit(1);
  }

  try {
    await runConversion(options);
  } catch (error) {
    console.error(`\n❌ 失败: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

async function runConversion(options) {
  console.log('\n🗜️  repo-compress');
  console.log('━'.repeat(50));

  let zipData;
  let sourceLabel;

  // ── 本地文件 ──────────────────────────────
  if (options.input) {
    if (!fs.existsSync(options.input)) {
      throw new Error(`文件不存在: ${options.input}`);
    }
    console.log(`\n📂 读取文件: ${options.input}`);
    zipData     = fs.readFileSync(options.input);
    sourceLabel = path.basename(options.input);

    const v = validateZipData(zipData);
    if (!v.valid) throw new Error(v.error);
    console.log(`   大小: ${formatSize(zipData.length)}`);
  }

  // ── 远程仓库 ──────────────────────────────
  if (options.remote) {
    const parsed = parseRemoteInput(options.remote);
    if (!parsed) {
      throw new Error(`格式不正确: "${options.remote}"，请使用 owner/repo 或 owner/repo@branch`);
    }

    console.log(`\n🌐 远程仓库: ${parsed.repo}${parsed.branch ? `@${parsed.branch}` : ''}`);
    if (!options.token) {
      console.log('   ⚠️  未提供 Token，使用匿名请求（限流：60次/小时）');
      console.log('   💡 使用 --token <token> 或设置 GITHUB_TOKEN 环境变量可提高限制');
    }

    const { buffer, branch } = await downloadRemoteRepo(
      parsed.repo,
      parsed.branch,
      options.token
    );

    zipData     = buffer;
    sourceLabel = `${parsed.repo}@${branch}`;

    // 自动生成输出文件名
    if (!options.output) {
      const safeBase = parsed.repo.replace('/', '-') + `@${branch}`;
      options.output = safeBase + FORMAT_EXTENSIONS[options.format];
    }
  }

  // ── 解析 ZIP ──────────────────────────────
  console.log('\n⚙️  解析 ZIP 文件...');
  const { files, skipped } = await parseZip(zipData);
  console.log(`   找到 ${files.size} 个文件，跳过 ${skipped.length} 个（二进制/不可读）`);

  // ── 过滤 ──────────────────────────────────
  console.log('\n🔍 过滤文件...');
  const { filtered, stats } = filterFiles(files, {
    include: options.include.length > 0 ? options.include : null,
    exclude: options.exclude,
  });
  console.log(`   保留 ${filtered.size} 个文件，总大小: ${formatSize(stats.totalSize)}`);

  // ── 缓存检测 ──────────────────────────────
  let cacheDetection = null;
  if (options.detectCache) {
    console.log('\n🔍 检测缓存破坏向量...');
    cacheDetection = detectCacheBusters(filtered);
    if (cacheDetection.detected.length > 0) {
      console.log(`   ⚠️  发现 ${cacheDetection.detected.length} 个文件包含动态内容`);
    } else {
      console.log('   ✅ 未发现缓存破坏向量');
    }
  }

  // ── 转换 ──────────────────────────────────
  console.log(`\n📝 生成 ${options.format.toUpperCase()} 格式...`);
  const meta   = { skipped, sourceFile: sourceLabel };
  const output = convert(filtered, stats, options.format, meta);
  console.log(`   输出大小: ${formatSize(output.length)}`);
  console.log(`   预估 Token: ~${formatNumber(Math.ceil(output.length / 4))}`);

  // ── 输出文件路径 ──────────────────────────
  if (!options.output) {
    const ext      = FORMAT_EXTENSIONS[options.format];
    options.output = options.input.replace(/\.zip$/i, ext);
  }

  // ── 写入 ──────────────────────────────────
  console.log(`\n💾 保存到: ${options.output}`);
  fs.writeFileSync(options.output, output, 'utf8');

  // ── 统计 ──────────────────────────────────
  if (options.showStats) showDetailedStats(stats, cacheDetection);
  if (stats.warnings.length > 0) {
    console.log('\n⚠️  警告:');
    stats.warnings.forEach(w => console.log(`   ${w}`));
  }

  console.log('\n✅ 转换完成！');
  console.log('━'.repeat(50));
  console.log('\n💡 将文件内容粘贴给 AI 进行分析\n');
}

// ============================================
// 详细统计
// ============================================

function showDetailedStats(stats, cacheDetection) {
  console.log('\n📊 详细统计:');
  console.log('━'.repeat(50));
  console.log(`\n文件统计:`);
  console.log(`  总文件数:   ${formatNumber(stats.totalFiles)}`);
  console.log(`  包含文件数: ${formatNumber(stats.includedFiles)}`);
  console.log(`  过滤掉:     ${formatNumber(stats.totalFiles - stats.includedFiles)}`);
  console.log(`\n大小统计:`);
  console.log(`  总大小:     ${formatSize(stats.totalSize)}`);
  console.log(`  预估 Token: ${formatNumber(Math.ceil(stats.totalSize / 4))}`);

  if (Object.keys(stats.languages).length > 0) {
    console.log(`\n文件类型分布:`);
    Object.entries(stats.languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([ext, count]) => {
        const bar = '█'.repeat(Math.ceil(count / 2));
        console.log(`  ${(ext || 'no ext').padEnd(12)} ${String(count).padStart(4)} ${bar}`);
      });
  }

  if (cacheDetection && cacheDetection.detected.length > 0) {
    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    cacheDetection.detected.forEach(item => bySeverity[item.severity]++);
    console.log(`\n缓存破坏检测:`);
    if (bySeverity.HIGH)   console.log(`  🚨 高严重度: ${bySeverity.HIGH}`);
    if (bySeverity.MEDIUM) console.log(`  ⚠️  中严重度: ${bySeverity.MEDIUM}`);
    if (bySeverity.LOW)    console.log(`  ℹ️  低严重度: ${bySeverity.LOW}`);
    console.log(`\n  建议:`);
    cacheDetection.suggestions.slice(0, 3).forEach(s => console.log(`  • ${s}`));
  }

  console.log('━'.repeat(50));
}

// ============================================
// 运行
// ============================================

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
