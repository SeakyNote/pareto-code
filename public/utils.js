export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  if (value > 0 && value < 0.0001) return `${currency === 'CNY' ? '¥' : '$'}${value.toExponential(2)}`;
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `${currency === 'CNY' ? '¥' : '$'}${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  return seconds < 60 ? `${Number(seconds.toFixed(1))} 秒` : `${Number((seconds / 60).toFixed(1))} 分钟`;
}
export function formatDate(value, full = false) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(value)).replaceAll('/', '.');
}
export function modelStyle(model = '') {
  if (model.includes('Luna')) return { color: '#8071cd', background: '#f0ecfb', short: 'L', family: 'GPT Luna' };
  if (model.includes('Terra')) return { color: '#4da7b3', background: '#eaf7f8', short: 'T', family: 'GPT Terra' };
  if (model.includes('Sol')) return { color: '#daa04e', background: '#fcf3e5', short: 'S', family: 'GPT Sol' };
  if (model.includes('Claude')) return { color: '#b28a7b', background: '#f7efeb', short: 'C', family: 'Claude' };
  if (model.includes('DeepSeek')) return { color: '#5f90d5', background: '#edf2fc', short: 'D', family: 'DeepSeek' };
  if (model.includes('Qwen')) return { color: '#56ab8b', background: '#eaf6f0', short: 'Q', family: 'Qwen' };
  return { color: '#8b93a8', background: '#eff1f5', short: model.slice(0, 1).toUpperCase() || 'M', family: '其他模型' };
}
