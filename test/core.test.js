/**
 * Core functionality tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseZip, validateZipData } from '../src/core/parser.js';
import { filterFiles } from '../src/core/filter.js';
import { convert } from '../src/core/converter.js';
import { detectCacheBusters } from '../src/core/detector.js';
import { OUTPUT_FORMATS, FILE_SIZE_LIMITS } from '../src/utils/constants.js';

// ============================================
// Parser Tests
// ============================================

describe('Parser', () => {

  test('validateZipData - should reject null data', () => {
    const result = validateZipData(null);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /No data provided/);
  });

  test('validateZipData - should reject empty data', () => {
    const emptyBuffer = new ArrayBuffer(0);
    const result = validateZipData(emptyBuffer);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /Empty file/);
  });

  test('validateZipData - should accept valid data', () => {
    const validBuffer = new ArrayBuffer(1024);
    const result = validateZipData(validBuffer);
    assert.strictEqual(result.valid, true);
  });

  test('validateZipData - should accept large files without size limit', () => {
    // validateZipData 不再限制文件大小
    // 大文件由 filter.js 在过滤阶段以警告方式处理，不硬性拒绝
    const largeBuffer = new Uint8Array(FILE_SIZE_LIMITS.WARN_TOTAL_SIZE + 1);
    const result = validateZipData(largeBuffer);
    assert.strictEqual(result.valid, true, 'Large files should be accepted, not rejected');
  });
});

// ============================================
// Filter Tests
// ============================================

describe('Filter', () => {

  test('filterFiles - should return empty when no files provided', () => {
    const { filtered, stats } = filterFiles(new Map());
    assert.strictEqual(filtered.size, 0);
    assert.strictEqual(stats.totalFiles, 0);
  });

  test('filterFiles - should filter out ignored patterns', () => {
    const files = new Map([
      ['src/index.js',        { path: 'src/index.js',        content: 'code',   size: 4, extension: '.js' }],
      ['node_modules/lib.js', { path: 'node_modules/lib.js', content: 'lib',    size: 3, extension: '.js' }],
      ['.git/config',         { path: '.git/config',         content: 'config', size: 6, extension: '' }],
    ]);

    const { filtered } = filterFiles(files);
    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
    assert.ok(!filtered.has('node_modules/lib.js'));
    assert.ok(!filtered.has('.git/config'));
  });

  test('filterFiles - should respect include patterns', () => {
    const files = new Map([
      ['src/index.js', { path: 'src/index.js', content: 'code',   size: 4, extension: '.js' }],
      ['test/test.js', { path: 'test/test.js', content: 'test',   size: 4, extension: '.js' }],
      ['README.md',    { path: 'README.md',    content: 'readme', size: 6, extension: '.md' }],
    ]);

    const { filtered } = filterFiles(files, { include: ['src/**'] });
    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
  });

  test('filterFiles - should respect exclude patterns', () => {
    const files = new Map([
      ['src/index.js',      { path: 'src/index.js',      content: 'code', size: 4, extension: '.js' }],
      ['src/index.test.js', { path: 'src/index.test.js', content: 'test', size: 4, extension: '.js' }],
    ]);

    const { filtered } = filterFiles(files, { exclude: ['**/*.test.js'] });
    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
    assert.ok(!filtered.has('src/index.test.js'));
  });

  test('filterFiles - should collect language stats', () => {
    const files = new Map([
      ['index.js',  { path: 'index.js',  content: 'js',  size: 2, extension: '.js' }],
      ['style.css', { path: 'style.css', content: 'css', size: 3, extension: '.css' }],
      ['app.js',    { path: 'app.js',    content: 'js2', size: 3, extension: '.js' }],
    ]);

    const { stats } = filterFiles(files);
    assert.strictEqual(stats.languages['.js'],  2);
    assert.strictEqual(stats.languages['.css'], 1);
  });
});

// ============================================
// Converter Tests
// ============================================

