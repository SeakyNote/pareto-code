import { resolve } from 'node:path';
import { createStore } from './store.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const store = createStore(resolve(process.env.DATABASE_PATH || '.data/pareto.sqlite'));
const server = createApp(store);
server.listen(port, host, () => console.log(`Pareto Code MVP 已启动：http://${host}:${port}`));
server.on('error', (error) => { console.error(`启动失败：${error.message}`); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { store.close(); process.exit(0); });
  server.closeIdleConnections();
});
