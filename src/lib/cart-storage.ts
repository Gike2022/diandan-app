import { z } from "zod";
import type { Dish } from "../data/menu";

export type CartItem = Dish & { quantity: number };
export interface CartSnapshot { revision: string; cart: CartItem[]; settled: string[] }
export const CART_KEY = "sweet_kitchen_cart_v2";
const LEGACY_KEY = "sweet_kitchen_cart_v1";
export const cartSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), name: z.string(), category: z.string(),
  description: z.string(), price: z.number().positive(), priceCents: z.number().int().positive().optional(),
  imageUrl: z.string(), soldOut: z.boolean().optional(), quantity: z.number().int().min(1).max(99),
})).max(50);
const snapshotSchema = z.object({ revision: z.string().uuid(), cart: cartSchema, settled: z.array(z.string()) });
export const emptyCartSnapshot = (): CartSnapshot => ({ revision: crypto.randomUUID(), cart: [], settled: [] });
export function writeCartSnapshot(snapshot: CartSnapshot) { localStorage.setItem(CART_KEY, JSON.stringify(snapshot)); }
export function readCartSnapshot(): CartSnapshot {
  const raw = localStorage.getItem(CART_KEY);
  if (raw !== null) {
    try {
      const result = snapshotSchema.safeParse(JSON.parse(raw));
      if (result.success) return result.data as CartSnapshot;
    } catch { /* Replace invalid stored JSON with an empty snapshot. */ }
  }
  const snapshot = emptyCartSnapshot();
  if (raw === null) {
    try { snapshot.cart = cartSchema.parse(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]")) as CartItem[]; } catch { /* Ignore invalid legacy data. */ }
  }
  writeCartSnapshot(snapshot);
  localStorage.removeItem(LEGACY_KEY);
  return snapshot;
}
