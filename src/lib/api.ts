import type { Dish } from "../data/menu";

export interface User {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  role: "customer" | "admin";
}
export interface RegisterBody { username: string; displayName: string; phone?: string; password: string }
export interface ProfileBody { displayName: string; phone: string | null }
export interface PasswordBody { currentPassword: string; newPassword: string }
export interface Category { id: string; name: string; sortOrder: number; isActive: boolean; version: number }
export interface MenuDish extends Dish { categoryId: string; priceCents: number; isActive: boolean; sortOrder: number; version: number }
export type OrderStatus = "pending_payment" | "pending_acceptance" | "preparing" | "delivering" | "completed" | "cancelled";
export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  payMethod: "wechat" | "alipay";
  status: OrderStatus;
  paymentStatus: "unpaid" | "paid" | "refunded";
  subtotalCents: number;
  packingFeeCents: number;
  totalCents: number;
  totalItems: number;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  paymentExpiresAt: string;
  serverTime: string;
  items: { dishId: string; name: string; imageUrl: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
  payments: { id: string; kind: "charge" | "refund"; outcome: "success" | "failed"; provider: "demo"; amountCents: number; createdAt: string }[];
}
export interface CreateOrderBody {
  items: { dishId: string; quantity: number }[];
  name: string;
  phone: string;
  address: string;
  notes: string;
  payMethod: "wechat" | "alipay";
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Session { user: User; token: string; expiresAt: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const SESSION_EXPIRED = "sweet-kitchen:session-expired";
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
interface RequestOptions {
  method?: string;
  body?: unknown;
  file?: File;
  token?: string;
  key?: string;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(baseUrl + path, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.file ? { "Content-Type": options.file.type } : options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      body: options.file ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
    if (response.status === 401 && options.token) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED, { detail: options.token }));
    }
    if (response.status === 204) return undefined as T;
    let payload;
    try { payload = await response.json(); }
    catch { throw new ApiError(response.status, "INVALID_RESPONSE", "服务暂时不可用，请稍后重试"); }
    if (!response.ok) {
      const message = payload?.error?.details?.[0]?.message ?? payload?.error?.message ?? "请求失败，请稍后重试";
      throw new ApiError(response.status, payload?.error?.code ?? "REQUEST_FAILED", message);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error;
    throw new ApiError(0, timedOut ? "TIMEOUT" : "NETWORK_ERROR", timedOut ? "请求超时，请重试确认结果" : "暂时无法连接服务，请检查网络后重试");
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  register: (body: RegisterBody) => request<Session>("/auth/register", { method: "POST", body }),
  login: (body: { username: string; password: string }) => request<Session>("/auth/login", { method: "POST", body }),
  me: (token: string, signal?: AbortSignal) => request<{ user: User }>("/auth/me", { token, signal }),
  updateProfile: (token: string, body: ProfileBody) => request<{ user: User }>("/auth/me", { method: "PATCH", token, body }),
  changePassword: (token: string, body: PasswordBody) => request<Session>("/auth/password", { method: "POST", token, body }),
  logout: (token: string) => request<void>("/auth/logout", { method: "POST", token }),
  categories: (signal?: AbortSignal) => request<{ categories: Category[] }>("/categories", { signal }),
  menuPage: (page: number, signal?: AbortSignal) => request<Page<MenuDish>>(`/menu?page=${page}&pageSize=100`, { signal }),
  createOrder: (body: CreateOrderBody, key: string, token: string) => request<{ order: Order; created: boolean }>("/orders", { method: "POST", body, key, token }),
  orders: (token: string, page = 1, signal?: AbortSignal) => request<Page<Order>>(`/orders?page=${page}&pageSize=20`, { token, signal }),
  order: (id: string, token: string, signal?: AbortSignal) => request<{ order: Order }>(`/orders/${encodeURIComponent(id)}`, { token, signal }),
  pay: (id: string, token: string, outcome: "success" | "failed") => request<{ mode: "demo"; order: Order }>(`/orders/${encodeURIComponent(id)}/demo-payment`, { method: "POST", token, body: { outcome } }),
  cancel: (id: string, token: string) => request<{ order: Order }>(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", token, body: {} }),
};

export async function fetchMenu(signal?: AbortSignal) {
  const first = await api.menuPage(1, signal);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    const next = await api.menuPage(page, signal);
    items.push(...next.items);
    if (next.items.length === 0) break;
  }
  return items;
}

export const money = (cents: number) => (cents / 100).toFixed(2);
export const imageSource = (url: string) => url.startsWith("/api/uploads/menu/") ? baseUrl + url.slice(4) : url;
export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "待付款", pending_acceptance: "待接单", preparing: "制作中",
  delivering: "配送中", completed: "已完成", cancelled: "已取消",
};
export const activeOrder = (order: Order) => !["completed", "cancelled"].includes(order.status);
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";
