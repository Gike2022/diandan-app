import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'mysql2/promise';
import { authenticate, login, loginInput, register, registerInput, requireAdmin, updateProfile, profileInput, changePassword, passwordInput, type User } from './auth.js';
import * as catalog from './catalog.js';
import type { AppConfig } from './config.js';
import { ApiError, errorHandler } from './errors.js';
import * as orders from './orders.js';
import { resourceId, uuid } from './validation.js';
import { businessStatistics, defaultStatisticsRange, statisticsQuery } from './statistics.js';
import { imageTypes, saveMenuImage } from './images.js';

export function createApp(pool: Pool, config: AppConfig, options: { authRateLimit?: number } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', '该页面来源未获允许'));
  } }));
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'mysql', paymentMode: config.demoPayments ? 'demo' : 'disabled' });
    } catch {
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: '数据库暂时不可用' } });
    }
  });

  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !['/auth/logout', '/admin/uploads/images'].includes(req.path) && !req.is('application/json')) {
      throw new ApiError(415, 'JSON_REQUIRED', '请使用 Content-Type: application/json');
    }
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: options.authRateLimit ?? 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '登录或注册请求过于频繁，请稍后重试' } }); },
  });
  app.post('/api/auth/register', authLimiter, async (req, res) => { res.status(201).json(await register(pool, registerInput.parse(req.body))); });
  app.post('/api/auth/login', authLimiter, async (req, res) => { res.json(await login(pool, loginInput.parse(req.body))); });

  app.get('/api/categories', async (_req, res) => { res.json({ categories: await catalog.categories(pool) }); });
  app.get('/api/menu', async (req, res) => { res.json(await catalog.listMenu(pool, catalog.menuQuery.parse(req.query))); });
  app.get('/api/menu/:id', async (req, res) => { res.json({ dish: await catalog.getDish(pool, resourceId.parse(req.params.id)) }); });

  app.use('/api/auth/me', authenticate(pool));
  app.get('/api/auth/me', (_req, res) => { res.json({ user: res.locals.user }); });
  app.patch('/api/auth/me', async (req, res) => { res.json(await updateProfile(pool, (res.locals.user as User).id, profileInput.parse(req.body))); });
  const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: options.authRateLimit ?? 10, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '修改密码请求过于频繁，请稍后重试' } }); },
  });
  app.post('/api/auth/password', authenticate(pool), passwordLimiter, async (req, res) => {
    res.json(await changePassword(pool, (res.locals.user as User).id, res.locals.tokenHash as string, passwordInput.parse(req.body)));
  });
  app.post('/api/auth/logout', authenticate(pool), async (_req, res) => {
    await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [res.locals.tokenHash]);
    res.status(204).end();
  });

  const expireOrders: express.RequestHandler = async (_req, _res, next) => { await orders.expireUnpaidOrders(pool); next(); };
  app.use('/api/orders', authenticate(pool), expireOrders);
  app.post('/api/orders', async (req, res) => {
    const result = await orders.createOrder(pool, res.locals.user as User, orders.createOrderInput.parse(req.body), orders.idempotencyKey.parse(req.get('Idempotency-Key')), config.paymentTimeoutSeconds);
    res.status(result.created ? 201 : 200).json(result);
  });
  app.get('/api/orders', async (req, res) => { res.json(await orders.listOrders(pool, res.locals.user as User, orders.orderQuery.parse(req.query))); });
  app.get('/api/orders/:id', async (req, res) => { res.json({ order: await orders.getOrder(pool, uuid.parse(req.params.id), res.locals.user as User) }); });
  app.post('/api/orders/:id/cancel', async (req, res) => {
    res.json({ order: await orders.cancelOrder(pool, uuid.parse(req.params.id), res.locals.user as User, orders.cancelInput.parse(req.body).reason) });
  });
  app.post('/api/orders/:id/demo-payment', async (req, res) => {
    if (!config.demoPayments) throw new ApiError(403, 'DEMO_PAYMENTS_DISABLED', '当前环境未开启模拟支付');
    res.json({ mode: 'demo', order: await orders.simulatePayment(pool, uuid.parse(req.params.id), res.locals.user as User, orders.demoPaymentInput.parse(req.body).outcome) });
  });

  app.use('/api/admin', authenticate(pool), requireAdmin);
  const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: options.authRateLimit ?? 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: { code: 'TOO_MANY_UPLOADS', message: '图片上传过于频繁，请稍后重试' } }); },
  });
  app.post('/api/admin/uploads/images', uploadLimiter, (req, _res, next) => {
    if (!imageTypes.includes(req.get('Content-Type')?.split(';')[0]?.toLowerCase() ?? '')) throw new ApiError(415, 'IMAGE_TYPE_UNSUPPORTED', '仅支持 JPG、PNG 和 WebP 图片');
    next();
  }, express.raw({ type: () => true, limit: '5mb', inflate: false }), async (req, res) => { res.status(201).json(await saveMenuImage(config.uploadDirectory, req.body)); });
  app.get('/api/uploads/menu/:filename', (req, res, next) => {
    const filename = String(req.params.filename);
    if (!/^[a-f0-9]{64}\.webp$/.test(filename)) throw new ApiError(404, 'IMAGE_NOT_FOUND', '图片不存在');
    res.sendFile(filename, { root: config.uploadDirectory, dotfiles: 'deny', maxAge: '1y', immutable: true }, error => {
      if (error) next('statusCode' in error && error.statusCode === 404 || 'code' in error && error.code === 'ENOENT' ? new ApiError(404, 'IMAGE_NOT_FOUND', '图片不存在') : error);
    });
  });
  app.get('/api/admin/statistics', expireOrders, async (req, res) => {
    const input = Object.keys(req.query).length ? req.query : defaultStatisticsRange();
    res.json(await businessStatistics(pool, statisticsQuery.parse(input)));
  });
  app.use('/api/admin/orders', expireOrders);
  app.get('/api/admin/categories', async (_req, res) => { res.json({ categories: await catalog.categories(pool, true) }); });
  app.post('/api/admin/categories', async (req, res) => {
    const key = orders.idempotencyKey.optional().parse(req.get('Idempotency-Key'));
    const result = await catalog.createCategory(pool, catalog.categoryInput.parse(req.body), key ? { userId: (res.locals.user as User).id, key } : undefined);
    res.status(result.created ? 201 : 200).json(result);
  });
  app.patch('/api/admin/categories/:id', async (req, res) => { res.json({ category: await catalog.updateCategory(pool, resourceId.parse(req.params.id), catalog.categoryPatch.parse(req.body)) }); });
  app.get('/api/admin/menu', async (req, res) => { res.json(await catalog.listMenu(pool, catalog.menuQuery.parse(req.query), true)); });
  app.post('/api/admin/menu', async (req, res) => {
    const key = orders.idempotencyKey.optional().parse(req.get('Idempotency-Key'));
    const result = await catalog.createDish(pool, catalog.dishInput.parse(req.body), key ? { userId: (res.locals.user as User).id, key } : undefined);
    res.status(result.created ? 201 : 200).json(result);
  });
  app.patch('/api/admin/menu/:id', async (req, res) => { res.json({ dish: await catalog.updateDish(pool, resourceId.parse(req.params.id), catalog.dishPatch.parse(req.body)) }); });
  app.delete('/api/admin/menu/:id', async (req, res) => { res.json({ dish: await catalog.updateDish(pool, resourceId.parse(req.params.id), { isActive: false }) }); });
  app.get('/api/admin/orders/summary', async (_req, res) => { res.json({ summary: await orders.orderSummary(pool), paymentMode: config.demoPayments ? 'demo' : 'disabled' }); });
  app.get('/api/admin/orders/notifications', async (_req, res) => { res.json(await orders.pendingOrderNotifications(pool)); });
  app.get('/api/admin/orders', async (req, res) => { res.json(await orders.listOrders(pool, res.locals.user as User, orders.adminOrderQuery.parse(req.query), true)); });
  app.patch('/api/admin/orders/:id/status', async (req, res) => {
    res.json({ order: await orders.transitionOrder(pool, uuid.parse(req.params.id), res.locals.user as User, orders.transitionInput.parse(req.body)) });
  });

  app.use((_req, _res, next) => { next(new ApiError(404, 'NOT_FOUND', '接口不存在')); });
  app.use(errorHandler);
  return app;
}
