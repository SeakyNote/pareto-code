import { SCENARIOS } from './catalog.js';

export class AppError extends Error {
  constructor(message, status = 400, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const MAX_RECORDS = 2000;
const textFields = ['model', 'version', 'agent', 'provider', 'reasoning'];
const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const optionalNumber = (v) => v === null || v === undefined || v === '' ? null : Number(v);

function validTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1] && hour <= 23 && minute <= 59 && second <= 59;
}

export function validateDatasets(value) {
  const datasets = Array.isArray(value?.datasets) ? value.datasets : [value];
  const errors = [];
  const ids = new Set();
  let total = 0;
  if (!datasets.length || datasets.length > 20) throw new AppError('每次导入应包含 1–20 个评测快照。');
  const normalized = datasets.map((dataset, di) => {
    const prefix = `快照 ${di + 1}`;
    if (!isObject(dataset) || !isObject(dataset.benchmark) || !Array.isArray(dataset.records)) {
      errors.push(`${prefix}：需要 benchmark 对象和 records 数组。`);
      return null;
    }
    const b = dataset.benchmark;
    const required = ['id', 'name', 'scenario', 'taskSet', 'scoring', 'aggregation', 'durationBasis', 'costBasis', 'currency', 'evaluatedAt'];
    for (const key of required) {
      if (typeof b[key] !== 'string' || !b[key].trim() || b[key].length > 1000) errors.push(`${prefix}：${key} 必须为非空文本（最多 1000 字）。`);
    }
    if (!validId.test(b.id || '')) errors.push(`${prefix}：id 仅支持字母、数字、连字符与下划线，最多 128 字。`);
    if (ids.has(b.id)) errors.push(`${prefix}：快照 id 重复。`);
    ids.add(b.id);
    if (!SCENARIOS.some((s) => s.id === b.scenario)) errors.push(`${prefix}：scenario 应为 coding、svg、office 或 writing。`);
    if (!['USD', 'CNY'].includes(b.currency)) errors.push(`${prefix}：currency 仅支持 USD 或 CNY；不同币种不混合比较。`);
    if (typeof b.evaluatedAt === 'string' && !validTimestamp(b.evaluatedAt)) errors.push(`${prefix}：evaluatedAt 必须为真实存在且含时区的 ISO 日期。`);
    if (typeof b.scoreMax !== 'number' || !Number.isFinite(b.scoreMax) || b.scoreMax <= 0 || b.scoreMax > 10000) errors.push(`${prefix}：scoreMax 应为大于 0、至多 10000 的数值。`);
    if (!isObject(b.source) || typeof b.source.name !== 'string' || !b.source.name.trim() || b.source.name.length > 500 || !['demo', 'internal', 'third-party'].includes(b.source.type)) errors.push(`${prefix}：source 需要 name 和 type（demo / internal / third-party）。`);
    if (b.source?.url && (typeof b.source.url !== 'string' || b.source.url.length > 2000 || !/^https?:\/\//i.test(b.source.url))) errors.push(`${prefix}：来源链接必须以 http:// 或 https:// 开头。`);
    if (b.source?.url && typeof b.source.url === 'string') {
      try { new URL(b.source.url); } catch { errors.push(`${prefix}：来源链接格式无效。`); }
    }
    if (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 4000)) errors.push(`${prefix}：notes 应为至多 4000 字的文本。`);
    if (!dataset.records.length || dataset.records.length > MAX_RECORDS) errors.push(`${prefix}：records 应包含 1–${MAX_RECORDS} 条记录。`);
    total += dataset.records.length;
    const recordIds = new Set();
    const records = dataset.records.map((r, ri) => {
      const label = `${prefix}，记录 ${ri + 1}`;
      if (!isObject(r)) { errors.push(`${label}：记录必须是对象。`); return null; }
      if (typeof r.id !== 'string' || !validId.test(r.id)) errors.push(`${label}：id 格式无效。`);
      if (recordIds.has(r.id)) errors.push(`${label}：记录 id 重复。`);
      recordIds.add(r.id);
      for (const key of textFields) {
        if (typeof r[key] !== 'string' || !r[key].trim() || r[key].length > 200) errors.push(`${label}：${key} 必须为非空文本（最多 200 字）。`);
      }
      if (!['api', 'subscription'].includes(r.channel)) errors.push(`${label}：channel 应为 api 或 subscription。`);
      const values = {};
      for (const key of ['quality', 'cost', 'duration', 'sampleCount']) {
        // JSON 中拒绝隐式数值转换；CSV 转换在解析层完成。
        const v = r[key] ?? null;
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) errors.push(`${label}：${key} 应为非负有限数值或 null。`);
        values[key] = v;
      }
      if (values.quality !== null && values.quality > b.scoreMax) errors.push(`${label}：quality 超出评分上限。`);
      if (values.duration !== null && values.duration <= 0) errors.push(`${label}：完整任务耗时 duration 必须大于 0。`);
      if (values.duration !== null && values.duration > 31536000) errors.push(`${label}：duration 不能超过 31536000 秒。`);
      if (values.cost !== null && values.cost > 1000000) errors.push(`${label}：每任务费用 cost 不能超过 1000000。`);
      if (values.sampleCount !== null && (!Number.isInteger(values.sampleCount) || values.sampleCount < 1 || values.sampleCount > 10000000)) errors.push(`${label}：sampleCount 应为正整数（至多 10000000）。`);
      if (r.channel === 'subscription' && values.cost !== null) errors.push(`${label}：订阅记录的 cost 应为 null，由用户假设单独折算。`);
      if (r.notes !== undefined && (typeof r.notes !== 'string' || r.notes.length > 4000)) errors.push(`${label}：notes 应为至多 4000 字的文本。`);
      return { id: r.id, ...Object.fromEntries(textFields.map((k) => [k, typeof r[k] === 'string' ? r[k].trim() : r[k]])), channel: r.channel, ...values, notes: r.notes || '' };
    });
    return {
      benchmark: {
        ...Object.fromEntries(required.map((k) => [k, typeof b[k] === 'string' ? b[k].trim() : b[k]])),
        scoreMax: b.scoreMax,
        source: { name: typeof b.source?.name === 'string' ? b.source.name.trim() : '', type: b.source?.type, url: b.source?.url || null },
        notes: b.notes || '',
      },
      records,
    };
  });
  if (total > MAX_RECORDS) errors.push(`一次最多导入 ${MAX_RECORDS} 条配置，请分批导入。`);
  if (errors.length) throw new AppError('评测数据未通过校验，尚未写入。', 422, errors.slice(0, 50));
  return normalized;
}

