

/**
 * 辅助工具函数
 * Law-22: 单一职责 - 每个函数只做一件事
 */

/**
 * 格式化文件大小
 * Law-04: 意图透明 - 清晰的单位转换
 */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 格式化数字（添加千位分隔符）
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * 安全的 JSON 解析
 * Law-30: 错误传播 - 返回结果对象而不是抛出异常
 */
export function safeJsonParse(text) {
  try {
    return { success: true, data: JSON.parse(text) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 防抖函数
 * Law-05: 物理吝啬 - 减少不必要的执行
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 截断文本
 * Law-11: 边界检查 - 安全的字符串操作
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
