import type { Pool } from 'mysql2/promise';
import { expireUnpaidOrders } from './orders.js';

export function startOrderExpiryWorker(pool: Pool, intervalMs = 30000) {
  let stopped = false;
  let running: Promise<void> | null = null;
  const run = () => {
    if (stopped || running) return;
    running = expireUnpaidOrders(pool).then(() => {}).catch(() => {
      console.error('未付款订单超时扫描失败，将在下次扫描重试');
    }).finally(() => { running = null; });
  };
  run(); // Catch up after a restart even when no customer has the page open.
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
