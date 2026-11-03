import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, DEMO_DATASET } from './catalog.js';
import { AppError, parseImport, toCsv } from './validation.js';
import { analyze, readConstraints, exclusionReasons } from './engine.js';
import { makeReport } from './report.js';

const MAX_BODY = 4 * 1024 * 1024;
const publicDir = new URL('../public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/chart.js', ['chart.js', 'text/javascript; charset=utf-8']],
  ['/icons.js', ['icons.js', 'text/javascript; charset=utf-8']],
  ['/utils.js', ['utils.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const payload = typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(payload);
}

function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new AppError('请求应使用 application/json。', 415);
  if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); throw new AppError('请求超过 4 MiB 上限；文件请控制在 2 MiB 内。', 413); }
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0, tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true; chunks = [];
        reject(new AppError('请求超过 4 MiB 上限。', 413));
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new AppError('请求体不是有效 JSON。')); }
    });
    req.on('error', reject);
  });
}

export function createApp(store) {
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new AppError('不接受来自其他站点的写入请求。', 403);
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('不接受跨站点写入请求。', 403);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { status: 'ok', version: '0.1.0' });
      if (req.method === 'GET' && url.pathname === '/api/catalog') return send(res, 200, { scenarios: SCENARIOS, benchmarks: store.listBenchmarks(), history: store.history() });
      if (req.method === 'GET' && ['/api/analyze', '/api/report'].includes(url.pathname)) {
        const id = url.searchParams.get('benchmark') || store.listBenchmarks()[0]?.id;
        const dataset = store.getDataset(id);
        const result = analyze(dataset, readConstraints(url.searchParams, dataset.benchmark));
        if (url.pathname === '/api/report') return send(res, 200, makeReport(result), 'text/markdown; charset=utf-8', { 'Content-Disposition': `attachment; filename="pareto-report-${dataset.benchmark.id}.md"` });
        return send(res, 200, result);
      }
      if (req.method === 'GET' && /^\/api\/datasets\/[a-zA-Z0-9_-]+$/.test(url.pathname)) {
        const dataset = store.getDataset(url.pathname.split('/').pop());
        return send(res, 200, dataset, undefined, { 'Content-Disposition': `attachment; filename="${dataset.benchmark.id}.json"` });
      }
      if (req.method === 'GET' && url.pathname === '/api/template') {
        const template = {
          benchmark: { ...DEMO_DATASET.benchmark, id: 'my-benchmark-demo-v1', name: '我的代码评测 · 演示模板', evaluatedAt: new Date().toISOString(), notes: '模板数值为演示。请替换为真实实测数据、评分规则、任务集、来源及日期后，将 source.type 改为 internal 或 third-party。' },
          records: DEMO_DATASET.records.slice(2, 5),
        };
        const csv = url.searchParams.get('format') === 'csv';
        return send(res, 200, csv ? toCsv(template) : JSON.stringify(template, null, 2), csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="benchmark-template.${csv ? 'csv' : 'json'}"` });
      }
      if (req.method === 'POST' && ['/api/import/preview', '/api/import'].includes(url.pathname)) {
        const body = await readJson(req);
        if (typeof body?.text === 'string' && Buffer.byteLength(body.text, 'utf8') > 2 * 1024 * 1024) throw new AppError('评测文件超过 2 MiB，请分批导入。', 413);
        const datasets = parseImport(body);
        store.assertNew(datasets);
        const summary = datasets.map(({ benchmark, records }) => ({
          id: benchmark.id, name: benchmark.name, scenario: benchmark.scenario, source: benchmark.source,
          recordCount: records.length,
          comparableCount: records.filter((r) => !exclusionReasons(r, benchmark).length).length,
          excluded: records.filter((r) => exclusionReasons(r, benchmark).length).map((r) => ({ id: r.id, model: r.model, reasons: exclusionReasons(r, benchmark) })),
        }));
        if (url.pathname.endsWith('/preview')) return send(res, 200, { valid: true, datasets: summary });
        const ids = store.importDatasets(datasets, typeof body.fileName === 'string' ? body.fileName : '粘贴数据导入');
        return send(res, 201, { imported: ids, datasets: summary });
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && assets.has(url.pathname)) {
        const [file, mime] = assets.get(url.pathname);
        const body = await readFile(fileURLToPath(new URL(file, publicDir)));
        return send(res, 200, req.method === 'HEAD' ? '' : body, mime);
      }
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) return send(res, 405, { error: '不支持此请求方法。' }, undefined, { Allow: 'GET, HEAD, POST' });
      throw new AppError('未找到请求的资源。', 404);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      if (!res.headersSent) send(res, error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : '服务暂时不可用，请稍后重试。', details: error.details || [] });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
