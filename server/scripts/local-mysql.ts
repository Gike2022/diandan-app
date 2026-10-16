import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';
import { escape } from 'mysql2';
import { loadConfig } from '../src/config.js';
import { connectionOptions } from '../src/db.js';

// Optional course-demo helper. It never starts/stops the system MySQL service.
const root = fileURLToPath(new URL('../../.local/mysql/', import.meta.url));
const data = join(root, 'data');
const config = loadConfig();
const options = connectionOptions(config.databaseUrl);
const credentialPath = join(root, 'admin.json');

if (options.host !== '127.0.0.1' || options.port !== 3307 || options.database !== 'order_app' || options.user !== 'order_app') {
  throw new Error('db:local 仅用于 .env.example 中的 127.0.0.1:3307/order_app；已有 MySQL 请直接使用 db:migrate');
}

async function isOurDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(options);
    const [[row]] = await connection.query<mysql.RowDataPacket[]>('SELECT @@datadir AS dataDirectory');
    return resolve(String(row?.dataDirectory)).toLowerCase() === resolve(data).toLowerCase();
  } catch {
    return false;
  } finally {
    await connection?.end();
  }
}

if (process.argv[2] === 'stop') {
  if (!(await isOurDatabase())) throw new Error('未找到本项目的本地 MySQL 实例，没有执行停止操作');
  const { password } = JSON.parse(await readFile(credentialPath, 'utf8')) as { password: string };
  const connection = await mysql.createConnection({ ...options, user: 'root', password });
  try {
    await connection.query('SHUTDOWN');
  } finally {
    await connection.end();
  }
  console.log('项目本地 MySQL 已停止');
} else if (process.argv[2] === 'start') {
  if (await isOurDatabase()) {
    console.log('项目本地 MySQL 已在 127.0.0.1:3307 运行');
  } else {
    await mkdir(root, { recursive: true });
    const mysqld = process.env.MYSQLD_PATH || execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['mysqld'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0]!;
    const base = dirname(dirname(mysqld));
    const logPath = join(root, 'mysql.log');
    const log = openSync(logPath, 'a');
    let credentials: { password: string };
    if (existsSync(credentialPath)) {
      credentials = JSON.parse(await readFile(credentialPath, 'utf8')) as { password: string };
    } else {
      credentials = { password: randomBytes(32).toString('hex') };
      await writeFile(credentialPath, JSON.stringify(credentials), { mode: 0o600 });
    }
    try {
      if (!existsSync(join(data, 'auto.cnf'))) {
        execFileSync(mysqld, ['--no-defaults', `--basedir=${base}`, `--datadir=${data}`, '--initialize-insecure', '--console'], { windowsHide: true, stdio: ['ignore', log, log], timeout: 120000 });
      }
      const initPath = join(root, 'bootstrap.sql');
      const statements = [
        `ALTER USER 'root'@'localhost' IDENTIFIED BY ${escape(credentials.password)}`,
        'CREATE DATABASE IF NOT EXISTS order_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
        'CREATE DATABASE IF NOT EXISTS order_app_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
        ...['localhost', '127.0.0.1'].flatMap(host => [
          `CREATE USER IF NOT EXISTS 'order_app'@'${host}' IDENTIFIED BY ${escape(options.password)}`,
          `GRANT ALL PRIVILEGES ON order_app.* TO 'order_app'@'${host}'`,
          `GRANT ALL PRIVILEGES ON order_app_test.* TO 'order_app'@'${host}'`,
        ]),
      ];
      await writeFile(initPath, statements.map(statement => `${statement};`).join('\n'), { mode: 0o600 });
      const child = spawn(mysqld, [
        '--no-defaults', `--basedir=${base}`, `--datadir=${data}`, '--port=3307', '--bind-address=127.0.0.1',
        '--mysqlx=OFF', '--skip-log-bin', `--init-file=${initPath.replace(/\\/g, '/')}`, `--pid-file=${join(root, 'mysqld.pid')}`, '--console',
      ], { detached: true, windowsHide: true, stdio: ['ignore', log, log] });
      child.on('error', () => { console.error('无法启动 mysqld，请检查 MYSQLD_PATH'); });
      child.unref();
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await isOurDatabase()) { ready = true; break; }
        await delay(500);
      }
      // The bootstrap file contains credentials and is never retained after startup.
      await unlink(initPath).catch(() => undefined);
      if (!ready) throw new Error(`本地 MySQL 未能启动，请检查 ${logPath}；未修改系统 MySQL 服务`);
      console.log('项目本地 MySQL 已启动：127.0.0.1:3307，数据库 order_app / order_app_test');
    } finally {
      closeSync(log);
    }
  }
} else {
  throw new Error('用法：tsx scripts/local-mysql.ts start|stop');
}
