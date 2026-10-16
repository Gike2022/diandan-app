import { z } from "zod";
import { ApiError } from "./api";
import type { CategoryInput, DishInput } from "./admin-api";

export interface CatalogAttempt<T> { key: string; body: T }
type Kind = "category" | "dish";
const categoryBody = z.object({ name: z.string(), sortOrder: z.number().int(), isActive: z.boolean() });
const dishBody = z.object({ name: z.string(), categoryId: z.string(), priceCents: z.number().int().positive(), description: z.string(), imageUrl: z.string(), sortOrder: z.number().int(), soldOut: z.boolean(), isActive: z.boolean() });
const storageKey = (userId: string, kind: Kind) => `sweet_kitchen_create_${kind}_${userId}`;
function read<T>(userId: string, kind: Kind, schema: z.ZodTypeAny): CatalogAttempt<T> | null {
  try { return z.object({ key: z.string().uuid(), body: schema }).parse(JSON.parse(sessionStorage.getItem(storageKey(userId, kind)) ?? "null")) as CatalogAttempt<T>; }
  catch { return null; }
}
export const readCategoryAttempt = (userId: string) => read<CategoryInput>(userId, "category", categoryBody);
export const readDishAttempt = (userId: string) => read<DishInput>(userId, "dish", dishBody);
export function saveCatalogAttempt<T>(userId: string, kind: Kind, body: T): CatalogAttempt<T> {
  const attempt = { key: crypto.randomUUID(), body };
  sessionStorage.setItem(storageKey(userId, kind), JSON.stringify(attempt));
  return attempt;
}
export function clearCatalogAttempt(userId: string, kind: Kind) {
  try { sessionStorage.removeItem(storageKey(userId, kind)); } catch { /* A retained key still safely confirms the same resource. */ }
}
export const definiteRejection = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 429].includes(error.status);
export function changedFields<T extends object>(body: T, previous: Partial<T>): Partial<T> {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => value !== previous[key as keyof T])) as Partial<T>;
}
