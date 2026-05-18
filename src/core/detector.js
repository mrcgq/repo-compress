
/**
 * 缓存破坏向量检测器
 * 职责：检测可能破坏 AI Prompt 缓存的动态内容
 * 
 * Law-55（Prompt 缓存局部性）：稳定内容与动态内容必须分离
 * Law-46（可观测性）：检测到问题时生成警告
 */

import { CACHE_BUSTERS } from '../utils/constants.js';

/**
 * 检测缓存破坏向量
 * @param {Map} files - 文件集合
 * @returns {Object} { detected: Array, suggestions: Array }
 */
export function detectCacheBusters(files) {
  const detected = [];
  const suggestions = [];

  // Law-16: 快速失败
  if (!files || files.size === 0) {
    return { detected, suggestions };
  }

  // Law-15: 极简控制流 - 单层遍历
  for (const [path, file] of files) {
    const issues = [];

    // 检查每种缓存破坏向量
    for (const [type, pattern] of Object.entries(CACHE_BUSTERS)) {
      if (pattern.test(file.content)) {
        issues.push(type);
      }
    }

    if (issues.length > 0) {
      detected.push({
        path,
        issues,
        severity: getSeverity(issues),
      });
    }
  }

  // Law-46: 可观测性 - 生成建议
  if (detected.length > 0) {
    suggestions.push(
      `⚠️ Found ${detected.length} file(s) with dynamic content that may break AI prompt caching.`
    );

    // 统计最常见的问题
    const issueCounts = {};
    for (const item of detected) {
      for (const issue of item.issues) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
      }
    }

    // 生成具体建议
    for (const [issue, count] of Object.entries(issueCounts)) {
      const suggestion = getSuggestion(issue, count);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
  }

  return { detected, suggestions };
}

/**
 * 获取问题严重程度
 * Law-36: 差异化 - 不同问题不同严重度
 */
function getSeverity(issues) {
  // 高严重度：时间戳、随机ID
  const highSeverity = ['TIMESTAMP', 'RANDOM_ID', 'SESSION'];
  
  // 中严重度：环境变量、Git哈希
  const mediumSeverity = ['ENV_VAR', 'GIT_HASH', 'USER_ID'];
  
  // 低严重度：列表（可以移到附件区）
  const lowSeverity = ['AGENT_LIST', 'TOOL_LIST'];

  for (const issue of issues) {
    if (highSeverity.includes(issue)) return 'HIGH';
  }

  for (const issue of issues) {
    if (mediumSeverity.includes(issue)) return 'MEDIUM';
  }

  return 'LOW';
}

/**
 * 获取针对性建议
 * Law-04: 意图透明 - 清晰的建议
 */
function getSuggestion(issue, count) {
  const suggestions = {
    TIMESTAMP: `🕒 Found ${count} file(s) with timestamps. Consider removing or using BOUNDARY to separate dynamic content.`,
    
    RANDOM_ID: `🎲 Found ${count} file(s) with random IDs (UUID). These change every time and break caching.`,
    
    USER_ID: `👤 Found ${count} file(s) with user IDs. Move user-specific data to dynamic section.`,
    
    SESSION: `🔐 Found ${count} file(s) with session IDs. These should not be in cached prompt content.`,
    
    ENV_VAR: `⚙️ Found ${count} file(s) with environment variables. Consider separating config from code.`,
    
    GIT_HASH: `📌 Found ${count} file(s) with Git hashes. These change frequently and affect caching.`,
    
    AGENT_LIST: `🤖 Found ${count} file(s) with agent lists. Consider moving to message attachments (Law-55).`,
    
    TOOL_LIST: `🛠️ Found ${count} file(s) with tool lists. Consider moving to message attachments (Law-55).`,
  };

  return suggestions[issue] || null;
}

/**
 * 生成缓存友好报告
 * Law-55: Prompt缓存局部性 - 指导如何分离稳定/动态内容
 */
export function generateCacheReport(detected, suggestions) {
  if (detected.length === 0) {
    return '✅ No cache-busting vectors detected. Content is cache-friendly!';
  }

  const lines = [];

  lines.push('# 🔍 Cache-Busting Detection Report\n');
  
  // 总体概览
  lines.push(`Found ${detected.length} file(s) with potential caching issues:\n`);

  // 按严重程度分组
  const bySeverity = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const item of detected) {
    bySeverity[item.severity].push(item);
  }

  // 输出高严重度问题
  if (bySeverity.HIGH.length > 0) {
    lines.push('## 🚨 HIGH Severity\n');
    for (const item of bySeverity.HIGH) {
      lines.push(`- \`${item.path}\``);
      lines.push(`  Issues: ${item.issues.join(', ')}`);
    }
    lines.push('');
  }

  // 输出中严重度问题
  if (bySeverity.MEDIUM.length > 0) {
    lines.push('## ⚠️ MEDIUM Severity\n');
    for (const item of bySeverity.MEDIUM) {
      lines.push(`- \`${item.path}\``);
      lines.push(`  Issues: ${item.issues.join(', ')}`);
    }
    lines.push('');
  }

  // 输出低严重度问题
  if (bySeverity.LOW.length > 0) {
    lines.push('## ℹ️ LOW Severity\n');
    for (const item of bySeverity.LOW) {
      lines.push(`- \`${item.path}\``);
      lines.push(`  Issues: ${item.issues.join(', ')}`);
    }
    lines.push('');
  }

  // 建议
  lines.push('## 💡 Suggestions\n');
  for (const suggestion of suggestions) {
    lines.push(suggestion);
  }

  return lines.join('\n');
}