describe('Converter', () => {

  const sampleFiles = new Map([
    ['test.js', {
      path:      'test.js',
      content:   'console.log("hello");',
      size:      21,
      extension: '.js',
      name:      'test.js',
    }],
  ]);

  const sampleStats = {
    totalFiles:    1,
    includedFiles: 1,
    totalSize:     21,
    languages:     { '.js': 1 },
    warnings:      [],
  };

  test('convert - should throw on empty files', () => {
    assert.throws(
      () => convert(new Map(), sampleStats, OUTPUT_FORMATS.MARKDOWN),
      /No files to convert/
    );
  });

  test('convert - should generate markdown format', () => {
    const output = convert(sampleFiles, sampleStats, OUTPUT_FORMATS.MARKDOWN);
    assert.ok(output.includes('# 📦 Repository Content'));
    assert.ok(output.includes('## 📊 Statistics'));
    // 无缓存检测数据时，标题固定为 Stable Zone 版本
    assert.ok(output.includes('## 📄 File Contents'));
    assert.ok(output.includes('console.log("hello");'));
  });

  test('convert - should generate XML format', () => {
    const output = convert(sampleFiles, sampleStats, OUTPUT_FORMATS.XML);
    assert.ok(output.includes('<?xml version="1.0"'));
    assert.ok(output.includes('<repository>'));
    assert.ok(output.includes('<file path="test.js">'));
    assert.ok(output.includes('console.log("hello");'));
  });

  test('convert - should generate plain text format', () => {
    const output = convert(sampleFiles, sampleStats, OUTPUT_FORMATS.TXT);
    assert.ok(output.includes('REPOSITORY CONTENT'));
    assert.ok(output.includes('FILE: test.js'));
    assert.ok(output.includes('console.log("hello");'));
  });

  test('convert - output should be deterministic (same order every time)', () => {
    const files = new Map([
      ['z.js', { path: 'z.js', content: 'z', size: 1, extension: '.js', name: 'z.js' }],
      ['a.js', { path: 'a.js', content: 'a', size: 1, extension: '.js', name: 'a.js' }],
      ['m.js', { path: 'm.js', content: 'm', size: 1, extension: '.js', name: 'm.js' }],
    ]);
    const stats = {
      totalFiles: 3, includedFiles: 3, totalSize: 3, languages: {}, warnings: [],
    };

    const out1 = convert(files, stats, OUTPUT_FORMATS.TXT);
    const out2 = convert(files, stats, OUTPUT_FORMATS.TXT);
    assert.strictEqual(out1, out2);

    const aIdx = out1.indexOf('FILE: a.js');
    const mIdx = out1.indexOf('FILE: m.js');
    const zIdx = out1.indexOf('FILE: z.js');
    assert.ok(aIdx < mIdx && mIdx < zIdx, 'Files should be in alphabetical order');
  });

  test('convert - XML CDATA should handle ]]> in content', () => {
    const files = new Map([
      ['tricky.js', {
        path:      'tricky.js',
        content:   'const x = "]]>some tricky content";',
        size:      36,
        extension: '.js',
        name:      'tricky.js',
      }],
    ]);
    const stats = {
      totalFiles: 1, includedFiles: 1, totalSize: 36, languages: {}, warnings: [],
    };

    const output = convert(files, stats, OUTPUT_FORMATS.XML);
    assert.ok(output.includes(']]>]]><![CDATA['), 'CDATA should be properly escaped');
    assert.ok(output.includes('</repository>'),   'XML should close properly');
  });

  test('convert - should include stats in all formats', () => {
    const formats = [OUTPUT_FORMATS.MARKDOWN, OUTPUT_FORMATS.XML, OUTPUT_FORMATS.TXT];
    for (const format of formats) {
      const output = convert(sampleFiles, sampleStats, format);
      assert.ok(output.length > 0, `${format} output should not be empty`);
    }
  });

  // ── BOUNDARY 物理隔离测试（捍卫核心重构） ──────────────────────────────

  test('convert - Markdown 格式下，应该自动将脏文件隔离在 BOUNDARY 物理墙下方', () => {
    const files = new Map([
      ['src/clean.js', {
        path:      'src/clean.js',
        content:   'const x = 1;',
        size:      12,
        extension: '.js',
        name:      'clean.js',
      }],
      ['src/dirty.js', {
        path:      'src/dirty.js',
        content:   'const time = "2026-05-20T14:15:14Z";',
        size:      36,
        extension: '.js',
        name:      'dirty.js',
      }],
    ]);
    const stats = {
      totalFiles:    2,
      includedFiles: 2,
      totalSize:     48,
      languages:     { '.js': 2 },
      warnings:      [],
    };
    const cacheDetection = {
      detected: [{ path: 'src/dirty.js', severity: 'HIGH', issues: ['TIMESTAMP'] }],
      suggestions: ['移除时间戳'],
    };

    const output = convert(files, stats, OUTPUT_FORMATS.MARKDOWN, {}, cacheDetection);

    const cleanIdx    = output.indexOf('src/clean.js');
    const boundaryIdx = output.indexOf('==================== BOUNDARY ====================');
    const dirtyIdx    = output.indexOf('src/dirty.js');

    assert.ok(cleanIdx    !== -1, '应该包含干净文件路径');
    assert.ok(boundaryIdx !== -1, '应该包含物理隔离边界墙');
    assert.ok(dirtyIdx    !== -1, '应该包含脏文件路径');
    assert.ok(
      cleanIdx < boundaryIdx,
      `干净文件（pos:${cleanIdx}）应在边界墙（pos:${boundaryIdx}）上方（稳定区）`,
    );
    assert.ok(
      boundaryIdx < dirtyIdx,
      `边界墙（pos:${boundaryIdx}）应在脏文件（pos:${dirtyIdx}）上方`,
    );
  });

  test('convert - Markdown 格式下，无动态文件时不应插入 BOUNDARY 边界墙', () => {
    const files = new Map([
      ['src/a.js', {
        path: 'src/a.js', content: 'const x = 1;',
        size: 12, extension: '.js', name: 'a.js',
      }],
      ['src/b.js', {
        path: 'src/b.js', content: 'const y = 2;',
        size: 12, extension: '.js', name: 'b.js',
      }],
    ]);
    const stats = {
      totalFiles: 2, includedFiles: 2, totalSize: 24, languages: { '.js': 2 }, warnings: [],
    };
    // 传入空的 cacheDetection（无动态文件）
    const cacheDetection = { detected: [], suggestions: [] };

    const output = convert(files, stats, OUTPUT_FORMATS.MARKDOWN, {}, cacheDetection);

    assert.ok(
      !output.includes('==================== BOUNDARY ===================='),
      '无动态文件时不应插入 BOUNDARY 边界墙',
    );
    assert.ok(
      !output.includes('Dynamic Zone'),
      '无动态文件时不应出现 Dynamic Zone 区块',
    );
  });

  test('convert - Markdown 格式下，LOW 级动态文件不应被隔离到动态区', () => {
    const files = new Map([
      ['src/low.js', {
        path: 'src/low.js', content: 'const agents = [1, 2, 3];',
        size: 25, extension: '.js', name: 'low.js',
      }],
    ]);
    const stats = {
      totalFiles: 1, includedFiles: 1, totalSize: 25, languages: { '.js': 1 }, warnings: [],
    };
    // LOW 级不触发物理隔离
    const cacheDetection = {
      detected: [{ path: 'src/low.js', severity: 'LOW', issues: ['AGENTS'] }],
      suggestions: [],
    };

    const output = convert(files, stats, OUTPUT_FORMATS.MARKDOWN, {}, cacheDetection);

    assert.ok(
      !output.includes('==================== BOUNDARY ===================='),
      'LOW 级问题不应触发 BOUNDARY 隔离',
    );
    // LOW 级文件应出现在稳定区
    assert.ok(output.includes('Stable Zone'), 'LOW 级文件应留在稳定区');
    assert.ok(output.includes('src/low.js'),  '文件应正常出现在输出中');
  });

  test('convert - XML 格式下，应该自动将稳定文件与动态文件拆分为不同的 zone 标签', () => {
    const files = new Map([
      ['src/clean.js', {
        path:      'src/clean.js',
        content:   'const x = 1;',
        size:      12,
        extension: '.js',
        name:      'clean.js',
      }],
      ['src/dirty.js', {
        path:      'src/dirty.js',
        content:   'const time = "2026-05-20T14:15:14Z";',
        size:      36,
        extension: '.js',
        name:      'dirty.js',
      }],
    ]);
    const stats = {
      totalFiles:    2,
      includedFiles: 2,
      totalSize:     48,
      languages:     { '.js': 2 },
      warnings:      [],
    };
    const cacheDetection = {
      detected: [{ path: 'src/dirty.js', severity: 'HIGH', issues: ['TIMESTAMP'] }],
      suggestions: ['移除时间戳'],
    };

    const output = convert(files, stats, OUTPUT_FORMATS.XML, {}, cacheDetection);

    assert.ok(output.includes('<files zone="stable"'),  '应该包含稳定区标签');
    assert.ok(output.includes('<files zone="dynamic"'), '应该包含动态区标签');

    // 进一步验证：干净文件在 stable 块，脏文件在 dynamic 块
    const stableIdx  = output.indexOf('<files zone="stable"');
    const dynamicIdx = output.indexOf('<files zone="dynamic"');
    const cleanIdx   = output.indexOf('path="src/clean.js"');
    const dirtyIdx   = output.indexOf('path="src/dirty.js"');

    assert.ok(
      stableIdx < cleanIdx && cleanIdx < dynamicIdx,
      '干净文件应出现在 stable 块内（stable 开始 → clean → dynamic 开始）',
    );
    assert.ok(
      dynamicIdx < dirtyIdx,
      '脏文件应出现在 dynamic 块内',
    );
  });

  test('convert - XML 格式下，无动态文件时应使用普通 <files> 标签而非 zone 标签', () => {
    const files = new Map([
      ['src/a.js', {
        path: 'src/a.js', content: 'const x = 1;',
        size: 12, extension: '.js', name: 'a.js',
      }],
    ]);
    const stats = {
      totalFiles: 1, includedFiles: 1, totalSize: 12, languages: { '.js': 1 }, warnings: [],
    };
    const cacheDetection = { detected: [], suggestions: [] };

    const output = convert(files, stats, OUTPUT_FORMATS.XML, {}, cacheDetection);

    // 无动态文件时，应退回普通 <files> 标签
    assert.ok(output.includes('<files>'),              '应使用普通 <files> 标签');
    assert.ok(!output.includes('<files zone="stable"'), '不应出现 stable zone 标签');
    assert.ok(!output.includes('<files zone="dynamic"'), '不应出现 dynamic zone 标签');
  });

  test('convert - TXT 格式下，应该插入文字版 BOUNDARY 分隔线', () => {
    const files = new Map([
      ['src/clean.js', {
        path: 'src/clean.js', content: 'const x = 1;',
        size: 12, extension: '.js', name: 'clean.js',
      }],
      ['src/dirty.js', {
        path: 'src/dirty.js', content: 'const time = "2026-05-20T14:15:14Z";',
        size: 36, extension: '.js', name: 'dirty.js',
      }],
    ]);
    const stats = {
      totalFiles: 2, includedFiles: 2, totalSize: 48, languages: { '.js': 2 }, warnings: [],
    };
    const cacheDetection = {
      detected: [{ path: 'src/dirty.js', severity: 'HIGH', issues: ['TIMESTAMP'] }],
      suggestions: [],
    };

    const output = convert(files, stats, OUTPUT_FORMATS.TXT, {}, cacheDetection);

    const cleanIdx    = output.indexOf('FILE: src/clean.js');
    const boundaryIdx = output.indexOf('BOUNDARY');
    const dirtyIdx    = output.indexOf('FILE: src/dirty.js');

    assert.ok(cleanIdx    !== -1, '应包含干净文件');
    assert.ok(boundaryIdx !== -1, '应包含 BOUNDARY 分隔标记');
    assert.ok(dirtyIdx    !== -1, '应包含脏文件');
    assert.ok(cleanIdx < boundaryIdx, '干净文件应在 BOUNDARY 上方');
    assert.ok(boundaryIdx < dirtyIdx, '脏文件应在 BOUNDARY 下方');
  });

  test('convert - 未传入 cacheDetection 时，行为应与旧版完全兼容（全部视为稳定文件）', () => {
    const files = new Map([
      ['a.js', { path: 'a.js', content: 'const a = 1;', size: 12, extension: '.js', name: 'a.js' }],
      ['b.js', { path: 'b.js', content: 'const b = 2;', size: 12, extension: '.js', name: 'b.js' }],
    ]);
    const stats = {
      totalFiles: 2, includedFiles: 2, totalSize: 24, languages: { '.js': 2 }, warnings: [],
    };

    // 不传第 5 个参数
    const output = convert(files, stats, OUTPUT_FORMATS.MARKDOWN);

    assert.ok(output.includes('a.js'), '应包含文件 a.js');
    assert.ok(output.includes('b.js'), '应包含文件 b.js');
    assert.ok(
      !output.includes('BOUNDARY'),
      '不传 cacheDetection 时不应出现 BOUNDARY 分隔',
    );
  });
});

