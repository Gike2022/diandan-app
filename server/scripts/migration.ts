import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';

export async function migrate(pool: Pool, directory = fileURLToPath(new URL('../migrations/', import.meta.url))) {
  const db = await pool.getConnection();
  try {
    const [[info]] = await db.query<RowDataPacket[]>('SELECT DATABASE() AS name');
    const lock = `order-migrate-${createHash('sha256').update(String(info?.name)).digest('hex').slice(0, 40)}`;
    const [[acquired]] = await db.query<RowDataPacket[]>('SELECT GET_LOCK(?, 10) AS acquired', [lock]);
    if (Number(acquired?.acquired) !== 1) throw new Error('另一个迁移进程正在运行，请稍后重试');
    try {
      await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))) ENGINE=InnoDB');
      const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
      for (const name of names) {
        const sql = await readFile(join(directory, name), 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const [[existing]] = await db.query<RowDataPacket[]>('SELECT checksum FROM schema_migrations WHERE name = ?', [name]);
        if (existing) {
          if (existing.checksum !== checksum) throw new Error(`已执行的迁移 ${name} 被修改，请新增迁移文件`);
          continue;
        }
        // Migrations contain plain DDL only. MySQL DDL commits implicitly.
        for (const statement of sql.split(/;\s*(?:\r?\n|$)/).filter(value => value.trim())) {
          await db.query(statement);
        }
        await db.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [name, checksum]);
      }
    } finally {
      await db.query('SELECT RELEASE_LOCK(?)', [lock]);
    }
  } finally {
    db.release();
  }
}
