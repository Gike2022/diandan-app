import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { adminApi } from "../lib/admin-api";
import { toast } from "../hooks/use-toast";

interface Snapshot { checkedAt: number; ids: string[] }
const snapshots = new Map<string, Snapshot>();
function readSnapshot(key: string): Snapshot | undefined {
  if (snapshots.has(key)) return snapshots.get(key);
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value.checkedAt === "number" && Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === "string")) {
      snapshots.set(key, value);
      return value;
    }
  } catch { /* Reminders continue in memory if browser storage is unavailable. */ }
}

export function AdminOrderNotifications({ onShowPending }: { onShowPending?: () => void }) {
  const { token, user } = useAuth();
  const client = useQueryClient();
  const currentToast = useRef<ReturnType<typeof toast>>();
  const query = useQuery({
    queryKey: ["admin", user!.id, "order-alerts"],
    queryFn: ({ signal }) => adminApi.notifications(token!, signal),
    refetchInterval: 5000, retry: false,
  });

  useEffect(() => {
    if (!query.data || query.isError) return;
    const key = `sweet_kitchen_order_alerts_${user!.id}`;
    const previous = readSnapshot(key);
    // Ignore cached snapshots when changing merchant pages, including StrictMode effect replay.
    if (previous && previous.checkedAt >= query.dataUpdatedAt) return;
    const known = new Set(previous?.ids);
    const incoming = previous ? query.data.pending.filter(order => !known.has(order.id)) : [];
    const next = { checkedAt: query.dataUpdatedAt, ids: query.data.pending.map(order => order.id) };
    snapshots.set(key, next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Memory is sufficient for this page session. */ }
    if (incoming.length) {
      currentToast.current = toast({
        title: `收到 ${incoming.length} 笔新订单`,
        description: incoming.length === 1 ? `#${incoming[0].orderNumber} 已付款，请及时接单。` : `顾客已完成付款，当前共 ${query.data.total} 笔待接单。`,
        duration: 8000,
      });
      void client.invalidateQueries({ queryKey: ["admin", user!.id, "orders"] });
    }
  }, [query.data, query.dataUpdatedAt, query.isError, user!.id, client]);
  useEffect(() => () => { currentToast.current?.dismiss(); }, []);

  const linkClass = "inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0";
  return <aside aria-label="新订单提醒" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Bell className="w-5 h-5 text-primary shrink-0" aria-hidden="true" /><div>
        <p role="status" aria-atomic="true" className="text-sm font-medium">{query.data ? `待接单 ${query.data.total} 笔` : query.isError ? "待接单数量暂不可用" : "正在同步待接单数量…"}</p>
        <p className="text-xs text-muted-foreground mt-1">顾客付款后自动提醒 · 每 5 秒同步</p>
      </div></div>
      {onShowPending ? <button className={linkClass} onClick={onShowPending}>查看待接单</button> : <Link className={linkClass} href="/admin">查看待接单</Link>}
    </div>
    {query.isError && <p className="text-xs text-muted-foreground">提醒同步中断{query.data ? "，数量为上次同步结果" : ""}，连接恢复后自动补查。<button className="min-h-11 px-2 underline text-primary" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>重试提醒同步</button></p>}
  </aside>;
}
