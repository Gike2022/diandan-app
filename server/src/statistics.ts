import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import { rows, transaction } from './db.js';
import { beijingDayStart, businessDate, orderStatuses } from './validation.js';

const dayMs = 86400000;
export const statisticsQuery = z.object({ dateFrom: businessDate, dateTo: businessDate }).strict()
  .refine(input => input.dateFrom <= input.dateTo, { path: ['dateTo'], message: '结束日期不能早于开始日期' })
  .refine(input => (beijingDayStart(input.dateTo).getTime() - beijingDayStart(input.dateFrom).getTime()) / dayMs < 92, { path: ['dateTo'], message: '统计范围最多为 92 天' });

export function defaultStatisticsRange() {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const dateFrom = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * dayMs).toISOString().slice(0, 10);
  return { dateFrom, dateTo: today };
}

export async function businessStatistics(pool: Pool, range: z.infer<typeof statisticsQuery>) {
  const start = beijingDayStart(range.dateFrom);
  const end = new Date(beijingDayStart(range.dateTo).getTime() + dayMs);
  return transaction(pool, async db => {
    const [totals] = await rows(db, `SELECT COUNT(*) AS totalOrders,
      COALESCE(SUM(status = 'completed' AND payment_status = 'paid'), 0) AS completedOrders,
      COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total_cents ELSE 0 END), 0) AS revenueCents,
      COALESCE(SUM(status = 'cancelled'), 0) AS cancelledOrders
      FROM orders WHERE created_at >= ? AND created_at < ?`, [start, end]);
    const [refund] = await rows(db, `SELECT COALESCE(SUM(p.amount_cents), 0) AS refundedCents FROM payments p
      JOIN orders o ON o.id = p.order_id WHERE p.kind = 'refund' AND p.outcome = 'success' AND o.created_at >= ? AND o.created_at < ?`, [start, end]);
    const groupedDays = await rows(db, `SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS day,
      COUNT(*) AS totalOrders, COALESCE(SUM(status = 'completed' AND payment_status = 'paid'), 0) AS completedOrders,
      COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total_cents ELSE 0 END), 0) AS revenueCents
      FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY day ORDER BY day`, [start, end]);
    const groupedStatuses = await rows(db, 'SELECT status, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status', [start, end]);
    const dishes = await rows(db, `SELECT d.id AS dishId, d.name, SUM(i.quantity) AS quantity, SUM(i.unit_price_cents * i.quantity) AS amountCents
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN dishes d ON d.id = i.dish_id
      WHERE o.created_at >= ? AND o.created_at < ? AND o.status = 'completed' AND o.payment_status = 'paid'
      GROUP BY d.id, d.name ORDER BY quantity DESC, amountCents DESC, dishId LIMIT 5`, [start, end]);
    const daily = [];
    for (let at = start.getTime(); at < end.getTime(); at += dayMs) {
      const day = new Date(at + 8 * 3600000).toISOString().slice(0, 10);
      const row = groupedDays.find(row => row.day === day);
      daily.push({ day, totalOrders: Number(row?.totalOrders ?? 0), completedOrders: Number(row?.completedOrders ?? 0), revenueCents: Number(row?.revenueCents ?? 0) });
    }
    return {
      ...range, generatedAt: new Date().toISOString(),
      summary: { totalOrders: Number(totals!.totalOrders), completedOrders: Number(totals!.completedOrders), revenueCents: Number(totals!.revenueCents), cancelledOrders: Number(totals!.cancelledOrders), refundedCents: Number(refund!.refundedCents) },
      daily,
      statuses: orderStatuses.map(status => ({ status, count: Number(groupedStatuses.find(row => row.status === status)?.count ?? 0) })),
      topDishes: dishes.map(row => ({ dishId: row.dishId as string, name: row.name as string, quantity: Number(row.quantity), amountCents: Number(row.amountCents) })),
    };
  });
}
