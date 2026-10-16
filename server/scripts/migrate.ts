import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from './migration.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl, config.databaseSsl);
try {
  await migrate(pool);
  console.log('数据库迁移完成');
} finally {
  await pool.end();
}
