import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import type { User } from './auth.js';
import { type Database, type SqlValue, isDatabaseError, rows, transaction } from './db.js';
import { ApiError } from './errors.js';
import { orderStatuses, type OrderStatus, type PaymentStatus, pagination, phone, resourceId, businessDate } from './validation.js';

export const createOrderInput = z.object({
  items: z.array(z.object({ dishId: resourceId, quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(50)
    .refine(items => new Set(items.map(item => item.dishId)).size === items.length, '同一菜品请合并数量'),
  name: z.string().trim().min(1).max(80), phone,
  address: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(1000).default(''),
  payMethod: z.enum(['wechat', 'alipay']),
}).strict();
export const idempotencyKey = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/, 'Idempotency-Key 须为 8–128 位字母、数字、下划线或短横线');
export const orderQuery = pagination.extend({ status: z.enum(orderStatuses).optional() });
export const adminOrderQuery = orderQuery.extend({
  orderNumber: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9]+$/, '订单号只包含字母和数字').optional(),
  dateFrom: businessDate.optional(),
  dateTo: businessDate.optional(),
}).refine(query => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
  path: ['dateTo'], message: '结束日期不能早于开始日期',
});
export const cancelInput = z.object({ reason: z.string().trim().min(1).max(500).default('用户取消') }).strict();
export const transitionInput = z.object({
  status: z.enum(['preparing', 'delivering', 'completed', 'cancelled']),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
export const demoPaymentInput = z.object({ outcome: z.enum(['success', 'failed']) }).strict();

interface OrderRow extends RowDataPacket {
  id: string; orderNumber: string; userId: string; requestHash: string;
  name: string; phone: string; address: string; notes: string;
  status: OrderStatus; paymentStatus: PaymentStatus; payMethod: 'wechat' | 'alipay';
  subtotalCents: number; packingFeeCents: number; totalCents: number; totalItems: number;
  cancelReason: string | null; createdAt: Date; updatedAt: Date; paymentExpiresAt: Date; serverTime: Date;
}
const orderColumns = `id, order_number AS orderNumber, user_id AS userId, request_hash AS requestHash,
  recipient_name AS name, phone, address, notes, status, payment_status AS paymentStatus,
  pay_method AS payMethod, subtotal_cents AS subtotalCents, packing_fee_cents AS packingFeeCents,
  total_cents AS totalCents, total_items AS totalItems, cancel_reason AS cancelReason,
  created_at AS createdAt, updated_at AS updatedAt, payment_expires_at AS paymentExpiresAt, UTC_TIMESTAMP(3) AS serverTime`;

export const PAYMENT_EXPIRY_REASON = '付款超时自动取消';
export async function expireUnpaidOrders(pool: Pool) {
  const [result] = await pool.execute<ResultSetHeader>("UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE status = 'pending_payment' AND payment_status = 'unpaid' AND payment_expires_at <= UTC_TIMESTAMP(3)", [PAYMENT_EXPIRY_REASON]);
  return result.affectedRows;
}

async function orderRow(db: Database, id: string, lock = false): Promise<OrderRow> {
  const [order] = await rows<OrderRow>(db, `SELECT ${orderColumns} FROM orders WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  return order;
}

function checkOwner(order: OrderRow, user: User) {
  if (order.userId !== user.id && user.role !== 'admin') throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
}

export async function getOrder(db: Database, id: string, user: User) {
  // A single transaction keeps status, line items and payment records in one snapshot.
  return 'getConnection' in db ? transaction(db, connection => readOrder(connection, id, user)) : readOrder(db, id, user);
}

async function readOrder(db: Database, id: string, user: User) {
  const order = await orderRow(db, id);
  checkOwner(order, user);
  const items = await rows(db, 'SELECT dish_id AS dishId, name, image_url AS imageUrl, unit_price_cents AS unitPriceCents, quantity FROM order_items WHERE order_id = ? ORDER BY id', [id]);
  const payments = await rows(db, 'SELECT id, kind, outcome, provider, method, amount_cents AS amountCents, created_at AS createdAt FROM payments WHERE order_id = ? ORDER BY created_at, id', [id]);
  const { requestHash: _requestHash, ...visible } = order;
  return { ...visible, total: order.totalCents / 100, date: order.createdAt.toISOString(),
    items: items.map(item => ({ ...item, price: item.unitPriceCents / 100, lineTotalCents: item.unitPriceCents * item.quantity })), payments };
}

function requestHash(input: z.infer<typeof createOrderInput>) {
  return createHash('sha256').update(JSON.stringify({ ...input, items: [...input.items].sort((a, b) => a.dishId.localeCompare(b.dishId)) })).digest('hex');
}

async function existingOrder(pool: Pool, user: User, key: string, hash: string) {
  const [existing] = await rows<OrderRow>(pool, `SELECT ${orderColumns} FROM orders WHERE user_id = ? AND idempotency_key = ?`, [user.id, key]);
  if (!existing) return null;
  if (existing.requestHash !== hash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '此幂等键已用于不同订单，请为新订单生成新键');
  return { order: await getOrder(pool, existing.id, user), created: false };
}

export async function createOrder(pool: Pool, user: User, input: z.infer<typeof createOrderInput>, key: string, paymentTimeoutSeconds = 900) {
  const hash = requestHash(input);
  const existing = await existingOrder(pool, user, key, hash);
  if (existing) return existing;
  const id = randomUUID();
  try {
    await transaction(pool, async db => {
      const ids = input.items.map(item => item.dishId).sort();
      // Shared locks keep price and availability stable until the order commits.
      const dishes = await rows(db, `SELECT d.id, d.name, d.price_cents AS priceCents, d.image_url AS imageUrl, d.sold_out AS soldOut, d.is_active AS isActive, c.is_active AS categoryActive FROM dishes d JOIN categories c ON c.id = d.category_id WHERE d.id IN (${ids.map(() => '?').join(',')}) ORDER BY d.id FOR SHARE`, ids);
      let subtotal = 0;
      let totalItems = 0;
      const lines = input.items.map(item => {
        const dish = dishes.find(dish => dish.id === item.dishId);
        if (!dish || !dish.isActive || !dish.categoryActive || dish.soldOut) throw new ApiError(409, 'DISH_UNAVAILABLE', `菜品 ${item.dishId} 不存在、已停售或已售罄`);
        subtotal += dish.priceCents * item.quantity;
        totalItems += item.quantity;
        return { ...item, name: dish.name as string, imageUrl: dish.imageUrl as string, priceCents: dish.priceCents as number };
      });
      const packingFee = totalItems * 50;
      if (subtotal + packingFee > 100000000) throw new ApiError(400, 'ORDER_TOO_LARGE', '订单金额超过限制');
      const orderNumber = `SK${Date.now()}${randomBytes(5).toString('hex')}`;
      await db.execute('INSERT INTO orders (id, order_number, user_id, idempotency_key, request_hash, recipient_name, phone, address, notes, pay_method, subtotal_cents, packing_fee_cents, total_cents, total_items, payment_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND))',
        [id, orderNumber, user.id, key, hash, input.name, input.phone, input.address, input.notes, input.payMethod, subtotal, packingFee, subtotal + packingFee, totalItems, paymentTimeoutSeconds]);
      for (const line of lines) {
        await db.execute('INSERT INTO order_items (order_id, dish_id, name, image_url, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)', [id, line.dishId, line.name, line.imageUrl, line.priceCents, line.quantity]);
      }
    });
  } catch (error) {
    if (isDatabaseError(error, 'ER_DUP_ENTRY')) {
      const retry = await existingOrder(pool, user, key, hash);
      if (retry) return retry;
    }
    throw error;
  }
  return { order: await getOrder(pool, id, user), created: true };
}

export async function listOrders(pool: Pool, user: User, query: z.infer<typeof adminOrderQuery>, admin = false) {
  const conditions = admin ? ['1 = 1'] : ['user_id = ?'];
  const params: SqlValue[] = admin ? [] : [user.id];
  if (query.status) { conditions.push('status = ?'); params.push(query.status); }
  if (admin && query.orderNumber) { conditions.push('LOWER(order_number) LIKE ?'); params.push(`%${query.orderNumber.toLowerCase()}%`); }
  // Business dates are Beijing calendar days; database connections and DATETIME values use UTC.
  if (admin && query.dateFrom) {
    conditions.push('created_at >= ?'); params.push(new Date(`${query.dateFrom}T00:00:00+08:00`));
  }
  if (admin && query.dateTo) {
    conditions.push('created_at < ?'); params.push(new Date(new Date(`${query.dateTo}T00:00:00+08:00`).getTime() + 86400000));
  }
  const where = conditions.join(' AND ');
  const [count] = await rows(pool, `SELECT COUNT(*) AS total FROM orders WHERE ${where}`, params);
  const orderIds = await rows(pool, `SELECT id FROM orders WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
  const items = await Promise.all(orderIds.map(row => getOrder(pool, row.id as string, user)));
  return { items, total: Number(count!.total), page: query.page, pageSize: query.pageSize };
}

export async function pendingOrderNotifications(pool: Pool) {
  // Read the entire lightweight queue in one snapshot, independent of list filters and pagination.
  const pending = await rows(pool, "SELECT id, order_number AS orderNumber FROM orders WHERE status = 'pending_acceptance' AND payment_status = 'paid' ORDER BY created_at, id");
  return { pending, total: pending.length };
}

export async function cancelOrder(pool: Pool, id: string, user: User, reason: string) {
  await transaction(pool, async db => {
    const order = await orderRow(db, id, true);
    checkOwner(order, user);
    if (order.status === 'cancelled' && order.paymentStatus === 'unpaid') return;
    if (order.status !== 'pending_payment' || order.paymentStatus !== 'unpaid') throw new ApiError(409, 'INVALID_ORDER_STATE', '仅待付款订单可以由顾客取消');
    await db.execute("UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE id = ?", [reason, id]);
  });
  return getOrder(pool, id, user);
}

export async function simulatePayment(pool: Pool, id: string, user: User, outcome: 'success' | 'failed') {
  let expired = false;
  await transaction(pool, async db => {
    const order = await orderRow(db, id, true);
    checkOwner(order, user);
    if (order.paymentStatus === 'paid') return;
    if (order.status === 'cancelled' && order.cancelReason === PAYMENT_EXPIRY_REASON) { expired = true; return; }
    if (order.status !== 'pending_payment') throw new ApiError(409, 'INVALID_ORDER_STATE', '此订单不能付款');
    // Evaluate UTC now after acquiring the row lock, including when lock acquisition waited past the deadline.
    const [deadline] = await rows(db, 'SELECT payment_expires_at <= UTC_TIMESTAMP(3) AS expired FROM orders WHERE id = ?', [id]);
    if (Number(deadline!.expired)) {
      await db.execute("UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE id = ?", [PAYMENT_EXPIRY_REASON, id]);
      expired = true;
      return;
    }
    await recordPayment(db, order, 'charge', outcome);
    if (outcome === 'success') {
      await db.execute("UPDATE orders SET payment_status = 'paid', status = 'pending_acceptance' WHERE id = ?", [id]);
    }
  });
  // Throw after commit: throwing inside the transaction would roll back the automatic cancellation.
  if (expired) throw new ApiError(409, 'PAYMENT_EXPIRED', '付款时间已结束，订单已自动取消，请重新下单');
  return getOrder(pool, id, user);
}

async function recordPayment(db: PoolConnection, order: OrderRow, kind: 'charge' | 'refund', outcome: 'success' | 'failed') {
  await db.execute('INSERT INTO payments (id, order_id, kind, outcome, method, amount_cents) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), order.id, kind, outcome, order.payMethod, order.totalCents]);
}

export async function transitionOrder(pool: Pool, id: string, user: User, input: z.infer<typeof transitionInput>) {
  await transaction(pool, async db => {
    const order = await orderRow(db, id, true);
    if (order.status === input.status) return;
    if (input.status === 'cancelled') {
      if (!input.reason) throw new ApiError(400, 'REASON_REQUIRED', '拒单时请填写原因');
      if (order.status !== 'pending_acceptance' || order.paymentStatus !== 'paid') throw new ApiError(409, 'INVALID_ORDER_STATE', '仅待接单且已付款的订单可以拒单');
      await recordPayment(db, order, 'refund', 'success');
      await db.execute("UPDATE orders SET status = 'cancelled', payment_status = 'refunded', cancel_reason = ? WHERE id = ?", [input.reason, id]);
      return;
    }
    const next: Partial<Record<OrderStatus, OrderStatus>> = { pending_acceptance: 'preparing', preparing: 'delivering', delivering: 'completed' };
    if (order.paymentStatus !== 'paid' || next[order.status] !== input.status) throw new ApiError(409, 'INVALID_ORDER_STATE', '订单状态不能跳转到该阶段');
    await db.execute('UPDATE orders SET status = ? WHERE id = ?', [input.status, id]);
  });
  return getOrder(pool, id, user);
}

export async function orderSummary(pool: Pool) {
  const [summary] = await rows(pool, `SELECT COUNT(*) AS totalOrders,
    COALESCE(SUM(status = 'pending_acceptance'), 0) AS pendingOrders,
    COALESCE(SUM(status = 'completed'), 0) AS completedOrders,
    COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total_cents ELSE 0 END), 0) AS completedAmountCents,
    COALESCE(SUM(payment_status = 'refunded'), 0) AS refundedOrders FROM orders`);
  return Object.fromEntries(Object.entries(summary!).map(([key, value]) => [key, Number(value)]));
}
