import { SCENARIOS } from './catalog.js';

export const money = (value, currency) => value === null ? '—' : `${currency === 'CNY' ? '¥' : '$'}${value > 0 && value < 0.0001 ? value.toExponential(2) : value.toFixed(value < 0.01 && value > 0 ? 4 : 2)}`;
const cell = (s) => String(s ?? '—').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
const minutes = (s) => `${(s / 60).toFixed(1)} 分钟`;

export function makeReport(result) {
  const { benchmark: b, constraints: c, stats, recommendations, records } = result;
  const rows = records.filter((r) => r.feasible && r.isFeasiblePareto).sort((a, z) => a.cost - z.cost);
  return [
    '# AI 模型配置选型报告', '',
    `生成时间：${new Date().toISOString()}`, '',
    ...(b.source.type === 'demo' ? ['> 当前评测为人工构造的演示数据，不代表真实模型能力、价格或节约效果。', ''] : []),
    '## 评测范围', '',
    `- 场景：${SCENARIOS.find((s) => s.id === b.scenario)?.name}`,
    `- 评测快照：${cell(b.name)}（${b.id}）`,
    `- 来源：${cell(b.source.name)}${b.source.url ? `，${b.source.url}` : ''}`,
    `- 评测时间：${b.evaluatedAt}`,
    `- 测试集：${cell(b.taskSet)}`,
    `- 评分规则：${cell(b.scoring)}；上限 ${b.scoreMax}`,
    `- 统计口径：${b.aggregation}；${b.durationBasis}；${b.costBasis}；${b.currency}`, '',
    '## 需求与费用假设', '',
    `- 使用渠道：${c.channel === 'api' ? '正价 API / 每任务平均费用' : '会员订阅 / 等额均摊费用'}`,
    `- 每任务费用上限：${c.maxCost === null ? '不限' : money(c.maxCost, b.currency)}`,
    `- 完整执行耗时上限：${c.maxDuration === null ? '不限' : minutes(c.maxDuration)}`,
    `- 最低效果：${c.minQuality} / ${b.scoreMax}`,
    `- 选型偏好：${c.preference}；效果 / 费用 / 速度权重 ${result.weights.join(' / ')}`,
    ...(c.channel === 'subscription' ? [`- 订阅折算：月费 ${money(c.monthlyPrice, b.currency)} ÷ ${c.monthlyTasks} 个有效任务 = ${money(c.monthlyPrice / c.monthlyTasks, b.currency)} / 任务。此为用户输入假设，非实际边际账单，不包含配额、排队与额外收费保证。`] : []), '',
    '## 分析结果', '',
    `共 ${stats.total} 条配置，${stats.comparable} 条可比较，${stats.excluded} 条待补齐。三目标前沿 ${stats.pareto} 条，满足条件 ${stats.feasible} 条。`, '',
    ...(!rows.length ? ['没有配置同时满足全部条件。系统没有自动放宽约束。', ''] : [
      '| 模型 / 推理强度 | Agent / 版本 | 效果 | 每任务费用 | 完整耗时 | 样本数 |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...rows.map((r) => `| ${cell(r.model)} / ${cell(r.reasoning)} | ${cell(r.agent)} / ${cell(r.version)} | ${r.quality} | ${money(r.cost, b.currency)} | ${minutes(r.duration)} | ${r.sampleCount} |`), '',
    ]),
    '## 推荐与解释', '',
    ...recommendations.flatMap((r) => [`- ${r.title}：${cell(r.record.model)} / ${cell(r.record.reasoning)}。${r.reason}`, '']),
    ...(!recommendations.length ? ['暂无满足条件的推荐。', ''] : []),
    '## 未纳入比较的记录', '',
    ...records.filter((r) => !r.comparable).map((r) => `- ${cell(r.model)}：${r.exclusionReasons.join('；')}`),
    ...(stats.excluded ? [] : ['无。']), '',
    '## 方法', '',
    '效果最大化，费用和完整执行耗时最小化。只有在其他配置三项均不差且至少一项严格更优时，才判定当前配置被支配。相同指标的配置互不支配。前沿只在同一评测快照、同一渠道内计算。分档推荐可重合，不强行推荐较差配置。', '',
    '图中的虚线是所选两个维度的投影包络，圆环才表示包含耗时的三目标前沿。推荐解释由确定性规则生成；本 MVP 未连接付费模型调用。', '',
    `快照备注：${cell(b.notes || '无')}`, '',
  ].join('\n');
}
