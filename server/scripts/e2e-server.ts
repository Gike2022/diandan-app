import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connectionOptions, createPool } from '../src/db.js';
import { migrate } from './migration.js';
import { seed } from './seed-data.js';
import { startOrderExpiryWorker } from '../src/order-expiry-worker.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const config = loadConfig();
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('缺少 TEST_DATABASE_URL，浏览器测试必须使用独立测试库');
const database = connectionOptions(testUrl).database;
if (!/_test(?:_[a-f0-9]+)?$/.test(database) || database === connectionOptions(config.databaseUrl).database) {
  throw new Error('拒绝重置：浏览器测试库必须与应用库不同，且名称以 _test 或 _test_随机后缀 结尾');
}
const pool = createPool(testUrl);
const uploadDirectory = await mkdtemp(join(tmpdir(), 'sweet-kitchen-e2e-images-'));
await migrate(pool);
for (const table of ['catalog_create_requests', 'payments', 'order_items', 'orders', 'sessions', 'users', 'dishes', 'categories', 'menu_images']) {
  await pool.query(`DELETE FROM ${table}`);
}
await seed(pool, 'Admin12345!', 'Customer12345!');
const stopExpiryWorker = startOrderExpiryWorker(pool, 100);
// Browser suites deliberately perform more than 30 registrations/logins; production keeps its default limit.
const server = createApp(pool, { ...config, uploadDirectory, nodeEnv: 'test', demoPayments: true, corsOrigins: [...config.corsOrigins, 'http://127.0.0.1:5174'] }, { authRateLimit: 200 }).listen(3002, '127.0.0.1', () => {
  console.log('浏览器测试 API 已连接独立测试库，监听 127.0.0.1:3002');
});
const stop = () => { server.close(() => { void stopExpiryWorker().then(() => pool.end()).then(async () => {
  if (dirname(resolve(uploadDirectory)) === resolve(tmpdir()) && basename(uploadDirectory).startsWith('sweet-kitchen-e2e-images-')) await rm(uploadDirectory, { recursive: true, force: true });
  process.exit(0);
}); }); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
