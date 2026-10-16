import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { seed } from './seed-data.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl, config.databaseSsl);
try {
  await seed(pool, process.env.DEMO_ADMIN_PASSWORD ?? '', process.env.DEMO_CUSTOMER_PASSWORD ?? '');
  console.log('初始化完成：5 个分类、15 道菜品；演示账号 admin / demo（密码读取 .env，已有记录保持原值）');
} finally {
  await pool.end();
}