// ============================================
// Cache Buster Detector Tests
// ============================================

describe('Cache Buster Detector', () => {

  test('detectCacheBusters - should detect timestamps', () => {
    const files = new Map([
      ['config.js', {
        path:    'config.js',
        content: 'const timestamp = "2024-01-01T12:00:00Z";',
        size:    42,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('TIMESTAMP'));
  });

  test('detectCacheBusters - should detect random IDs (UUID v4)', () => {
    const files = new Map([
      ['uuid.js', {
        path:    'uuid.js',
        content: 'const id = "550e8400-e29b-4d4a-a716-446655440000";',
        size:    50,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('RANDOM_ID'));
  });

  test('detectCacheBusters - should detect user IDs', () => {
    const files = new Map([
      ['user.js', {
        path:    'user.js',
        content: 'const user_id = 12345;',
        size:    22,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('USER_ID'));
  });

  test('detectCacheBusters - should detect environment variables', () => {
    const files = new Map([
      ['env.js', {
        path:    'env.js',
        content: 'const apiKey = process.env.API_KEY;',
        size:    35,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('ENV_VAR'));
  });

  test('detectCacheBusters - should return empty on clean files', () => {
    const files = new Map([
      ['clean.js', {
        path:    'clean.js',
        content: 'function add(a, b) { return a + b; }',
        size:    36,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 0);
  });

  test('detectCacheBusters - should classify severity correctly', () => {
    const files = new Map([
      ['high.js', {
        path:    'high.js',
        content: 'const time = "2024-01-01T12:00:00Z";',
        size:    36,
      }],
      ['low.js', {
        path:    'low.js',
        content: 'const agents = [1, 2, 3];',
        size:    25,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    const highItem = detected.find(d => d.path === 'high.js');
    const lowItem  = detected.find(d => d.path === 'low.js');
    assert.strictEqual(highItem.severity, 'HIGH');
    assert.strictEqual(lowItem.severity,  'LOW');
  });

  test('detectCacheBusters - should generate suggestions', () => {
    const files = new Map([
      ['timestamps.js', {
        path:    'timestamps.js',
        content: 'const time = "2024-01-01T12:00:00Z";',
        size:    36,
      }],
    ]);
    const { suggestions } = detectCacheBusters(files);
    assert.ok(suggestions.length > 0);
    assert.ok(
      suggestions.some(s =>
        s.toLowerCase().includes('timestamp') || s.includes('dynamic')
      ),
      'Should mention timestamps or dynamic content'
    );
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Integration', () => {

  test('full workflow - should process files end-to-end', () => {
    const files = new Map([
      ['src/index.js', {
        path:      'src/index.js',
        content:   'export default function() {}',
        size:      28,
        extension: '.js',
        name:      'index.js',
      }],
      ['README.md', {
        path:      'README.md',
        content:   '# Project',
        size:      9,
        extension: '.md',
        name:      'README.md',
      }],
    ]);

    const { filtered, stats } = filterFiles(files);
    assert.strictEqual(filtered.size, 2);

    const output = convert(filtered, stats, OUTPUT_FORMATS.MARKDOWN);
    assert.ok(output.length > 0);
    assert.ok(output.includes('src/index.js'));
    assert.ok(output.includes('README.md'));

    const { detected } = detectCacheBusters(filtered);
    assert.strictEqual(detected.length, 0);
  });

  test('full workflow - XML output should be well-formed', () => {
    const files = new Map([
      ['src/app.js', {
        path:      'src/app.js',
        content:   'const x = 1; // normal code',
        size:      27,
        extension: '.js',
        name:      'app.js',
      }],
    ]);

    const { filtered, stats } = filterFiles(files);
    const output = convert(filtered, stats, OUTPUT_FORMATS.XML);

    assert.ok(output.startsWith('<?xml version="1.0"'));
    assert.ok(output.includes('<repository>'));
    assert.ok(output.includes('</repository>'));
    assert.ok(output.includes('<files>'));
    assert.ok(output.includes('</files>'));
  });

  test('full workflow - BOUNDARY 与 detectCacheBusters 联动应正确分区', () => {
    // 模拟一个真实场景：clean 文件 + 含时间戳的 dirty 文件
    // 走完整检测 → 转换流程，验证端到端分区结果
    const files = new Map([
      ['src/utils.js', {
        path:      'src/utils.js',
        content:   'export function add(a, b) { return a + b; }',
        size:      43,
        extension: '.js',
        name:      'utils.js',
      }],
      ['src/logger.js', {
        path:      'src/logger.js',
        content:   'const built = "2026-05-20T14:15:14Z"; export default built;',
        size:      60,
        extension: '.js',
        name:      'logger.js',
      }],
    ]);

    const { filtered, stats } = filterFiles(files);
    // 步骤一：检测
    const cacheDetection = detectCacheBusters(filtered);
    // logger.js 含时间戳，应被检测到
    assert.ok(
      cacheDetection.detected.some(d => d.path === 'src/logger.js'),
      'logger.js 应被检测为含动态内容',
    );

    // 步骤二：转换（传入检测结果）
    const output = convert(filtered, stats, OUTPUT_FORMATS.MARKDOWN, {}, cacheDetection);

    const utilsIdx    = output.indexOf('src/utils.js');
    const boundaryIdx = output.indexOf('==================== BOUNDARY ====================');
    const loggerIdx   = output.indexOf('src/logger.js');

    assert.ok(utilsIdx    !== -1, 'utils.js 应出现在输出中');
    assert.ok(boundaryIdx !== -1, '应存在 BOUNDARY 分隔墙');
    assert.ok(loggerIdx   !== -1, 'logger.js 应出现在输出中');
    assert.ok(utilsIdx    < boundaryIdx, 'utils.js 应在 BOUNDARY 上方');
    assert.ok(boundaryIdx < loggerIdx,  'logger.js 应在 BOUNDARY 下方');
  });
});

console.log('\n✅ All tests completed\n');
