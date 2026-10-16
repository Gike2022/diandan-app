import { request, type Category, type MenuDish, type Order, type OrderStatus, type Page } from "./api";

export interface DishInput {
  categoryId: string; name: string; description: string; priceCents: number;
  imageUrl: string; soldOut: boolean; isActive: boolean; sortOrder: number;
}
export interface CategoryInput { name: string; sortOrder: number; isActive: boolean }
export type DishPatch = Partial<DishInput> & { expectedVersion?: number };
export type CategoryPatch = Partial<CategoryInput> & { expectedVersion?: number };
export type MerchantStatus = "preparing" | "delivering" | "completed" | "cancelled";
export interface OrderFilters { status: OrderStatus | ""; orderNumber: string; dateFrom: string; dateTo: string }
export interface OrderNotifications { pending: Pick<Order, "id" | "orderNumber">[]; total: number }
export interface StatisticsRange { dateFrom: string; dateTo: string }
export interface BusinessStatistics extends StatisticsRange {
  generatedAt: string;
  summary: { totalOrders: number; completedOrders: number; revenueCents: number; cancelledOrders: number; refundedCents: number };
  daily: { day: string; totalOrders: number; completedOrders: number; revenueCents: number }[];
  statuses: { status: OrderStatus; count: number }[];
  topDishes: { dishId: string; name: string; quantity: number; amountCents: number }[];
}

export const adminApi = {
  statistics: (token: string, range: StatisticsRange, signal?: AbortSignal) => request<BusinessStatistics>(`/admin/statistics?${new URLSearchParams({ ...range })}`, { token, signal }),
  uploadImage: (token: string, file: File, signal?: AbortSignal) => request<{ imageUrl: string; size: number }>("/admin/uploads/images", { token, method: "POST", file, signal }),
  categories: (token: string, signal?: AbortSignal) => request<{ categories: Category[] }>("/admin/categories", { token, signal }),
  saveCategory: (token: string, body: CategoryPatch, id?: string, key?: string) => request<{ category: Category }>(`/admin/categories${id ? `/${encodeURIComponent(id)}` : ""}`, { token, body, key, method: id ? "PATCH" : "POST" }),
  menu: (token: string, page: number, search: string, categoryId: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) query.set("search", search);
    if (categoryId) query.set("categoryId", categoryId);
    return request<Page<MenuDish>>(`/admin/menu?${query}`, { token, signal });
  },
  saveDish: (token: string, body: DishPatch, id?: string, key?: string) => request<{ dish: MenuDish }>(`/admin/menu${id ? `/${encodeURIComponent(id)}` : ""}`, { token, body, key, method: id ? "PATCH" : "POST" }),
  orders: (token: string, page: number, filters: OrderFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return request<Page<Order>>(`/admin/orders?${query}`, { token, signal });
  },
  notifications: (token: string, signal?: AbortSignal) => request<OrderNotifications>("/admin/orders/notifications", { token, signal }),
  transition: (token: string, id: string, status: MerchantStatus, reason?: string) => request<{ order: Order }>(`/admin/orders/${encodeURIComponent(id)}/status`, { token, method: "PATCH", body: { status, ...(reason ? { reason } : {}) } }),
};
