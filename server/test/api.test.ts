import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connectionOptions, createPool, rows, transaction } from '../src/db.js';
import { migrate } from '../scripts/migration.js';
import { seed } from '../scripts/seed-data.js';
import { expireUnpaidOrders, simulatePayment } from '../src/orders.js';
import { startOrderExpiryWorker } from '../src/order-expiry-worker.js';
import type { User } from '../src/auth.js';
import { mkdir, mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const config = loadConfig();
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('请在 server/.env 配置独立的 TEST_DATABASE_URL；集成测试会清理该测试库中的点餐业务数据');
const database = connectionOptions(testUrl).database;
assert.match(database, /_test(?:_[a-f0-9]+)?$/, '测试数据库名称必须以 _test 或 _test_随机后缀 结尾');
assert.notEqual(database, connectionOptions(config.databaseUrl).database, '测试库不得与应用库同名');

let pool: Pool;
let server: Server;
let base: string;
let customer: string;
let admin: string;
let other: string;
let uploadDirectory: string;

type Json = Record<string, any>;
async function request(path: string, options: { method?: string; token?: string; body?: unknown; key?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const response = await fetch(base + '/api' + path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined || options.raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      ...options.headers,
    },
    body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  return { status: response.status, body: response.status === 204 ? {} : await response.json() as Json, headers: response.headers };
}

const orderBody = () => ({
  items: [{ dishId: 'h1', quantity: 2 }, { dishId: 'd2', quantity: 1 }],
  name: '测试收货人', phone: '13800000000', address: '课程演示地址', notes: '少辣', payMethod: 'wechat',
});
const place = (body: unknown = orderBody(), key: string = randomUUID(), token: string = customer) => request('/orders', { method: 'POST', token, body, key });
const pay = (id: string, outcome = 'success') => request(`/orders/${id}/demo-payment`, { method: 'POST', token: customer, body: { outcome } });
const transition = (id: string, status: string, reason?: string) => request(`/admin/orders/${id}/status`, { method: 'PATCH', token: admin, body: { status, ...(reason ? { reason } : {}) } });

describe('真实 MySQL 点餐 API', { concurrency: false }, () => {
  before(async () => {
    pool = createPool(testUrl);
    uploadDirectory = await mkdtemp(join(tmpdir(), 'sweet-kitchen-api-images-'));
    await migrate(pool);
    for (const table of ['catalog_create_requests', 'payments', 'order_items', 'orders', 'sessions', 'users', 'dishes', 'categories', 'menu_images']) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await seed(pool, 'Admin12345!', 'Customer12345!');
    server = createApp(pool, { ...config, uploadDirectory, nodeEnv: 'test', demoPayments: true }, { authRateLimit: 200 }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    const a = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin12345!' } });
    const c = await request('/auth/login', { method: 'POST', body: { username: 'demo', password: 'Customer12345!' } });
    assert.equal(a.status, 200);
    assert.equal(c.status, 200);
    admin = a.body.token;
    customer = c.body.token;
    const o = await request('/auth/register', { method: 'POST', body: { username: 'another', password: 'Another123!', displayName: '另一顾客' } });
    assert.equal(o.status, 201);
    other = o.body.token;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool?.end();
    if (uploadDirectory) {
      assert.equal(dirname(resolve(uploadDirectory)), resolve(tmpdir()));
      assert.ok(basename(uploadDirectory).startsWith('sweet-kitchen-api-images-'));
      await rm(uploadDirectory, { recursive: true, force: true });
    }
  });

  it('健康检查确认连接 MySQL 并标明模拟支付', async () => {
    const result = await request('/health');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: 'ok', database: 'mysql', paymentMode: 'demo' });
    assert.equal(result.headers.get('x-powered-by'), null);
  });

  it('云端统一入口支持页面直达，保留 API 错误并拒绝泄露隐藏文件', async () => {
    const frontendDirectory = join(uploadDirectory, 'frontend');
    await mkdir(join(frontendDirectory, 'assets'), { recursive: true });
    const html = '<!doctype html><html><body>cloud-frontend</body></html>';
    await writeFile(join(frontendDirectory, 'index.html'), html);
    await writeFile(join(frontendDirectory, 'assets', 'app.js'), 'console.log("cloud")');
    await writeFile(join(frontendDirectory, '.env'), 'PRIVATE_VALUE=must-never-be-served');
    const combined = createApp(pool, { ...config, frontendDirectory, trustProxyHops: 1, corsOrigins: ['https://ordering.example'] }).listen(0, '127.0.0.1');
    await once(combined, 'listening');
    const address = combined.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      for (const path of ['/', '/login', '/register', '/profile', '/admin', '/orders/example']) {
        const response = await fetch(origin + path, { headers: { Accept: 'text/html' } });
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('content-type')!, /text\/html/);
        assert.equal(await response.text(), html);
      }
      assert.equal((await fetch(origin + '/assets/app.js')).status, 200);
      for (const path of ['/api/not-found', '/assets/missing.js', '/.env', '/missing.css']) {
        const response = await fetch(origin + path, { headers: { Accept: 'text/html' } });
        assert.equal(response.status, 404, path);
        assert.match(response.headers.get('content-type')!, /application\/json/);
        assert.ok(!(await response.text()).includes('must-never-be-served'));
      }
      const ownOrigin = await fetch(origin + '/api/menu', { headers: { Origin: 'https://ordering.example' } });
      assert.equal(ownOrigin.status, 200);
      assert.equal(ownOrigin.headers.get('access-control-allow-origin'), 'https://ordering.example');
      assert.equal((await fetch(origin + '/admin', { method: 'POST' })).status, 404);
      assert.equal((await fetch(origin + '/profile', { method: 'HEAD' })).status, 200);
    } finally {
      await new Promise<void>(resolve => combined.close(() => resolve()));
    }
  });

  it('云端图片写入 MySQL 并去重，新实例无需本地文件仍能读取原图片', async () => {
    const unusedDirectory = join(uploadDirectory, 'no-local-image-files');
    const png = await sharp({ create: { width: 128, height: 64, channels: 3, background: '#a454cc' } }).png().toBuffer();
    const imageConfig = { ...config, uploadDirectory: unusedDirectory, imageStorage: 'mysql' as const };
    const uploader = createApp(pool, imageConfig).listen(0, '127.0.0.1');
    await once(uploader, 'listening');
    const address = uploader.address();
    assert.ok(address && typeof address !== 'string');
    let imageUrl = '';
    let expected: Buffer;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const uploaded = await fetch(`http://127.0.0.1:${address.port}/api/admin/uploads/images`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'image/png' }, body: png });
        assert.equal(uploaded.status, 201);
        const body = await uploaded.json() as Json;
        if (imageUrl) assert.equal(body.imageUrl, imageUrl);
        imageUrl = body.imageUrl;
      }
      const stored = await rows(pool, 'SELECT content FROM menu_images WHERE hash = ?', [imageUrl.split('/').at(-1)!.slice(0, 64)]);
      assert.equal(stored.length, 1);
      expected = stored[0]!.content as Buffer;
      await assert.rejects(access(unusedDirectory), { code: 'ENOENT' });
    } finally {
      await new Promise<void>(resolve => uploader.close(() => resolve()));
    }
    const restartedPool = createPool(testUrl);
    const reader = createApp(restartedPool, imageConfig).listen(0, '127.0.0.1');
    await once(reader, 'listening');
    const restartedAddress = reader.address();
    assert.ok(restartedAddress && typeof restartedAddress !== 'string');
    const restartedBase = `http://127.0.0.1:${restartedAddress.port}`;
    try {
      const response = await fetch(restartedBase + imageUrl);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected!);
      assert.equal((await fetch(restartedBase + '/api/uploads/menu/' + '0'.repeat(64) + '.webp')).status, 404);
      assert.equal((await fetch(restartedBase + '/api/uploads/menu/.env')).status, 404);
    } finally {
      await new Promise<void>(resolve => reader.close(() => resolve()));
      await restartedPool.end();
    }
  });

  it('SQL 迁移与初始化可重复执行，保留已修改的数据和密码', async () => {
    await pool.execute("UPDATE dishes SET description = '商家已修改' WHERE id = 'h1'");
    const [before] = await rows(pool, "SELECT password_hash FROM users WHERE username = 'admin'");
    await migrate(pool);
    await seed(pool, 'Different123!', 'Different123!');
    const [after] = await rows(pool, "SELECT password_hash FROM users WHERE username = 'admin'");
    assert.equal(after!.password_hash, before!.password_hash);
    const menu = await request('/menu?pageSize=100');
    assert.equal(menu.body.total, 15);
    assert.equal(menu.body.items.find((dish: Json) => dish.id === 'h1').description, '商家已修改');
    assert.equal((await request('/categories')).body.categories.length, 5);
  });

  it('登录不暴露密码哈希，session 只保存令牌摘要', async () => {
    const me = await request('/auth/me', { token: customer });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'customer');
    assert.equal(me.body.user.passwordHash, undefined);
    const sessions = await rows(pool, 'SELECT token_hash FROM sessions');
    assert.ok(sessions.length >= 3);
    assert.ok(sessions.every(row => row.token_hash !== customer));
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'demo', password: 'Incorrect123' } })).status, 401);
  });

  it('注册禁止自设管理员，重复账号返回冲突', async () => {
    const body = { username: 'malicious', password: 'Password123!', displayName: '测试', role: 'admin' };
    assert.equal((await request('/auth/register', { method: 'POST', body })).status, 400);
    assert.equal((await request('/auth/register', { method: 'POST', body: { username: 'demo', password: 'Password123!', displayName: '测试' } })).status, 409);
    assert.equal((await request('/admin/menu', { token: customer })).status, 403);
    assert.equal((await request('/admin/menu')).status, 401);
  });

  it('参数、无效 JSON、错误内容类型和来源有明确错误码', async () => {
    assert.equal((await request('/menu?page=-1')).status, 400);
    assert.equal((await request('/menu?pageSize=101')).status, 400);
    assert.equal((await request('/menu?search=' + encodeURIComponent("' OR 1=1 --"))).body.total, 0);
    assert.equal((await request('/auth/login', { method: 'POST', raw: '{bad' })).body.error.code, 'INVALID_JSON');
    assert.equal((await request('/auth/login', { method: 'POST', raw: 'anything', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await request('/menu', { headers: { Origin: 'https://unapproved.example' } })).status, 403);
    assert.equal((await request('/missing')).status, 404);
    assert.equal((await request('/auth/login', { method: 'POST', raw: JSON.stringify({ password: 'a'.repeat(110000) }) })).status, 413);
  });

  it('菜单支持分类、搜索、分页与停售隐藏', async () => {
    const result = await request('/menu?categoryId=main&search=' + encodeURIComponent('红烧'));
    assert.equal(result.body.total, 1);
    assert.equal(result.body.items[0].id, 'h1');
    const category = await request('/admin/categories', { method: 'POST', token: admin, body: { name: '临时分类' } });
    assert.equal(category.status, 201);
    const dish = await request('/admin/menu', { method: 'POST', token: admin, body: { categoryId: category.body.category.id, name: '测试菜品', priceCents: 1234 } });
    assert.equal(dish.status, 201);
    const id = dish.body.dish.id;
    assert.equal((await request('/menu/' + id)).body.dish.price, 12.34);
    assert.equal((await request('/admin/categories/' + category.body.category.id, { method: 'PATCH', token: admin, body: { isActive: false } })).status, 200);
    assert.equal((await request('/menu/' + id)).status, 404);
    await request('/admin/categories/' + category.body.category.id, { method: 'PATCH', token: admin, body: { isActive: true } });
    await request('/admin/menu/' + id, { method: 'DELETE', token: admin });
    assert.equal((await request('/menu/' + id)).status, 404);
    const all = await request('/admin/menu?pageSize=100', { token: admin });
    assert.equal(all.body.items.find((item: Json) => item.id === id).isActive, false);
    assert.equal((await request('/admin/menu/' + id, { method: 'PATCH', token: admin, body: { priceCents: -1 } })).status, 400);
    assert.equal((await request('/admin/menu/' + id, { method: 'PATCH', token: admin, body: {} })).status, 400);
  });

  it('下单由数据库计价，保存手机号、包装费与菜品 ID', async () => {
    const result = await place();
    assert.equal(result.status, 201);
    const order = result.body.order;
    assert.equal(order.subtotalCents, 14200);
    assert.equal(order.packingFeeCents, 150);
    assert.equal(order.totalCents, 14350);
    assert.equal(order.phone, '13800000000');
    assert.equal(order.totalItems, 3);
    assert.equal(order.status, 'pending_payment');
    assert.equal(order.paymentStatus, 'unpaid');
    assert.equal(order.items[0].dishId, 'h1');
    assert.equal(order.requestHash, undefined);
    assert.equal((await place({ ...orderBody(), total: 0.01 })).status, 400);
  });

  it('拒绝售罄、不存在的菜品、空购物车、重复菜品与非法数量', async () => {
    for (const items of [[], [{ dishId: 'h4', quantity: 1 }], [{ dishId: 'missing', quantity: 1 }], [{ dishId: 'h1', quantity: 0 }], [{ dishId: 'h1', quantity: 100 }], [{ dishId: 'h1', quantity: 1.5 }], [{ dishId: 'h1', quantity: 1 }, { dishId: 'h1', quantity: 2 }]]) {
      const result = await place({ ...orderBody(), items });
      assert.ok([400, 409].includes(result.status));
    }
    assert.equal((await request('/orders', { method: 'POST', token: customer, body: orderBody() })).status, 400);
  });

  it('相同幂等键重试和并发提交只有一笔订单，不同请求重用键会冲突', async () => {
    const key = randomUUID();
    const requests = await Promise.all(Array.from({ length: 6 }, () => place(orderBody(), key)));
    assert.ok(requests.every(result => [200, 201].includes(result.status)), JSON.stringify(requests.map(result => result.body)));
    assert.equal(requests.filter(result => result.status === 201).length, 1);
    assert.equal(new Set(requests.map(result => result.body.order.id)).size, 1);
    assert.equal((await place({ ...orderBody(), address: '不同地址' }, key)).status, 409);
    const [count] = await rows(pool, 'SELECT COUNT(*) AS total FROM orders WHERE idempotency_key = ?', [key]);
    assert.equal(Number(count!.total), 1);
    const reversed = { ...orderBody(), items: [...orderBody().items].reverse() };
    assert.equal((await place(reversed, key)).status, 200);
  });

  it('订单记录快照，菜单改价与停售不会修改旧订单', async () => {
    const created = (await place()).body.order;
    await request('/admin/menu/h1', { method: 'PATCH', token: admin, body: { priceCents: 7000, name: '新的菜名', soldOut: true } });
    const saved = (await request('/orders/' + created.id, { token: customer })).body.order;
    assert.equal(saved.totalCents, 14350);
    assert.equal(saved.items[0].name, '爱心红烧肉');
    assert.equal(saved.items[0].unitPriceCents, 6800);
    assert.equal((await place()).status, 409);
    await request('/admin/menu/h1', { method: 'PATCH', token: admin, body: { priceCents: 6800, name: '爱心红烧肉', soldOut: false } });
  });

  it('其他顾客不能读取、取消或支付他人的订单', async () => {
    const id = (await place()).body.order.id;
    assert.equal((await request('/orders/' + id, { token: other })).status, 404);
    assert.equal((await request(`/orders/${id}/cancel`, { method: 'POST', token: other, body: {} })).status, 404);
    assert.equal((await request(`/orders/${id}/demo-payment`, { method: 'POST', token: other, body: { outcome: 'success' } })).status, 404);
    assert.equal((await request('/orders', { token: other })).body.total, 0);
    assert.equal((await request('/orders/' + id, { token: admin })).status, 200);
  });

  it('模拟支付失败后可重试，并发成功付款只有一条成功记录', async () => {
    const id = (await place()).body.order.id;
    const failed = await pay(id, 'failed');
    assert.equal(failed.body.mode, 'demo');
    assert.equal(failed.body.order.status, 'pending_payment');
    const results = await Promise.all([pay(id), pay(id), pay(id)]);
    assert.ok(results.every(result => result.status === 200));
    const order = (await request('/orders/' + id, { token: customer })).body.order;
    assert.equal(order.status, 'pending_acceptance');
    assert.equal(order.paymentStatus, 'paid');
    assert.equal(order.payments.filter((payment: Json) => payment.outcome === 'failed').length, 1);
    assert.equal(order.payments.filter((payment: Json) => payment.outcome === 'success').length, 1);
  });

  it('顾客取消可重试，取消后的订单不可付款', async () => {
    const id = (await place()).body.order.id;
    const options = { method: 'POST', token: customer, body: { reason: '计划变更' } };
    assert.equal((await request(`/orders/${id}/cancel`, options)).body.order.status, 'cancelled');
    assert.equal((await request(`/orders/${id}/cancel`, options)).status, 200);
    assert.equal((await pay(id)).status, 409);
  });

  it('付款与取消并发执行时只有一个操作成功，付款记录与最终状态一致', async () => {
    const id = (await place()).body.order.id;
    const result = await Promise.all([pay(id), request(`/orders/${id}/cancel`, { method: 'POST', token: customer, body: {} })]);
    assert.deepEqual(result.map(value => value.status).sort(), [200, 409]);
    const order = (await request('/orders/' + id, { token: customer })).body.order;
    if (order.status === 'cancelled') {
      assert.equal(order.paymentStatus, 'unpaid');
      assert.equal(order.payments.length, 0);
    } else {
      assert.equal(order.status, 'pending_acceptance');
      assert.equal(order.paymentStatus, 'paid');
      assert.equal(order.payments.length, 1);
    }
  });

  it('商家订单状态只能按流程推进，完成订单不能回退', async () => {
    const id = (await place()).body.order.id;
    assert.equal((await transition(id, 'preparing')).status, 409);
    await pay(id);
    assert.equal((await transition(id, 'completed')).status, 409);
    for (const status of ['preparing', 'delivering', 'completed']) {
      const result = await transition(id, status);
      assert.equal(result.status, 200);
      assert.equal(result.body.order.status, status);
    }
    assert.equal((await transition(id, 'preparing')).status, 409);
    assert.equal((await transition(id, 'completed')).status, 200);
    const summary = await request('/admin/orders/summary', { token: admin });
    assert.ok(summary.body.summary.completedAmountCents >= 14350);
    assert.equal(summary.body.paymentMode, 'demo');
  });

  it('商家拒单需要原因，退款与取消幂等记录', async () => {
    const id = (await place()).body.order.id;
    await pay(id);
    assert.equal((await transition(id, 'cancelled')).status, 400);
    const result = await transition(id, 'cancelled', '今日已打烊');
    assert.equal(result.body.order.paymentStatus, 'refunded');
    await transition(id, 'cancelled', '今日已打烊');
    const saved = (await request('/orders/' + id, { token: customer })).body.order;
    assert.equal(saved.payments.filter((payment: Json) => payment.kind === 'refund').length, 1);
    assert.equal((await pay(id)).status, 409);
  });

  it('数据库事务异常会回滚写入，外键及金额约束有效', async () => {
    await assert.rejects(transaction(pool, async db => {
      await db.execute("INSERT INTO categories (id, name) VALUES ('rollback-test', '应当回滚')");
      throw new Error('模拟数据库操作失败');
    }), /模拟数据库操作失败/);
    assert.equal((await rows(pool, "SELECT id FROM categories WHERE id = 'rollback-test'")).length, 0);
    await assert.rejects(pool.execute("INSERT INTO dishes (id, category_id, name, description, price_cents) VALUES ('invalid-test', 'main', '非法价格', '', 0)"));
    await assert.rejects(pool.execute("INSERT INTO dishes (id, category_id, name, description, price_cents) VALUES ('invalid-fk', 'missing-category', '非法分类', '', 100)"));
  });

  it('订单明细写入中断时，整个下单事务回滚且不遗留空订单', async () => {
    const [before] = await rows(pool, 'SELECT COUNT(*) AS total FROM orders');
    // Inject a database write failure using only privileges on this test schema.
    await pool.query('ALTER TABLE order_items ADD CONSTRAINT test_reject_quantity CHECK (quantity <> 98)');
    try {
      assert.equal((await place({ ...orderBody(), items: [{ dishId: 'k2', quantity: 98 }] })).status, 500);
    } finally {
      await pool.query('ALTER TABLE order_items DROP CHECK test_reject_quantity');
    }
    const [after] = await rows(pool, 'SELECT COUNT(*) AS total FROM orders');
    assert.equal(after!.total, before!.total);
  });

  it('订单在新建数据库连接后仍可读取', async () => {
    const id = (await place()).body.order.id;
    const freshPool = createPool(testUrl);
    try {
      const [saved] = await rows(freshPool, 'SELECT id, phone FROM orders WHERE id = ?', [id]);
      assert.equal(saved!.phone, '13800000000');
    } finally {
      await freshPool.end();
    }
    const listing = await request('/orders?pageSize=2', { token: customer });
    assert.equal(listing.body.items.length, 2);
    assert.ok(listing.body.total > 2);
  });

  it('菜品和分类创建的幂等键支持并发重试、内容冲突和失败回滚', async () => {
    const body = { categoryId: 'main', name: '幂等创建测试菜品', priceCents: 1234 };
    const key = randomUUID();
    const results = await Promise.all([0, 1].map(() => request('/admin/menu', { method: 'POST', token: admin, body, key })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
    assert.equal(results[0]!.body.dish.id, results[1]!.body.dish.id);
    const conflict = await request('/admin/menu', { method: 'POST', token: admin, body: { ...body, priceCents: 2000 }, key });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
    const category = await request('/admin/categories', { method: 'POST', token: admin, body: { name: '幂等创建分类' }, key });
    assert.equal(category.status, 201);
    const retry = await request('/admin/categories', { method: 'POST', token: admin, body: { name: '幂等创建分类' }, key });
    assert.equal(retry.status, 200);
    assert.equal(category.body.category.id, retry.body.category.id);
    const rollbackKey = randomUUID();
    assert.equal((await request('/admin/menu', { method: 'POST', token: admin, body: { ...body, categoryId: 'missing-category' }, key: rollbackKey })).status, 409);
    assert.equal((await rows(pool, 'SELECT request_key FROM catalog_create_requests WHERE request_key = ?', [rollbackKey])).length, 0);
    assert.equal((await request('/admin/menu', { method: 'POST', token: admin, body, key: rollbackKey })).status, 201);
  });

  it('菜品与分类条件版本更新拒绝旧表单，两个并发编辑仅一个成功', async () => {
    const created = await request('/admin/menu', { method: 'POST', token: admin, body: { categoryId: 'main', name: '版本检查菜品', priceCents: 1000 } });
    const dish = created.body.dish;
    const results = await Promise.all([
      request(`/admin/menu/${dish.id}`, { method: 'PATCH', token: admin, body: { priceCents: 2000, expectedVersion: dish.version } }),
      request(`/admin/menu/${dish.id}`, { method: 'PATCH', token: admin, body: { soldOut: true, expectedVersion: dish.version } }),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const changed = results.find(result => result.status === 200)!.body.dish;
    assert.equal(changed.version, dish.version + 1);
    assert.equal((await request(`/admin/menu/${dish.id}`, { method: 'PATCH', token: admin, body: { description: '旧表单', expectedVersion: dish.version } })).status, 409);
    const category = (await request('/admin/categories', { method: 'POST', token: admin, body: { name: '版本检查分类' } })).body.category;
    assert.equal((await request(`/admin/categories/${category.id}`, { method: 'PATCH', token: admin, body: { sortOrder: 9, expectedVersion: category.version } })).status, 200);
    assert.equal((await request(`/admin/categories/${category.id}`, { method: 'PATCH', token: admin, body: { isActive: false, expectedVersion: category.version } })).status, 409);
  });

  it('连接池新建的每条会话使用UTC，自动更新时间没有8小时偏移', async () => {
    const freshPool = createPool(testUrl);
    const connections = await Promise.all(Array.from({ length: 10 }, () => freshPool.getConnection()));
    try {
      for (const db of connections) {
        const [zone] = await rows(db, 'SELECT @@session.time_zone AS zone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS seconds');
        assert.equal(zone!.zone, '+00:00');
        assert.equal(Number(zone!.seconds), 0);
      }
    } finally { connections.forEach(db => db.release()); await freshPool.end(); }
    const id = (await place()).body.order.id;
    const paid = (await pay(id)).body.order;
    assert.ok(Math.abs(Date.now() - Date.parse(paid.updatedAt)) < 5000);
    assert.ok(Date.parse(paid.updatedAt) - Date.parse(paid.createdAt) < 5000);
  });

  it('新订单默认15分钟付款，幂等重试不会延长截止时间', async () => {
    const key = randomUUID();
    const first = (await place(orderBody(), key)).body.order;
    assert.equal(Date.parse(first.paymentExpiresAt) - Date.parse(first.createdAt), 15 * 60 * 1000);
    const retry = (await place(orderBody(), key)).body.order;
    assert.equal(retry.paymentExpiresAt, first.paymentExpiresAt);
  });

  it('超时扫描只取消到期未付款订单，不改变已付款和未到期订单', async () => {
    const expired = (await place()).body.order.id;
    const future = (await place()).body.order.id;
    const paid = (await place()).body.order.id;
    await pay(paid);
    await pool.execute('UPDATE orders SET payment_expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND), updated_at = updated_at WHERE id IN (?, ?)', [expired, paid]);
    assert.ok(await expireUnpaidOrders(pool) >= 1);
    const result = (await request(`/orders/${expired}`, { token: customer })).body.order;
    assert.equal(result.status, 'cancelled');
    assert.equal(result.paymentStatus, 'unpaid');
    assert.equal(result.cancelReason, '付款超时自动取消');
    assert.equal(result.payments.length, 0);
    assert.equal((await request(`/orders/${future}`, { token: customer })).body.order.status, 'pending_payment');
    assert.equal((await request(`/orders/${paid}`, { token: customer })).body.order.status, 'pending_acceptance');
    assert.equal((await pay(expired)).body.error.code, 'PAYMENT_EXPIRED');
    assert.equal(await expireUnpaidOrders(pool), 0);
  });

  it('付款与到期扫描竞争时只取消，不记付款，且付款拒绝不会回滚取消', async () => {
    const user = (await request('/auth/me', { token: customer })).body.user as User;
    for (const concurrent of [false, true]) {
      const id = (await place()).body.order.id;
      await pool.execute('UPDATE orders SET payment_expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id = ?', [id]);
      const payment = assert.rejects(simulatePayment(pool, id, user, 'success'), { code: 'PAYMENT_EXPIRED' });
      if (concurrent) await expireUnpaidOrders(pool);
      await payment;
      const [saved] = await rows(pool, 'SELECT status, payment_status FROM orders WHERE id = ?', [id]);
      assert.equal(saved!.status, 'cancelled');
      assert.equal(saved!.payment_status, 'unpaid');
      assert.equal((await rows(pool, 'SELECT id FROM payments WHERE order_id = ?', [id])).length, 0);
    }
  });

  it('付款等待行锁期间到期，取得锁后重新检查数据库时间', async () => {
    const user = (await request('/auth/me', { token: customer })).body.user as User;
    const id = (await place()).body.order.id;
    const blocker = await pool.getConnection();
    try {
      await blocker.beginTransaction();
      await blocker.execute('UPDATE orders SET payment_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 100000 MICROSECOND) WHERE id = ?', [id]);
      const payment = simulatePayment(pool, id, user, 'success').then(() => null, error => error);
      await blocker.query('DO SLEEP(0.2)');
      await blocker.commit();
      assert.equal((await payment).code, 'PAYMENT_EXPIRED');
      assert.equal((await request(`/orders/${id}`, { token: customer })).body.order.status, 'cancelled');
    } finally { await blocker.rollback(); blocker.release(); }
  });

  it('后台任务在没有查询请求时自动取消，到期记录在任务重启后补扫', async () => {
    const waitForCancellation = async (id: string) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if ((await rows(pool, 'SELECT status FROM orders WHERE id = ?', [id]))[0]!.status === 'cancelled') return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.fail('后台任务未及时关闭到期订单');
    };
    for (const interval of [20, 10000]) {
      const id = (await place()).body.order.id;
      await pool.execute('UPDATE orders SET payment_expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id = ?', [id]);
      const stop = startOrderExpiryWorker(pool, interval);
      try { await waitForCancellation(id); } finally { await stop(); }
    }
  });

  it('付款时限配置只作用于新订单，注册重名返回可读错误', async () => {
    const custom = createApp(pool, { ...config, paymentTimeoutSeconds: 60 }).listen(0, '127.0.0.1');
    await once(custom, 'listening');
    const address = custom.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${customer}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(orderBody()) });
      assert.equal(response.status, 201);
      const order = (await response.json() as Json).order;
      assert.equal(Date.parse(order.paymentExpiresAt) - Date.parse(order.createdAt), 60000);
      const duplicate = await request('/auth/register', { method: 'POST', body: { username: 'demo', displayName: '重名用户', password: 'Customer12345!' } });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.code, 'USERNAME_TAKEN');
    } finally { await new Promise<void>(resolve => custom.close(() => resolve())); }
  });

  it('商家订单号、北京时间自然日与状态组合查询，分页总数使用相同条件', async () => {
    const prefix = `SEARCH${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const dates = ['2034-04-09 15:59:59.999', '2034-04-09 16:00:00.000', '2034-04-10 15:59:59.999', '2034-04-10 16:00:00.000'];
    const ids: string[] = [];
    for (let index = 0; index < dates.length; index++) {
      const order = (await place()).body.order;
      assert.equal((await pay(order.id)).status, 200);
      ids.push(order.id);
      await pool.execute('UPDATE orders SET order_number = ?, created_at = ?, updated_at = updated_at WHERE id = ?', [`${prefix}${index}`, dates[index], order.id]);
    }
    const query = `/admin/orders?orderNumber=${prefix.toLowerCase()}&dateFrom=2034-04-10&dateTo=2034-04-10`;
    const first = await request(query + '&pageSize=1', { token: admin });
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 2);
    assert.equal(first.body.items[0].id, ids[2]);
    const second = await request(query + '&pageSize=1&page=2', { token: admin });
    assert.equal(second.body.total, 2);
    assert.equal(second.body.items[0].id, ids[1]);
    assert.equal((await request(query + '&page=3&pageSize=1', { token: admin })).body.items.length, 0);
    assert.equal((await request(`/admin/orders?orderNumber=${prefix}&dateFrom=2034-04-10`, { token: admin })).body.total, 3);
    assert.equal((await request(`/admin/orders?orderNumber=${prefix}&dateTo=2034-04-10`, { token: admin })).body.total, 3);
    await transition(ids[1]!, 'preparing');
    const waiting = await request(query + '&status=pending_acceptance', { token: admin });
    assert.equal(waiting.body.total, 1);
    assert.equal(waiting.body.items[0].id, ids[2]);
    assert.equal((await request(`/admin/orders?orderNumber=${prefix}NONE`, { token: admin })).body.total, 0);
    assert.equal((await request(`/admin/orders?orderNumber=${prefix}2`, { token: admin })).body.items[0].id, ids[2]);
  });

  it('查询拒绝非法日期、倒置区间、通配符和注入内容，接口继续校验身份', async () => {
    for (const query of ['dateFrom=2034-02-30', 'dateTo=not-a-date', 'dateFrom=2034-04-11&dateTo=2034-04-10', 'dateTo=9999-12-31', 'orderNumber=%25', 'orderNumber=SK%27OR1', 'orderNumber=SK&orderNumber=ABC']) {
      const result = await request(`/admin/orders?${query}`, { token: admin });
      assert.equal(result.status, 400, query);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    }
    for (const path of ['/admin/orders?orderNumber=SK', '/admin/orders/notifications']) {
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, { token: customer })).status, 403);
    }
  });

  it('提醒快照包含全部已付款待接单订单，超过一页不遗漏，付款重试及接单退款同步正确', async () => {
    const before = (await request('/admin/orders/notifications', { token: admin })).body;
    const created: string[] = [];
    for (let index = 0; index < 22; index++) {
      const id = (await place()).body.order.id;
      created.push(id);
      assert.equal((await pay(id)).status, 200);
    }
    const unpaid = (await place()).body.order.id;
    await pay(unpaid, 'failed');
    await pay(created[0]!); // Successful payment retries must not add a second notification.
    const snapshot = (await request('/admin/orders/notifications', { token: admin })).body;
    assert.equal(snapshot.total, before.total + 22);
    assert.equal(snapshot.pending.length, snapshot.total);
    assert.equal(new Set(snapshot.pending.map((item: Json) => item.id)).size, snapshot.total);
    for (const id of created) assert.ok(snapshot.pending.some((item: Json) => item.id === id));
    assert.ok(!snapshot.pending.some((item: Json) => item.id === unpaid));
    assert.deepEqual(Object.keys(snapshot.pending[0]).sort(), ['id', 'orderNumber']);
    await transition(created[0]!, 'preparing');
    await transition(created[1]!, 'cancelled', '提醒测试拒单');
    await pay(unpaid);
    const changed = (await request('/admin/orders/notifications', { token: admin })).body;
    assert.equal(changed.total, snapshot.total - 1);
    assert.ok(changed.pending.some((item: Json) => item.id === unpaid));
    assert.ok(!changed.pending.some((item: Json) => item.id === created[0] || item.id === created[1]));
  });

  it('营业统计按北京时间筛选下单群组，排除失败付款/未完成/退款，金额不被明细放大', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 7; index++) {
      const result = await place(); assert.equal(result.status, 201);
      const id = result.body.order.id; ids.push(id);
      if (index !== 4) await pay(id);
      else await pay(id, 'failed');
      if ([0, 1, 5, 6].includes(index)) { await transition(id, 'preparing'); await transition(id, 'delivering'); await transition(id, 'completed'); }
      if (index === 3) await transition(id, 'cancelled', '统计测试退款');
      const date = index === 5 ? '2037-06-09 15:59:59.999' : index === 6 ? '2037-06-11 16:00:00.000' : index === 0 ? '2037-06-09 16:00:00.000' : index === 1 ? '2037-06-11 15:59:59.999' : '2037-06-10 04:00:00.000';
      await pool.execute('UPDATE orders SET created_at = ?, updated_at = updated_at WHERE id = ?', [date, id]);
    }
    const ordersInRange = await rows(pool, 'SELECT total_cents, subtotal_cents FROM orders WHERE id IN (?, ?)', [ids[0]!, ids[1]!]);
    const expectedRevenue = ordersInRange.reduce((sum, order) => sum + Number(order.total_cents), 0);
    const result = await request('/admin/statistics?dateFrom=2037-06-10&dateTo=2037-06-11', { token: admin });
    assert.equal(result.status, 200);
    const stats = result.body;
    assert.equal(stats.summary.totalOrders, 5);
    assert.equal(stats.summary.completedOrders, 2);
    assert.equal(stats.summary.revenueCents, expectedRevenue);
    assert.equal(stats.summary.cancelledOrders, 1);
    assert.equal(stats.summary.refundedCents, Number(ordersInRange[0]!.total_cents));
    assert.equal(stats.daily.length, 2);
    assert.equal(stats.daily[0].completedOrders, 1);
    assert.equal(stats.daily[1].completedOrders, 1);
    assert.equal(stats.daily.reduce((sum: number, day: Json) => sum + day.revenueCents, 0), expectedRevenue);
    assert.equal(stats.statuses.reduce((sum: number, state: Json) => sum + state.count, 0), 5);
    assert.equal(stats.topDishes.find((dish: Json) => dish.dishId === 'h1').quantity, 4);
    assert.equal(stats.topDishes.find((dish: Json) => dish.dishId === 'd2').quantity, 2);
    assert.equal(stats.topDishes.reduce((sum: number, dish: Json) => sum + dish.amountCents, 0), ordersInRange.reduce((sum, order) => sum + Number(order.subtotal_cents), 0));
    const dish = (await request('/menu/h1')).body.dish;
    await request('/admin/menu/h1', { method: 'PATCH', token: admin, body: { priceCents: dish.priceCents + 100 } });
    assert.equal((await request('/admin/statistics?dateFrom=2037-06-10&dateTo=2037-06-11', { token: admin })).body.summary.revenueCents, expectedRevenue);
    await request('/admin/menu/h1', { method: 'PATCH', token: admin, body: { priceCents: dish.priceCents } });
  });

  it('统计空日期补齐零值，限制日期范围并校验管理员身份', async () => {
    const path = '/admin/statistics?dateFrom=2040-01-01&dateTo=2040-01-03';
    const empty = await request(path, { token: admin });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.summary.totalOrders, 0);
    assert.equal(empty.body.summary.revenueCents, 0);
    assert.equal(empty.body.daily.length, 3);
    assert.deepEqual(empty.body.topDishes, []);
    assert.equal((await request('/admin/statistics', { token: admin })).body.daily.length, 7);
    for (const query of ['dateFrom=2037-02-30&dateTo=2037-03-01', 'dateFrom=2037-06-11&dateTo=2037-06-10', 'dateFrom=2037-01-01&dateTo=2037-06-01', 'dateFrom=2037-01-01']) assert.equal((await request(`/admin/statistics?${query}`, { token: admin })).status, 400);
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { token: customer })).status, 403);
  });

  it('图片上传解码转为WebP、去重且公开可读，绑定菜品并保留历史订单图片', async () => {
    const png = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#c45599' } }).png().toBuffer();
    const upload = async () => {
      const response = await fetch(base + '/api/admin/uploads/images', { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'image/png' }, body: png });
      assert.equal(response.status, 201); return await response.json() as Json;
    };
    const image = await upload();
    assert.match(image.imageUrl, /^\/api\/uploads\/menu\/[a-f0-9]{64}\.webp$/);
    assert.equal((await upload()).imageUrl, image.imageUrl);
    const response = await fetch(base + image.imageUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(metadata.width, 1600); assert.equal(metadata.height, 800);
    const dish = (await request('/menu/h1')).body.dish;
    assert.equal((await request('/admin/menu/h1', { token: admin, method: 'PATCH', body: { imageUrl: image.imageUrl } })).status, 200);
    const saved = (await place()).body.order;
    assert.equal(saved.items.find((item: Json) => item.dishId === 'h1').imageUrl, image.imageUrl);
    await request('/admin/menu/h1', { token: admin, method: 'PATCH', body: { imageUrl: dish.imageUrl } });
    assert.equal((await request(`/orders/${saved.id}`, { token: customer })).body.order.items.find((item: Json) => item.dishId === 'h1').imageUrl, image.imageUrl);
    assert.equal((await fetch(base + image.imageUrl)).status, 200);
  });

  it('上传拒绝普通顾客、伪图片、SVG、超限文件及越界文件路径', async () => {
    const send = (token: string | undefined, type: string, body: Buffer) => fetch(base + '/api/admin/uploads/images', { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body });
    assert.equal((await send(undefined, 'image/png', Buffer.from('x'))).status, 401);
    assert.equal((await send(customer, 'image/png', Buffer.from('x'))).status, 403);
    assert.equal((await send(admin, 'image/svg+xml', Buffer.from('<svg/>'))).status, 415);
    assert.equal((await send(admin, 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).status, 400);
    assert.equal((await send(admin, 'image/jpeg', Buffer.from('broken jpeg'))).status, 400);
    assert.equal((await send(admin, 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
    const oversizedPixels = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    assert.equal((await send(admin, 'image/png', oversizedPixels)).status, 400);
    assert.equal((await fetch(base + '/api/uploads/menu/' + '0'.repeat(64) + '.webp')).status, 404);
    assert.equal((await fetch(base + '/api/uploads/menu/.env')).status, 404);
    assert.equal((await request('/admin/menu/h1', { method: 'PATCH', token: admin, body: { imageUrl: '/api/uploads/menu/../../.env' } })).status, 400);
  });

  it('资料更新只影响本人，拒绝篡改角色/账号，允许清空电话且不泄露密码摘要', async () => {
    const registered = await request('/auth/register', { method: 'POST', body: { username: 'profiletest', password: 'Profile123!', displayName: '原昵称' } });
    const token = registered.body.token;
    const changed = await request('/auth/me', { method: 'PATCH', token, body: { displayName: ' 新昵称 ', phone: '13800000000' } });
    assert.equal(changed.status, 200); assert.equal(changed.body.user.displayName, '新昵称');
    assert.equal(changed.body.user.phone, '13800000000');
    assert.ok(!('passwordHash' in changed.body.user)); assert.ok(!('password_hash' in changed.body.user));
    assert.equal((await request('/auth/me', { token: customer })).body.user.username, 'demo');
    for (const extra of [{ role: 'admin' }, { username: 'admin' }, { id: registered.body.user.id }]) assert.equal((await request('/auth/me', { method: 'PATCH', token, body: { displayName: '错误修改', phone: null, ...extra } })).status, 400);
    assert.equal((await request('/auth/me', { method: 'PATCH', token, body: { displayName: '用户', phone: 'bad' } })).status, 400);
    const cleared = await request('/auth/me', { method: 'PATCH', token, body: { displayName: '新昵称', phone: '' } });
    assert.equal(cleared.body.user.phone, null);
    assert.equal((await request('/auth/me', { method: 'PATCH', body: { displayName: '匿名', phone: null } })).status, 401);
  });

  it('改密核对原密码，事务撤销所有旧会话，当前新会话与新密码可用', async () => {
    const registered = await request('/auth/register', { method: 'POST', body: { username: 'passwordtest', password: 'Before123!', displayName: '改密用户' } });
    const token = registered.body.token;
    const second = (await request('/auth/login', { method: 'POST', body: { username: 'passwordtest', password: 'Before123!' } })).body.token;
    assert.equal((await request('/auth/password', { method: 'POST', token, body: { currentPassword: 'Wrong123!', newPassword: 'After123!' } })).status, 400);
    assert.equal((await request('/auth/me', { token })).status, 200);
    for (const body of [{ currentPassword: 'Before123!', newPassword: 'Before123!' }, { currentPassword: 'Before123!', newPassword: 'short' }, { currentPassword: 'Before123!', newPassword: 'After123!', role: 'admin' }]) assert.equal((await request('/auth/password', { method: 'POST', token, body })).status, 400);
    const changed = await request('/auth/password', { method: 'POST', token, body: { currentPassword: 'Before123!', newPassword: 'After123!' } });
    assert.equal(changed.status, 200); assert.notEqual(changed.body.token, token);
    assert.equal((await request('/auth/me', { token })).status, 401);
    assert.equal((await request('/auth/me', { token: second })).status, 401);
    assert.equal((await request('/auth/me', { token: changed.body.token })).status, 200);
    assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'passwordtest', password: 'Before123!' } })).status, 401);
    assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'passwordtest', password: 'After123!' } })).status, 200);
    const [saved] = await rows(pool, 'SELECT password_hash FROM users WHERE id = ?', [registered.body.user.id]);
    assert.ok(!String(saved!.password_hash).includes('After123!'));
  });

  it('并发旧密码登录和改密后不会遗留旧凭据会话，并发改密只有一次成功', async () => {
    const registered = await request('/auth/register', { method: 'POST', body: { username: 'passwordrace', password: 'RaceBefore123!', displayName: '竞争测试' } });
    const token = registered.body.token;
    const [loginAttempt, changed] = await Promise.all([
      request('/auth/login', { method: 'POST', body: { username: 'passwordrace', password: 'RaceBefore123!' } }),
      request('/auth/password', { method: 'POST', token, body: { currentPassword: 'RaceBefore123!', newPassword: 'RaceAfter123!' } }),
    ]);
    assert.equal(changed.status, 200);
    if (loginAttempt.status === 200) assert.equal((await request('/auth/me', { token: loginAttempt.body.token })).status, 401);
    else assert.equal(loginAttempt.status, 401);
    const concurrent = await Promise.all(['NextRaceOne123!', 'NextRaceTwo123!'].map(newPassword => request('/auth/password', { method: 'POST', token: changed.body.token, body: { currentPassword: 'RaceAfter123!', newPassword } })));
    assert.equal(concurrent.filter(result => result.status === 200).length, 1);
    assert.equal(concurrent.filter(result => result.status === 401).length, 1);
  });

  it('退出会吊销令牌，过期会话不能访问', async () => {
    const login = await request('/auth/login', { method: 'POST', body: { username: 'another', password: 'Another123!' } });
    assert.equal((await request('/auth/logout', { method: 'POST', token: login.body.token })).status, 204);
    assert.equal((await request('/auth/me', { token: login.body.token })).status, 401);
    await pool.execute("UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.expires_at = '2000-01-01' WHERE u.username = 'another'");
    assert.equal((await request('/auth/me', { token: other })).status, 401);
  });

  it('禁用模拟支付的实例拒绝模拟付款', async () => {
    const disabled = createApp(pool, { ...config, demoPayments: false }).listen(0, '127.0.0.1');
    await once(disabled, 'listening');
    const address = disabled.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const id = (await place()).body.order.id;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orders/${id}/demo-payment`, { method: 'POST', headers: { Authorization: `Bearer ${customer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'success' }) });
      assert.equal(response.status, 403);
      assert.equal((await response.json() as Json).error.code, 'DEMO_PAYMENTS_DISABLED');
    } finally {
      await new Promise<void>(resolve => disabled.close(() => resolve()));
    }
  });
});
