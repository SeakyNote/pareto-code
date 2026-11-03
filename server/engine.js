import { AppError } from './validation.js';

// 效果最大化，费用和完整执行耗时最小化；全等点互不支配。
export function dominates(a, b) {
  return a.quality >= b.quality && a.cost <= b.cost && a.duration <= b.duration &&
    (a.quality > b.quality || a.cost < b.cost || a.duration < b.duration);
}

export function paretoFront(records) {
  return records.filter((record) => !records.some((other) => other !== record && dominates(other, record)));
}

export function exclusionReasons(record, benchmark) {
  const reasons = [];
  if (record.quality === null) reasons.push('缺少任务效果评分');
  if (record.duration === null) reasons.push('缺少完整任务执行耗时');
  if (record.channel === 'api' && record.cost === null) reasons.push('缺少 API 每任务费用');
  if (record.sampleCount === null) reasons.push('缺少有效样本数量');
  if (benchmark.durationBasis !== 'wall-clock') reasons.push('耗时口径不是从发起到完整结果的 wall-clock 时间');
  if (benchmark.aggregation !== 'mean-per-task') reasons.push('统计口径不是所有任务（含失败）的每任务均值');
  if (benchmark.costBasis !== 'per-task') reasons.push('费用口径不是每任务费用');
  if (benchmark.source.type === 'third-party' && !benchmark.source.url) reasons.push('第三方来源缺少可追溯链接');
  return reasons;
}

function numericParam(params, key, fallback, min, max) {
  const raw = params.get(key);
  if (raw === null || raw === '') return fallback;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < min || number > max) throw new AppError(`${key} 应为 ${min}–${max} 之间的数值。`);
  return number;
}

export function readConstraints(params, benchmark) {
  const channel = params.get('channel') || 'api';
  const preference = params.get('preference') || 'balanced';
  if (!['api', 'subscription'].includes(channel)) throw new AppError('使用渠道无效。');
  if (!['balanced', 'quality', 'cost', 'speed'].includes(preference)) throw new AppError('选型偏好无效。');
  const monthlyPrice = numericParam(params, 'monthlyPrice', 20, 0, 1000000);
  const monthlyTasks = numericParam(params, 'monthlyTasks', 400, 1, 1000000);
  if (!Number.isInteger(monthlyTasks)) throw new AppError('月有效任务量必须为整数。');
  return {
    channel, preference,
    maxCost: numericParam(params, 'maxCost', null, 0, 1000000),
    maxDuration: numericParam(params, 'maxDuration', null, 0, 31536000),
    minQuality: numericParam(params, 'minQuality', 0, 0, benchmark.scoreMax),
    monthlyPrice, monthlyTasks,
  };
}

const WEIGHTS = {
  balanced: [0.5, 0.25, 0.25], quality: [0.8, 0.1, 0.1],
  cost: [0.25, 0.65, 0.1], speed: [0.25, 0.1, 0.65],
};

