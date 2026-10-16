import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { startOrderExpiryWorker } from './order-expiry-worker.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl, config.databaseSsl);
try {
  await pool.query('SELECT 1');
  const stopExpiryWorker = startOrderExpiryWorker(pool, config.expirySweepIntervalMs);
  const server = createApp(pool, config).listen(config.port, config.host, () => {
    console.log(`点餐 API: http://${config.host}:${config.port}/api/health（支付模式：${config.demoPayments ? '模拟' : '禁用'}）`);
  });
  server.on('error', async () => {
    console.error('API 监听失败，请检查端口是否被占用');
    await stopExpiryWorker();
    await pool.end();
    process.exitCode = 1;
  });
  const stop = () => {
    server.close(() => { void stopExpiryWorker().then(() => pool.end()).then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  console.error('数据库连接失败。请检查 server/.env，先启动 MySQL 并执行 db:migrate。');
  await pool.end();
  process.exitCode = 1;
}
