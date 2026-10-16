import { z } from "zod";
import type { CartItem } from "../context/CartContext";
import type { CreateOrderBody } from "./api";

const attemptSchema = z.object({
  userId: z.string().uuid(), key: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
  body: z.object({
    items: z.array(z.object({ dishId: z.string(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
    name: z.string(), phone: z.string(), address: z.string(), notes: z.string(), payMethod: z.enum(["wechat", "alipay"]),
  }),
  lines: z.array(z.object({ name: z.string(), quantity: z.number().int().min(1).max(99), unitPriceCents: z.number().int().positive() })).max(50),
});
export interface CheckoutAttempt {
  userId: string;
  key: string;
  body: CreateOrderBody;
  lines: { name: string; quantity: number; unitPriceCents: number }[];
}
const storageKey = (userId: string) => `sweet_kitchen_checkout_${userId}`;

export function readAttempt(userId: string): CheckoutAttempt | null {
  try {
    const value = attemptSchema.parse(JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? "null"));
    return value.userId === userId ? value as CheckoutAttempt : null;
  } catch { return null; }
}

export function saveAttempt(userId: string, body: CreateOrderBody, cart: CartItem[], key: string): CheckoutAttempt {
  const attempt: CheckoutAttempt = {
    userId, key, body,
    lines: cart.map(item => ({ name: item.name, quantity: item.quantity, unitPriceCents: item.priceCents ?? Math.round(item.price * 100) })),
  };
  // Persist before sending so a reload after an uncertain response can safely retry.
  sessionStorage.setItem(storageKey(userId), JSON.stringify(attempt));
  return attempt;
}

export function clearAttempt(userId: string) {
  try { sessionStorage.removeItem(storageKey(userId)); } catch { /* Confirmed order is queryable in history. */ }
}
