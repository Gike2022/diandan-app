import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, CookingPot, Layers3, ChartNoAxesCombined } from "lucide-react";
import { MobileLayout } from "./layout";
import { useAuth } from "../context/AuthContext";
import { AdminOrderNotifications } from "./admin-order-notifications";

export const adminControl = "w-full min-h-11 rounded-xl bg-muted/30 border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
export const adminButton = "min-h-11 px-4 rounded-full border border-primary/40 text-primary text-sm font-medium transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
export const adminPrimary = "min-h-11 px-5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

export function AdminLayout({ children, onShowPending }: { children: ReactNode; onShowPending?: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  return <MobileLayout title="商家工作台" showBack wide>
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{user!.displayName}，今天也用心做好每一餐</p><span className="text-xs text-primary rounded-full bg-primary/10 border border-primary/20 px-3 py-1">单店演示</span></div>
      <nav aria-label="商家导航" className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl bg-card/70 border border-card-border p-2">
        {[{ path: "/admin", text: "订单管理", Icon: ClipboardList }, { path: "/admin/menu", text: "菜品管理", Icon: CookingPot }, { path: "/admin/categories", text: "分类管理", Icon: Layers3 }, { path: "/admin/statistics", text: "营业统计", Icon: ChartNoAxesCombined }].map(({ path, text, Icon }) => <Link key={path} href={path} aria-current={location === path ? "page" : undefined} className={`min-h-12 flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${location === path ? "bg-gradient-to-r from-primary/20 to-accent/20 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}><Icon className="w-4 h-4 shrink-0" aria-hidden="true" />{text}</Link>)}
      </nav>
      <AdminOrderNotifications onShowPending={onShowPending} />
      {children}
    </div>
  </MobileLayout>;
}

export function AdminPagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  return <div className="flex items-center justify-between gap-3 pt-2"><button className={adminButton} disabled={page === 1} onClick={() => onChange(page - 1)}>上一页</button><span className="text-xs text-muted-foreground">第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · 共 {total} 条</span><button className={adminButton} disabled={page * 20 >= total} onClick={() => onChange(page + 1)}>下一页</button></div>;
}
