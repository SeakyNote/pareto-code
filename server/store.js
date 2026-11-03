import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DEMO_DATASET } from './catalog.js';
import { AppError, validateDatasets } from './validation.js';
import { exclusionReasons } from './engine.js';

export function createStore(path = ':memory:', { seed = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS benchmarks (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, imported_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (benchmark_id TEXT NOT NULL REFERENCES benchmarks(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (benchmark_id, id));
    CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, benchmark_count INTEGER NOT NULL, record_count INTEGER NOT NULL);
  `);

  const getDataset = (id) => {
    const row = db.prepare('SELECT metadata, imported_at FROM benchmarks WHERE id = ?').get(id);
    if (!row) throw new AppError('未找到此评测快照。', 404);
    return { benchmark: JSON.parse(row.metadata), importedAt: row.imported_at, records: db.prepare('SELECT data FROM records WHERE benchmark_id = ? ORDER BY rowid').all(id).map((r) => JSON.parse(r.data)) };
  };
  const assertNew = (datasets) => {
    const conflicts = datasets.filter((d) => db.prepare('SELECT id FROM benchmarks WHERE id = ?').get(d.benchmark.id));
    if (conflicts.length) throw new AppError('快照 id 已存在。请使用新的 id 保留独立快照，已有数据不会被覆盖。', 409, conflicts.map((d) => d.benchmark.id));
  };
  const importDatasets = (datasets, name = '数据导入') => {
    assertNew(datasets);
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const insertBenchmark = db.prepare('INSERT INTO benchmarks VALUES (?, ?, ?)');
      const insertRecord = db.prepare('INSERT INTO records VALUES (?, ?, ?)');
      for (const { benchmark, records } of datasets) {
        insertBenchmark.run(benchmark.id, JSON.stringify(benchmark), now);
        for (const record of records) insertRecord.run(benchmark.id, record.id, JSON.stringify(record));
      }
      db.prepare('INSERT INTO imports VALUES (?, ?, ?, ?, ?)').run(randomUUID(), String(name).slice(0, 200), now, datasets.length, datasets.reduce((n, d) => n + d.records.length, 0));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return datasets.map((d) => d.benchmark.id);
  };
  if (seed && !db.prepare('SELECT count(*) AS n FROM benchmarks').get().n) importDatasets(validateDatasets(DEMO_DATASET), '内置演示数据');
  return {
    getDataset, assertNew, importDatasets,
    listBenchmarks() {
      return db.prepare('SELECT id FROM benchmarks ORDER BY imported_at DESC, rowid DESC').all().map(({ id }) => {
        const dataset = getDataset(id);
        return { ...dataset.benchmark, importedAt: dataset.importedAt, recordCount: dataset.records.length, channels: [...new Set(dataset.records.map((r) => r.channel))], comparableCount: dataset.records.filter((r) => !exclusionReasons(r, dataset.benchmark).length).length };
      }).sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt) || Date.parse(b.importedAt) - Date.parse(a.importedAt));
    },
    history: () => db.prepare('SELECT id, name, created_at AS createdAt, benchmark_count AS benchmarkCount, record_count AS recordCount FROM imports ORDER BY created_at DESC LIMIT 20').all(),
    close: () => db.close(),
  };
}
