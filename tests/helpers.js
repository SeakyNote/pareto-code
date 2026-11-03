import { DEMO_DATASET } from '../server/catalog.js';
export function fixture(id = 'test-benchmark') {
  const dataset = structuredClone(DEMO_DATASET);
  dataset.benchmark.id = id;
  dataset.benchmark.evaluatedAt = '2026-11-01T08:00:00Z';
  dataset.records = [
    record('cheap', 80, 1, 60),
    record('fast', 79, 2, 30),
    record('best', 95, 4, 180),
    record('dominated', 75, 3, 90),
  ];
  return dataset;
}
export function record(id, quality, cost, duration, extra = {}) {
  return { id, model: `模型 ${id}`, version: 'v1', agent: '测试 Agent', provider: 'Test', reasoning: 'medium', channel: 'api', quality, cost, duration, sampleCount: 10, notes: '', ...extra };
}
