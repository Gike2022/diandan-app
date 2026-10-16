import { z } from 'zod';

export const resourceId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const uuid = z.string().uuid();
export const businessDate = z.string().date('请输入有效日期').refine(value => value >= '1000-01-01' && value <= '9998-12-31', '日期超出支持范围');
export const beijingDayStart = (value: string) => new Date(`${value}T00:00:00+08:00`);
export const phone = z.string().trim().regex(/^\+?[0-9][0-9 -]{5,30}[0-9]$/, '请输入有效联系电话');
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderStatuses = ['pending_payment', 'pending_acceptance', 'preparing', 'delivering', 'completed', 'cancelled'] as const;
export type OrderStatus = typeof orderStatuses[number];
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
