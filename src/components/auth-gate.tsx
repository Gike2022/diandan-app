import type { ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { MobileLayout } from "./layout";
import { RequestState } from "./request-state";

export function AuthGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth();
  const [location] = useLocation();
  if (auth.isChecking) return <MobileLayout title="验证登录" showBack><RequestState message="正在确认登录状态…" /></MobileLayout>;
  if (!auth.token) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} replace />;
  if (auth.error || !auth.user) return <MobileLayout title="登录状态" showBack><RequestState error message={auth.error?.message ?? "暂时无法验证登录状态"} retry={auth.retry} /></MobileLayout>;
  if (admin && auth.user.role !== "admin") return <MobileLayout title="商家管理" showBack><div className="p-8 text-center space-y-4"><h2 className="text-xl font-bold">需要商家管理员账号</h2><p className="text-sm text-muted-foreground">当前账号没有商家管理权限，请退出后使用管理员账号登录。</p><Link href="/" className="inline-flex items-center min-h-11 px-5 rounded-full border border-primary/40 text-primary">返回菜单</Link></div></MobileLayout>;
  return <>{children}</>;
}
