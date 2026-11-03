import test from 'node:test';
import assert from 'node:assert/strict';
import { dominates, paretoFront, analyze, readConstraints } from '../server/engine.js';
import { fixture, record } from './helpers.js';

const ids = (rows) => rows.map((r) => r.id).sort();
const constraints = (dataset, query = '') => readConstraints(new URLSearchParams(query), dataset.benchmark);

test('三目标前沿保留速度更快但费用更高、效果较低的配置', () => {
  const { records } = fixture();
  assert.deepEqual(ids(paretoFront(records)), ['best', 'cheap', 'fast']);
  assert.equal(dominates(records[0], records[3]), true);
  assert.equal(dominates(records[0], records[1]), false);
});
test('完全相同的指标互不支配；任一维严格更优即可支配', () => {
  const a = record('a', 80, 1, 60), b = record('b', 80, 1, 60);
  assert.equal(dominates(a, b), false);
  assert.deepEqual(ids(paretoFront([a, b])), ['a', 'b']);
  for (const better of [{ quality: 81 }, { cost: .9 }, { duration: 59 }]) assert.equal(dominates({ ...a, ...better }, b), true);
});
test('前沿与输入顺序无关，加入被支配点不改变前沿', () => {
  const d = fixture();
  const baseline = ids(paretoFront(d.records));
  for (let shift = 0; shift < d.records.length; shift++) {
    const reordered = [...d.records.slice(shift), ...d.records.slice(0, shift)].reverse();
    assert.deepEqual(ids(paretoFront(reordered)), baseline);
  }
  assert.deepEqual(ids(paretoFront([...d.records, record('worse', 1, 100, 10000)])), baseline);
});
test('三项约束同时生效，边界值包含在内', () => {
  const d = fixture();
  const r = analyze(d, constraints(d, 'maxCost=1&maxDuration=60&minQuality=80'));
  assert.deepEqual(ids(r.records.filter((v) => v.feasible)), ['cheap']);
  assert.equal(r.recommendations.length, 3);
  assert.ok(r.recommendations.every((v) => v.recordId === 'cheap'));
});
test('无满足条件的配置时不放宽约束，不产生违规推荐', () => {
  const d = fixture();
  const r = analyze(d, constraints(d, 'maxCost=0&maxDuration=1&minQuality=100'));
  assert.equal(r.stats.feasible, 0);
  assert.equal(r.stats.minFeasibleCost, null);
  assert.deepEqual(r.recommendations, []);
  assert.ok(r.nearest.length > 0);
  assert.ok(r.nearest.every((v) => !v.feasible && v.constraintReasons.length));
});
test('缺失数值和零费用不同：缺失排除，零费用有效', () => {
  const d = fixture();
  d.records.push(record('free', 70, 0, 60), record('no-cost', 99, null, 20), record('no-time', 99, 0, null), record('no-score', null, 0, 20), record('no-samples', 99, 0, 20, { sampleCount: null }));
  const r = analyze(d, constraints(d));
  assert.equal(r.stats.excluded, 4);
  assert.equal(r.records.find((v) => v.id === 'free').comparable, true);
  for (const id of ['no-cost', 'no-time', 'no-score', 'no-samples']) {
    const row = r.records.find((v) => v.id === id);
    assert.equal(row.isPareto, false);
    assert.ok(row.exclusionReasons.length);
  }
});
test('API 与订阅独立筛选；订阅只按用户假设折算', () => {
  const d = fixture();
  d.records.push(record('subscription', 100, null, 20, { channel: 'subscription' }));
  const api = analyze(d, constraints(d));
  assert.equal(api.stats.total, 4);
  assert.deepEqual(ids(api.records.filter((r) => r.isPareto)), ['best', 'cheap', 'fast']);
  const sub = analyze(d, constraints(d, 'channel=subscription&monthlyPrice=30&monthlyTasks=300'));
  assert.equal(sub.stats.comparable, 1);
  assert.equal(sub.records[0].cost, .1);
  assert.match(sub.records[0].costExplanation, /30.*300/);
  assert.equal(d.records.at(-1).cost, null, '分析不修改原始数据');
});
test('订阅零月费有效，任务量不能为零或小数', () => {
  const d = fixture();
  d.records.push(record('sub', 100, null, 20, { channel: 'subscription' }));
  assert.equal(analyze(d, constraints(d, 'channel=subscription&monthlyPrice=0&monthlyTasks=1&maxCost=0')).stats.feasible, 1);
  for (const query of ['monthlyTasks=0', 'monthlyTasks=1.5', 'monthlyPrice=-1']) assert.throws(() => constraints(d, query));
});
test('无效筛选参数被拒绝，空上限表示不限', () => {
  const d = fixture();
  for (const query of ['maxCost=-1', 'maxDuration=NaN', 'minQuality=101', 'channel=all', 'preference=unknown', 'maxCost=Infinity']) assert.throws(() => constraints(d, query));
  const c = constraints(d, 'maxCost=&maxDuration=');
  assert.equal(c.maxCost, null); assert.equal(c.maxDuration, null);
});
test('不一致的耗时或均值口径、不可追溯第三方数据不进入计算', () => {
  for (const meta of [{ durationBasis: 'first-token' }, { aggregation: 'success-only' }, { costBasis: 'per-million-tokens' }, { source: { name: '榜单', type: 'third-party', url: null } }]) {
    const d = fixture(); Object.assign(d.benchmark, meta);
    const r = analyze(d, constraints(d));
    assert.equal(r.stats.comparable, 0); assert.equal(r.stats.excluded, 4); assert.deepEqual(r.recommendations, []);
  }
});
test('推荐始终满足约束且位于前沿；偏好权重不改变前沿', () => {
  const d = fixture(); let baseline;
  for (const preference of ['balanced', 'quality', 'cost', 'speed']) {
    const r = analyze(d, constraints(d, `preference=${preference}`));
    const front = ids(r.records.filter((row) => row.isPareto));
    if (baseline) assert.deepEqual(front, baseline); else baseline = front;
    assert.ok(r.recommendations.every((rec) => r.records.some((row) => row.id === rec.recordId && row.feasible && row.isFeasiblePareto)));
    assert.equal(r.recommendations.find((rec) => rec.kind === 'economy').recordId, 'cheap');
    assert.equal(r.recommendations.find((rec) => rec.kind === 'quality').recordId, 'best');
  }
});
test('相同费用的订阅配置仍按效果和速度形成多个前沿方案', () => {
  const d = fixture();
  d.records = [record('fast', 80, null, 30, { channel: 'subscription' }), record('good', 95, null, 90, { channel: 'subscription' }), record('worse', 70, null, 60, { channel: 'subscription' })];
  const r = analyze(d, constraints(d, 'channel=subscription'));
  assert.deepEqual(ids(r.records.filter((row) => row.isPareto)), ['fast', 'good']);
  assert.ok(r.recommendations.every((rec) => Number.isFinite(rec.record.cost)));
});
test('过期评测显式标记，绝不改写评测时间', () => {
  const d = fixture(); d.benchmark.evaluatedAt = '2020-01-01T00:00:00Z';
  const r = analyze(d, constraints(d));
  assert.equal(r.freshness.stale, true);
  assert.equal(r.benchmark.evaluatedAt, '2020-01-01T00:00:00Z');
});