export const CSV_HEADERS = [
  'benchmarkId', 'benchmarkName', 'scenario', 'taskSet', 'scoring', 'scoreMax', 'aggregation', 'durationBasis', 'costBasis', 'currency', 'evaluatedAt', 'sourceName', 'sourceType', 'sourceUrl',
  'id', 'model', 'version', 'agent', 'provider', 'reasoning', 'channel', 'quality', 'cost', 'duration', 'sampleCount', 'notes',
];

export function parseCsv(input) {
  const rows = [];
  let row = [], field = '', quoted = false, endedQuote = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; endedQuote = true; }
      else field += c;
    } else if (c === '"') {
      if (field || endedQuote) throw new AppError('CSV 引号格式错误。', 422);
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = ''; endedQuote = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = []; field = ''; endedQuote = false;
    } else {
      if (endedQuote) throw new AppError('CSV 闭合引号后只能出现逗号或换行。', 422);
      field += c;
    }
    if (rows.length > MAX_RECORDS + 1) throw new AppError(`CSV 最多包含 ${MAX_RECORDS} 条记录。`, 422);
  }
  if (quoted) throw new AppError('CSV 存在未闭合的引号。', 422);
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim());
  if (!headers || !rows.length) throw new AppError('CSV 需要表头和至少一条记录。', 422);
  if (rows.length > MAX_RECORDS) throw new AppError(`CSV 最多包含 ${MAX_RECORDS} 条记录。`, 422);
  if (new Set(headers).size !== headers.length) throw new AppError('CSV 表头存在重复列。', 422);
  const missing = CSV_HEADERS.filter((h) => h !== 'notes' && h !== 'sourceUrl' && !headers.includes(h));
  if (missing.length) throw new AppError('CSV 缺少必要列。', 422, missing);
  const groups = new Map();
  rows.forEach((cells, index) => {
    if (cells.length !== headers.length) throw new AppError(`CSV 第 ${index + 2} 行的列数与表头不一致。`, 422);
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    const benchmark = {
      id: r.benchmarkId, name: r.benchmarkName, scenario: r.scenario, taskSet: r.taskSet, scoring: r.scoring,
      scoreMax: optionalNumber(r.scoreMax), aggregation: r.aggregation, durationBasis: r.durationBasis,
      costBasis: r.costBasis, currency: r.currency, evaluatedAt: r.evaluatedAt,
      source: { name: r.sourceName, type: r.sourceType, url: r.sourceUrl || null }, notes: '',
    };
    if (!groups.has(benchmark.id)) groups.set(benchmark.id, { benchmark, records: [] });
    const group = groups.get(benchmark.id);
    if (JSON.stringify(group.benchmark) !== JSON.stringify(benchmark)) throw new AppError(`CSV 第 ${index + 2} 行的同一快照元数据不一致，请分配不同 benchmarkId。`, 422);
    group.records.push({
      ...Object.fromEntries(['id', ...textFields, 'channel', 'notes'].map((k) => [k, r[k] || ''])),
      ...Object.fromEntries(['quality', 'cost', 'duration', 'sampleCount'].map((k) => [k, optionalNumber(r[k])])),
    });
  });
  return { datasets: [...groups.values()] };
}

export function parseImport(body) {
  if (!isObject(body) || typeof body.text !== 'string' || !body.text.trim()) throw new AppError('请先选择文件或粘贴评测数据。');
  if (!['json', 'csv'].includes(body.format)) throw new AppError('仅支持 JSON 或 CSV。');
  let parsed;
  if (body.format === 'csv') parsed = parseCsv(body.text);
  else {
    try { parsed = JSON.parse(body.text.replace(/^\uFEFF/, '')); }
    catch { throw new AppError('JSON 格式无效，请检查引号、逗号和括号。', 422); }
  }
  return validateDatasets(parsed);
}

export function toCsv(dataset) {
  const b = dataset.benchmark;
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = dataset.records.map((r) => {
    const meta = {
      benchmarkId: b.id, benchmarkName: b.name, ...b,
      sourceName: b.source.name, sourceType: b.source.type, sourceUrl: b.source.url,
    };
    return CSV_HEADERS.map((h) => escape(h in r ? r[h] : meta[h])).join(',');
  });
  return '\uFEFF' + [CSV_HEADERS.join(','), ...rows].join('\r\n');
}
