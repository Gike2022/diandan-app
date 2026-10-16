import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseConfig } from '../src/config.js';
import { connectionOptions } from '../src/db.js';

const databaseUrl = 'mysql://example:example@db.example:12345/defaultdb?ssl-mode=REQUIRED';

it('公开演示必须明确启用 demo，正常生产环境拒绝模拟付款', () => {
  assert.throws(() => parseConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production', ENABLE_DEMO_PAYMENTS: 'true' }), /APP_MODE=demo/);
  const demo = parseConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production', ENABLE_DEMO_PAYMENTS: 'true', APP_MODE: 'demo' });
  assert.equal(demo.demoPayments, true);
  assert.equal(parseConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production' }).demoPayments, false);
});

it('云数据库 TLS 验证证书和主机名，要求 TLS 的地址不能降级为明文连接', () => {
  assert.throws(() => connectionOptions(databaseUrl), /TLS/);
  const config = parseConfig({ DATABASE_URL: databaseUrl, DATABASE_SSL: 'true', DATABASE_SSL_CA: 'certificate\\nsecond-line' });
  assert.equal(config.databaseSsl!.rejectUnauthorized, true);
  assert.equal(config.databaseSsl!.verifyIdentity, true);
  assert.equal(config.databaseSsl!.ca, 'certificate\nsecond-line');
  assert.equal(connectionOptions(databaseUrl, config.databaseSsl).ssl, config.databaseSsl);
});

it('Render 注入的网址作为允许来源，本机默认仍使用文件存储和独立前端', () => {
  const cloud = parseConfig({ DATABASE_URL: databaseUrl, RENDER_EXTERNAL_URL: 'https://ordering.onrender.com/', IMAGE_STORAGE: 'mysql', SERVE_FRONTEND: 'true', TRUST_PROXY_HOPS: '1' });
  assert.ok(cloud.corsOrigins.includes('https://ordering.onrender.com'));
  assert.equal(cloud.imageStorage, 'mysql');
  assert.equal(cloud.trustProxyHops, 1);
  assert.ok(cloud.frontendDirectory);
  const local = parseConfig({ DATABASE_URL: 'mysql://example:example@localhost/order_app' });
  assert.equal(local.imageStorage, 'filesystem');
  assert.equal(local.frontendDirectory, undefined);
  assert.equal(local.databaseSsl, undefined);
});