export function analyze(dataset, constraints) {
  const { benchmark } = dataset;
  const channelRecords = dataset.records.filter((r) => r.channel === constraints.channel);
  const excluded = [], comparable = [];
  for (const record of channelRecords) {
    const reasons = exclusionReasons(record, benchmark);
    if (reasons.length) excluded.push({ ...record, exclusionReasons: reasons, comparable: false, feasible: false, isPareto: false, isFeasiblePareto: false, dominatedBy: [] });
    else comparable.push({
      ...record,
      cost: record.channel === 'subscription' ? constraints.monthlyPrice / constraints.monthlyTasks : record.cost,
      costExplanation: record.channel === 'subscription'
        ? `月费 ${constraints.monthlyPrice} ${benchmark.currency} ÷ 月有效任务量 ${constraints.monthlyTasks}；等额均摊，非边际账单`
        : `${benchmark.currency} / 任务；同一测试集所有任务（含失败）的平均 API 费用`,
      comparable: true,
    });
  }
  const front = paretoFront(comparable);
  const frontIds = new Set(front.map((r) => r.id));
  const feasible = comparable.filter((r) =>
    (constraints.maxCost === null || r.cost <= constraints.maxCost) &&
    (constraints.maxDuration === null || r.duration <= constraints.maxDuration) &&
    r.quality >= constraints.minQuality);
  const feasibleIds = new Set(feasible.map((r) => r.id));
  const feasibleFront = paretoFront(feasible);
  const feasibleFrontIds = new Set(feasibleFront.map((r) => r.id));
  const weights = WEIGHTS[constraints.preference];
  const ranges = ['quality', 'cost', 'duration'].map((key) => {
    const values = feasibleFront.map((r) => r[key]);
    return [Math.min(...values), Math.max(...values)];
  });
  const utility = (r) => ['quality', 'cost', 'duration'].reduce((sum, key, i) => {
    const [min, max] = ranges[i];
    const normalized = max === min ? 1 : i === 0 ? (r[key] - min) / (max - min) : (max - r[key]) / (max - min);
    return sum + normalized * weights[i];
  }, 0);
  const stableOrder = (a, b) => a.cost - b.cost || a.duration - b.duration || b.quality - a.quality || a.id.localeCompare(b.id);
  const economy = [...feasibleFront].sort(stableOrder)[0];
  const quality = [...feasibleFront].sort((a, b) => b.quality - a.quality || stableOrder(a, b))[0];
  const balanced = [...feasibleFront].sort((a, b) => utility(b) - utility(a) || stableOrder(a, b))[0];
  const recommendations = [
    { kind: 'economy', title: '经济之选', record: economy, reason: '在满足全部条件的三目标前沿中，每任务费用最低；同价时优先耗时更短的配置。' },
    { kind: 'balanced', title: '偏好推荐', record: balanced, reason: `对满足条件的前沿配置做区间归一化，按效果 / 费用 / 速度 ${weights.map((n) => `${Math.round(n * 100)}%`).join(' / ')} 加权选择。权重仅影响此推荐，不改变帕累托前沿。` },
    { kind: 'quality', title: '效果优先', record: quality, reason: '在满足全部预算、耗时及效果条件的三目标前沿中，任务效果最高；同分时优先费用更低的配置。' },
  ].filter((r) => r.record).map((r) => ({ ...r, recordId: r.record.id }));
  const records = comparable.map((r) => ({
    ...r, feasible: feasibleIds.has(r.id), isPareto: frontIds.has(r.id), isFeasiblePareto: feasibleFrontIds.has(r.id),
    dominatedBy: comparable.filter((other) => dominates(other, r)).slice(0, 5).map((other) => other.id),
    constraintReasons: [
      ...(constraints.maxCost !== null && r.cost > constraints.maxCost ? ['超出费用预算'] : []),
      ...(constraints.maxDuration !== null && r.duration > constraints.maxDuration ? ['超出耗时要求'] : []),
      ...(r.quality < constraints.minQuality ? ['未达最低效果'] : []),
    ],
  }));
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(benchmark.evaluatedAt)) / 86400000));
  const nearest = !feasible.length && comparable.length ? [...comparable].sort((a, b) => {
    const violation = (r) => Math.max(0, (r.cost - (constraints.maxCost ?? r.cost)) / Math.max(constraints.maxCost ?? 1, 0.01)) +
      Math.max(0, (r.duration - (constraints.maxDuration ?? r.duration)) / Math.max(constraints.maxDuration ?? 1, 1)) +
      Math.max(0, constraints.minQuality - r.quality) / benchmark.scoreMax;
    return violation(a) - violation(b) || stableOrder(a, b);
  }).slice(0, 3).map((r) => records.find((row) => row.id === r.id)) : [];
  return {
    benchmark, constraints, records: [...records, ...excluded], recommendations, nearest,
    stats: { total: channelRecords.length, comparable: comparable.length, excluded: excluded.length, pareto: front.length, feasible: feasible.length, feasiblePareto: feasibleFront.length, minFeasibleCost: feasible.length ? Math.min(...feasible.map((r) => r.cost)) : null },
    freshness: { ageDays, stale: ageDays > 30 },
    weights,
  };
}
