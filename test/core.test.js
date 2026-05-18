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

  // 修复：用 Uint8Array 代替普通 Object，通过类型检查后才能触发 too large 判断
  test('validateZipData - should reject oversized files', () => {
    const oversized = new Uint8Array(FILE_SIZE_LIMITS.MAX_TOTAL_SIZE + 1);
    const result = validateZipData(oversized);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /too large/);
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
      ['src/index.js', { path: 'src/index.js', content: 'code', size: 4, extension: '.js' }],
      ['node_modules/lib.js', { path: 'node_modules/lib.js', content: 'lib', size: 3, extension: '.js' }],
      ['.git/config', { path: '.git/config', content: 'config', size: 6, extension: '' }],
    ]);

    const { filtered } = filterFiles(files);

    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
    assert.ok(!filtered.has('node_modules/lib.js'));
    assert.ok(!filtered.has('.git/config'));
  });

  test('filterFiles - should respect include patterns', () => {
    const files = new Map([
      ['src/index.js', { path: 'src/index.js', content: 'code', size: 4, extension: '.js' }],
      ['test/test.js', { path: 'test/test.js', content: 'test', size: 4, extension: '.js' }],
      ['README.md', { path: 'README.md', content: 'readme', size: 6, extension: '.md' }],
    ]);

    const { filtered } = filterFiles(files, { include: ['src/**'] });

    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
  });

  test('filterFiles - should respect exclude patterns', () => {
    const files = new Map([
      ['src/index.js', { path: 'src/index.js', content: 'code', size: 4, extension: '.js' }],
      ['src/index.test.js', { path: 'src/index.test.js', content: 'test', size: 4, extension: '.js' }],
    ]);

    const { filtered } = filterFiles(files, { exclude: ['**/*.test.js'] });

    assert.strictEqual(filtered.size, 1);
    assert.ok(filtered.has('src/index.js'));
    assert.ok(!filtered.has('src/index.test.js'));
  });

  test('filterFiles - should collect language stats', () => {
    const files = new Map([
      ['index.js', { path: 'index.js', content: 'js', size: 2, extension: '.js' }],
      ['style.css', { path: 'style.css', content: 'css', size: 3, extension: '.css' }],
      ['app.js', { path: 'app.js', content: 'js2', size: 3, extension: '.js' }],
    ]);

    const { stats } = filterFiles(files);

    assert.strictEqual(stats.languages['.js'], 2);
    assert.strictEqual(stats.languages['.css'], 1);
  });
});

// ============================================
// Converter Tests
// ============================================

describe('Converter', () => {

  const sampleFiles = new Map([
    ['test.js', {
      path: 'test.js',
      content: 'console.log("hello");',
      size: 21,
      extension: '.js',
      name: 'test.js'
    }],
  ]);

  const sampleStats = {
    totalFiles: 1,
    includedFiles: 1,
    totalSize: 21,
    languages: { '.js': 1 },
    warnings: [],
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

  test('convert - should include stats in all formats', () => {
    const formats = [OUTPUT_FORMATS.MARKDOWN, OUTPUT_FORMATS.XML, OUTPUT_FORMATS.TXT];
    for (const format of formats) {
      const output = convert(sampleFiles, sampleStats, format);
      assert.ok(output.length > 0, `${format} output should not be empty`);
    }
  });
});

// ============================================
// Cache Buster Detector Tests
// ============================================

describe('Cache Buster Detector', () => {

  test('detectCacheBusters - should detect timestamps', () => {
    const files = new Map([
      ['config.js', {
        path: 'config.js',
        content: 'const timestamp = "2024-01-01T12:00:00Z";',
        size: 40,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('TIMESTAMP'));
  });

  // 修复：使用完整 UUID v4 格式（8-4-4-4-12），且第三段第一位必须是 4，第四段第一位必须是 8/9/a/b
  test('detectCacheBusters - should detect random IDs', () => {
    const files = new Map([
      ['uuid.js', {
        path: 'uuid.js',
        content: 'const id = "550e8400-e29b-4d4a-a716-446655440000";',
        size: 50,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('RANDOM_ID'));
  });

  test('detectCacheBusters - should detect user IDs', () => {
    const files = new Map([
      ['user.js', {
        path: 'user.js',
        content: 'const user_id = 12345;',
        size: 25,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('USER_ID'));
  });

  test('detectCacheBusters - should detect environment variables', () => {
    const files = new Map([
      ['env.js', {
        path: 'env.js',
        content: 'const apiKey = process.env.API_KEY;',
        size: 40,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 1);
    assert.ok(detected[0].issues.includes('ENV_VAR'));
  });

  test('detectCacheBusters - should return empty on clean files', () => {
    const files = new Map([
      ['clean.js', {
        path: 'clean.js',
        content: 'function add(a, b) { return a + b; }',
        size: 40,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    assert.strictEqual(detected.length, 0);
  });

  test('detectCacheBusters - should classify severity correctly', () => {
    const files = new Map([
      ['high.js', {
        path: 'high.js',
        content: 'const time = "2024-01-01T12:00:00Z";',
        size: 60,
      }],
      ['low.js', {
        path: 'low.js',
        content: 'const agents = [1, 2, 3];',
        size: 30,
      }],
    ]);
    const { detected } = detectCacheBusters(files);
    const highItem = detected.find(d => d.path === 'high.js');
    const lowItem  = detected.find(d => d.path === 'low.js');
    assert.strictEqual(highItem.severity, 'HIGH');
    assert.strictEqual(lowItem.severity, 'LOW');
  });

  test('detectCacheBusters - should generate suggestions', () => {
    const files = new Map([
      ['timestamps.js', {
        path: 'timestamps.js',
        content: 'const time = "2024-01-01T12:00:00Z";',
        size: 40,
      }],
    ]);
    const { suggestions } = detectCacheBusters(files);
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some(s => s.toLowerCase().includes('timestamp') || s.includes('dynamic')));
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Integration', () => {

  test('full workflow - should process files end-to-end', () => {
    const files = new Map([
      ['src/index.js', {
        path: 'src/index.js',
        content: 'export default function() {}',
        size: 28,
        extension: '.js',
        name: 'index.js'
      }],
      ['README.md', {
        path: 'README.md',
        content: '# Project',
        size: 9,
        extension: '.md',
        name: 'README.md'
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
});

console.log('\n✅ All tests completed\n');
