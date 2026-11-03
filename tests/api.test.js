import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { fixture } from './helpers.js';
import { DEMO_DATASET } from '../server/catalog.js';

let store, server, base;
before(async () => {
  store = createStore(); server = createApp(store);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server?.listening) { server.close(); server.closeAllConnections(); await once(server, 'close'); } store?.close(); });
const get = (path) => fetch(base + path);
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('健康状态、静态页面和全部本地资源可访问', async () => {
  assert.equal((await (await get('/api/health')).json()).status, 'ok');
  for (const path of ['/', '/app.js', '/chart.js', '/icons.js', '/utils.js', '/style.css', '/favicon.svg']) {
    const res = await get(path); assert.equal(res.status, 200, path); assert.ok((await res.text()).length > 20);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  }
});
test('仓库源码、环境文件、数据库不会作为静态文件泄露', async () => {
  for (const path of ['/server/index.js', '/.env', '/.data/pareto.sqlite', '/package.json', '/%2e%2e/server/store.js']) assert.equal((await get(path)).status, 404);
});
test('演示目录和选型接口给出来源、快照和正确推荐', async () => {
  const catalog = await (await get('/api/catalog')).json();
  assert.equal(catalog.scenarios.length, 4); assert.equal(catalog.benchmarks[0].source.type, 'demo');
  const result = await (await get('/api/analyze?maxCost=2&maxDuration=1800&minQuality=80')).json();
  assert.equal(result.stats.comparable, 16); assert.equal(result.stats.excluded, 2); assert.equal(result.stats.feasible, 8);
  assert.ok(result.recommendations.every((r) => r.record.cost <= 2 && r.record.duration <= 1800 && r.record.quality >= 80));
  assert.ok(result.records.every((r) => r.dominatedBy.length <= 5));
});
test('不存在的快照与无效的数值参数返回明确错误', async () => {
  assert.equal((await get('/api/analyze?benchmark=missing')).status, 404);
  for (const query of ['maxCost=-1', 'channel=all', 'minQuality=Infinity', 'monthlyTasks=0']) {
    const res = await get(`/api/analyze?${query}`); assert.equal(res.status, 400, query); assert.ok((await res.json()).error);
  }
});
test('预览无副作用，确认后快照、配置与导入历史一同写入', async () => {
  const body = { format: 'json', text: JSON.stringify(fixture('api-import')), fileName: '真实流程测试.json' };
  const beforeCount = store.listBenchmarks().length;
  const preview = await post('/api/import/preview', body);
  assert.equal(preview.status, 200); assert.equal((await preview.json()).valid, true);
  assert.equal(store.listBenchmarks().length, beforeCount);
  assert.equal((await post('/api/import', body)).status, 201);
  assert.equal(store.listBenchmarks().length, beforeCount + 1);
  const result = await (await get('/api/analyze?benchmark=api-import')).json(); assert.equal(result.stats.pareto, 3);
  const duplicate = await post('/api/import', body); assert.equal(duplicate.status, 409);
  assert.equal(store.listBenchmarks().length, beforeCount + 1);
  assert.equal(store.history()[0].name, '真实流程测试.json');
});
test('错误导入保持数据库不变，并返回可定位的错误详情', async () => {
  const count = store.listBenchmarks().length;
  const d = fixture('bad-import'); d.records[0].quality = -5;
  const res = await post('/api/import', { format: 'json', text: JSON.stringify(d) });
  assert.equal(res.status, 422); assert.match((await res.json()).details.join(), /quality/);
  assert.equal(store.listBenchmarks().length, count);
  assert.equal((await post('/api/import', { format: 'json', text: '{' })).status, 422);
});
test('JSON 和 CSV 模板均可完成预览校验，不冒充实测', async () => {
  for (const format of ['json', 'csv']) {
    const template = await get(`/api/template?format=${format}`);
    assert.match(template.headers.get('content-disposition'), /attachment/);
    const res = await post('/api/import/preview', { format, text: await template.text() });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).datasets[0].source.type, 'demo');
  }
});
test('Markdown 报告包含当前约束、来源、前沿与订阅假设', async () => {
  const res = await get(`/api/report?benchmark=${DEMO_DATASET.benchmark.id}&channel=subscription&monthlyPrice=30&monthlyTasks=300&maxCost=1&maxDuration=1800&minQuality=80`);
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/markdown/);
  const text = await res.text();
  for (const term of ['演示', 'MVP 人工构造', '$30.00', '300', '$0.10', '同一渠道', '规则生成']) assert.ok(text.includes(term), term);
  assert.match(text, /30.0 分钟/); assert.match(text, /GPT-5.6/);
});
test('无满足配置的报告明确写出空结果，保留零预算', async () => {
  const text = await (await get('/api/report?maxCost=0&minQuality=100')).text();
  assert.match(text, /没有配置同时满足/); assert.match(text, /\$0.00/); assert.match(text, /没有自动放宽/);
});
test('跨站写入、错误内容类型和超大请求被拒绝', async () => {
  assert.equal((await post('/api/import', {}, { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post('/api/import', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const text = await fetch(base + '/api/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(text.status, 415);
  const huge = await post('/api/import', { text: 'x'.repeat(4 * 1024 * 1024 + 1), format: 'json' }); assert.equal(huge.status, 413);
});
test('原始快照可导出并保留未参与比较的数据', async () => {
  const id = DEMO_DATASET.benchmark.id;
  const res = await get(`/api/datasets/${id}`);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const dataset = await res.json(); assert.equal(dataset.records.length, 22);
  assert.ok(dataset.records.some((r) => r.duration === null));
});
