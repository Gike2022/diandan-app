import { createPool as createCorePool } from 'mysql2';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export type Database = Pool | PoolConnection;
export type SqlValue = string | number | boolean | Date | null;

export function connectionOptions(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'mysql:' || !/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('DATABASE_URL 必须包含有效的 MySQL 数据库名（字母、数字、下划线）');
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    timezone: 'Z',
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 5000,
  };
}

export function createPool(databaseUrl: string): Pool {
  const pool = createCorePool({ ...connectionOptions(databaseUrl), connectionLimit: 10 });
  // The driver timezone controls serialization; the SQL session separately controls CURRENT_TIMESTAMP.
  pool.on('connection', connection => {
    connection.query("SET SESSION time_zone = '+00:00'", error => { if (error) connection.destroy(); });
  });
  return pool.promise();
}

export async function rows<T extends RowDataPacket = RowDataPacket>(
  db: Database, sql: string, values: SqlValue[] = [],
): Promise<T[]> {
  const [result] = await db.execute<T[]>(sql, values);
  return result;
}

export async function transaction<T>(pool: Pool, fn: (db: PoolConnection) => Promise<T>): Promise<T> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export function isDatabaseError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
