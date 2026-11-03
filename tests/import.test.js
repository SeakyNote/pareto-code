import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDatasets, parseImport, toCsv, parseCsv } from '../server/validation.js';
import { createStore } from '../server/store.js';
import { fixture } from './helpers.js';

test('JSON 与带 BOM 的 CSV 导入保留模型、版本、渠道及关键元数据', () => {
  const d = fixture();
  d.records[0].notes = '含逗号, 双引号"与\n换行';
  const json = parseImport({ format: 'json', text: '\uFEFF' + JSON.stringify(d) });
  const csv = parseImport({ format: 'csv', text: toCsv(d) });
  assert.deepEqual(csv[0].records, json[0].records);
  for (const field of ['id', 'taskSet', 'scoring', 'evaluatedAt', 'scoreMax', 'currency']) assert.equal(csv[0].benchmark[field], json[0].benchmark[field]);
});
test('空费用不会在 CSV 解析中转换为零', () => {
  const d = fixture(); d.records[0].cost = null;
  const [parsed] = parseImport({ format: 'csv', text: toCsv(d) });
  assert.equal(parsed.records[0].cost, null);
});
test('CSV 恰好 2000 条可导入，2001 条拒绝，末尾换行不影响边界', () => {
  const d = fixture();
  d.records = Array.from({ length: 2000 }, (_, i) => ({ ...d.records[0], id: `row-${i}` }));
  const csv = toCsv(d);
  for (const text of [csv, csv + '\r\n']) assert.equal(parseImport({ format: 'csv', text })[0].records.length, 2000);
  d.records.push({ ...d.records[0], id: 'row-extra' });
  assert.throws(() => parseImport({ format: 'csv', text: toCsv(d) }), /2000/);
});
test('JSON 不允许用字符串、布尔值或负数伪装指标', () => {
  for (const value of ['1', true, -1]) {
    const d = fixture(); d.records[0].cost = value;
    assert.throws(() => validateDatasets(d), (e) => e.status === 422 && e.details.some((v) => v.includes('cost')));
  }
});
test('必要字段和评分范围校验提供具体错误', () => {
  const d = fixture(); d.records[0].quality = 101; d.records[0].sampleCount = 1.5; d.records[0].duration = 0; delete d.records[1].version;
  assert.throws(() => validateDatasets(d), (e) => e.status === 422 && e.details.length >= 4);
  assert.throws(() => validateDatasets({ records: [] }), /校验/);
});
test('无效来源类型、脚本链接、缺少时区日期被拒绝', () => {
  for (const change of [
    (b) => { b.source.url = 'javascript:alert(1)'; },
    (b) => { b.source.type = 'unverified'; },
    (b) => { b.source.name = 42; },
    (b) => { b.evaluatedAt = '2026-11-01'; },
    (b) => { b.currency = 'EUR'; },
  ]) {
    const d = fixture(); change(d.benchmark);
    assert.throws(() => validateDatasets(d), (e) => e.status === 422);
  }
});
test('日期必须真实存在，不能把无效日历日期悄悄滚动到下个月', () => {
  const d = fixture(); d.benchmark.evaluatedAt = '2026-02-30T08:00:00Z';
  assert.throws(() => validateDatasets(d), (e) => e.status === 422);
});
test('同一快照内重复配置 id 和重复快照 id 被拒绝', () => {
  const d = fixture(); d.records[1].id = d.records[0].id;
  assert.throws(() => validateDatasets(d), (e) => e.details.some((v) => v.includes('重复')));
  assert.throws(() => validateDatasets({ datasets: [fixture(), fixture()] }), /校验/);
});
test('支持多个场景与人民币快照，每个快照独立保留', () => {
  const a = fixture('a'), b = fixture('b'); b.benchmark.scenario = 'writing'; b.benchmark.currency = 'CNY';
  const store = createStore(':memory:', { seed: false });
  try {
    store.importDatasets(validateDatasets({ datasets: [a, b] }));
    assert.equal(store.listBenchmarks().length, 2);
    assert.equal(store.getDataset('b').benchmark.currency, 'CNY');
    assert.equal(store.getDataset('b').benchmark.scenario, 'writing');
  } finally { store.close(); }
});
test('较旧评测不会因后导入而排在最新评测前面', () => {
  const store = createStore(':memory:', { seed: false });
  try {
    const latest = fixture('latest'); latest.benchmark.evaluatedAt = '2026-11-02T00:00:00Z';
    store.importDatasets(validateDatasets(latest));
    store.importDatasets(validateDatasets(fixture('older')));
    assert.equal(store.listBenchmarks()[0].id, 'latest');
  } finally { store.close(); }
});
test('CSV 同 id 的不同测试集禁止合并', () => {
  const a = fixture();
  const csv = toCsv(a);
  const lines = csv.split('\r\n');
  lines[2] = lines[2].replace(a.benchmark.taskSet, '不同的任务集合');
  assert.throws(() => parseImport({ format: 'csv', text: lines.join('\r\n') }), /元数据不一致/);
});
test('错误 CSV、未闭合引号、重复列和缺列均拒绝', () => {
  for (const csv of ['a,a\n1,2', 'model\nfoo', '"unterminated', toCsv(fixture()).replace('"cheap"', '"cheap"x')]) assert.throws(() => parseCsv(csv));
  assert.throws(() => parseImport({ format: 'json', text: '{' }), /JSON/);
});
test('订阅数据必须通过单独假设折算，不能夹带 API 成本', () => {
  const d = fixture(); d.records[0].channel = 'subscription';
  assert.throws(() => validateDatasets(d), (e) => e.details.some((v) => v.includes('订阅')));
  d.records[0].cost = null; assert.equal(validateDatasets(d).length, 1);
});
test('快照冲突不会覆盖旧数据或留下其他快照的部分写入', () => {
  const store = createStore(':memory:', { seed: false });
  try {
    store.importDatasets(validateDatasets(fixture('existing')));
    assert.throws(() => store.importDatasets(validateDatasets({ datasets: [fixture('new'), fixture('existing')] })), (e) => e.status === 409);
    assert.equal(store.listBenchmarks().length, 1);
    assert.throws(() => store.getDataset('new'), (e) => e.status === 404);
    assert.equal(store.history().length, 1);
  } finally { store.close(); }
});
test('底层数据库写入异常会完整回滚快照及配置', () => {
  const store = createStore(':memory:', { seed: false });
  const d = fixture('rollback'); d.records[1].id = d.records[0].id;
  try {
    assert.throws(() => store.importDatasets([d]));
    assert.equal(store.listBenchmarks().length, 0);
    assert.equal(store.history().length, 0);
  } finally { store.close(); }
});
test('SQLite 关闭并重启后数据和导入历史仍然存在', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pareto-store-'));
  try {
    const path = join(dir, 'data.sqlite');
    const first = createStore(path, { seed: false }); first.importDatasets(validateDatasets(fixture()), '持久化测试'); first.close();
    const second = createStore(path, { seed: false });
    try { assert.equal(second.getDataset('test-benchmark').records.length, 4); assert.equal(second.history()[0].name, '持久化测试'); }
    finally { second.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
