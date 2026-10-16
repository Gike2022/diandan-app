import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { AdminLayout, AdminPagination, adminButton, adminControl, adminPrimary } from "../components/admin-layout";
import { RequestState } from "../components/request-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../context/AuthContext";
import { adminApi, type MerchantStatus } from "../lib/admin-api";
import { errorMessage, money, orderStatusLabels, type Order, type OrderStatus } from "../lib/api";

const nextAction: Partial<Record<OrderStatus, { status: MerchantStatus; label: string }>> = {
  pending_acceptance: { status: "preparing", label: "接单并制作" },
  preparing: { status: "delivering", label: "开始配送" },
  delivering: { status: "completed", label: "确认完成" },
};
const emptySearch = { orderNumber: "", dateFrom: "", dateTo: "" };

export default function AdminOrders() {
  const { token, user } = useAuth();
  const client = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | "">("pending_acceptance");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(emptySearch);
  const [search, setSearch] = useState(emptySearch);
  const [filterError, setFilterError] = useState("");
  const [reject, setReject] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const prefix = ["admin", user!.id, "orders"];
  const query = useQuery({
    queryKey: [...prefix, status, search, page], queryFn: ({ signal }) => adminApi.orders(token!, page, { status, ...search }, signal),
    retry: false, refetchInterval: 5000,
  });
  useEffect(() => {
    if (query.data) setPage(current => Math.min(current, Math.max(1, Math.ceil(query.data.total / 20))));
  }, [query.data]);
  const refreshOrders = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: prefix }),
      client.invalidateQueries({ queryKey: ["admin", user!.id, "order-alerts"] }),
      client.invalidateQueries({ queryKey: ["admin", user!.id, "statistics"] }),
      client.invalidateQueries({ queryKey: ["orders"] }),
      client.invalidateQueries({ queryKey: ["order"] }),
    ]);
  };
  const update = useMutation({
    mutationFn: async ({ id, target, reason }: { id: string; target: MerchantStatus; reason?: string }) => {
      await client.cancelQueries({ queryKey: prefix });
      return adminApi.transition(token!, id, target, reason);
    },
    onSuccess: refreshOrders,
    onError: () => { void refreshOrders(); },
  });
  const rejectOrder = (order: Order) => { update.reset(); setReason(""); setReject(order); };
  const resetFilters = () => {
    setStatus("pending_acceptance"); setDraft(emptySearch); setSearch(emptySearch); setPage(1); setFilterError(""); update.reset();
    void client.invalidateQueries({ queryKey: prefix });
  };
  const hasSearch = Boolean(search.orderNumber || search.dateFrom || search.dateTo);
  return <AdminLayout onShowPending={resetFilters}>
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">订单管理</h2><p className="text-xs text-muted-foreground mt-1">每 5 秒同步订单，及时回应每一份期待</p></div><button className={`${adminButton} flex items-center gap-2 shrink-0`} disabled={query.isFetching || update.isPending} onClick={() => { void query.refetch(); }}><RefreshCw className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />刷新</button></div>
    <form className="rounded-2xl border border-card-border bg-card/80 p-4 space-y-4" aria-label="查询商家订单" onSubmit={event => {
      event.preventDefault();
      if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) { setFilterError("结束日期不能早于开始日期"); return; }
      setSearch({ ...draft, orderNumber: draft.orderNumber.trim() }); setPage(1); setFilterError(""); update.reset();
      void client.invalidateQueries({ queryKey: prefix });
    }}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><label htmlFor="admin-order-number" className="block text-sm mb-2">订单号</label><input id="admin-order-number" className={adminControl} maxLength={40} pattern="[A-Za-z0-9]*" placeholder="完整或部分订单号" value={draft.orderNumber} onChange={event => setDraft({ ...draft, orderNumber: event.target.value })} /></div>
        <div><label htmlFor="admin-order-status" className="block text-sm mb-2">订单状态</label><select id="admin-order-status" className={adminControl} value={status} onChange={event => { setStatus(event.target.value as OrderStatus | ""); setPage(1); update.reset(); }}><option value="">全部订单</option>{Object.entries(orderStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
        <div className="min-w-0"><label htmlFor="admin-order-from" className="block text-sm mb-2">开始日期</label><input id="admin-order-from" type="date" min="1000-01-01" max="9998-12-31" style={{ colorScheme: "dark" }} className={`${adminControl} min-w-0`} value={draft.dateFrom} onChange={event => setDraft({ ...draft, dateFrom: event.target.value })} /></div>
        <div className="min-w-0"><label htmlFor="admin-order-to" className="block text-sm mb-2">结束日期</label><input id="admin-order-to" type="date" min="1000-01-01" max="9998-12-31" style={{ colorScheme: "dark" }} aria-describedby={filterError ? "order-filter-error" : undefined} className={`${adminControl} min-w-0`} value={draft.dateTo} onChange={event => setDraft({ ...draft, dateTo: event.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">按北京时间的下单日期查询，包含结束日期当天。</p><div className="flex gap-2"><button type="button" className={adminButton} onClick={resetFilters}>重置</button><button className={`${adminPrimary} inline-flex items-center gap-2`}><Search className="w-4 h-4" aria-hidden="true" />查询订单</button></div></div>
      {filterError && <p id="order-filter-error" role="alert" className="text-sm text-destructive">{filterError}</p>}
    </form>
    <p aria-label="已应用的订单查询条件" className="text-xs text-muted-foreground break-words">当前条件：{status ? orderStatusLabels[status] : "全部状态"}{search.orderNumber && ` · 订单号包含 ${search.orderNumber}`}{(search.dateFrom || search.dateTo) && ` · ${search.dateFrom || "不限开始日期"} 至 ${search.dateTo || "不限结束日期"}（北京时间）`}{!hasSearch && " · 不限订单号和日期"}</p>
    {update.isError && !reject && <p role="alert" className="rounded-xl p-4 border border-destructive/30 text-destructive text-sm">{errorMessage(update.error)}。订单列表已重新查询，请确认当前状态。</p>}
    {query.isError && query.data && <p role="alert" className="rounded-xl p-4 border border-border text-sm">暂时无法更新订单，正在显示上次查询结果。<button className="ml-2 underline text-primary min-h-11" onClick={() => { void query.refetch(); }}>重试</button></p>}
    {query.isPending ? <RequestState message="正在查询店内订单…" /> : query.isError && !query.data ? <RequestState error message={errorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
      {query.data!.items.length === 0 ? <div className="p-10 text-center rounded-2xl border border-card-border bg-card/80"><ClipboardCheck className="w-12 h-12 text-primary mx-auto mb-4" aria-hidden="true" /><h3 className="font-bold">{hasSearch ? "没有符合查询条件的订单" : `当前没有${status ? orderStatusLabels[status] : ""}订单`}</h3><p className="text-sm text-muted-foreground mt-2">{hasSearch ? "可以修改查询条件，或点击重置查看待接单订单。" : "新订单会自动显示，也可以切换状态查看其他订单。"}</p></div> : <div className="grid lg:grid-cols-2 gap-4">{query.data!.items.map(order => {
        const action = nextAction[order.status];
        return <article key={order.id} aria-label={`商家订单 ${order.orderNumber}`} className="rounded-2xl bg-card/80 border border-card-border p-5 space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground"><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></p><h3 className="text-sm font-bold break-all mt-1">#{order.orderNumber}</h3></div><span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary shrink-0">{orderStatusLabels[order.status]}</span></div>
          <div className="space-y-2 border-y border-border py-4">{order.items.map(item => <div key={item.dishId} className="flex justify-between gap-3 text-sm"><span className="break-words">{item.name} <span className="text-muted-foreground">×{item.quantity}</span></span><span className="shrink-0">¥{money(item.lineTotalCents)}</span></div>)}<p className="text-xs text-muted-foreground">包装费 ¥{money(order.packingFeeCents)}</p></div>
          <div className="text-sm space-y-2 break-words"><p className="font-medium">{order.name} · {order.phone}</p><p className="text-muted-foreground">{order.address}</p>{order.notes && <p className="rounded-xl p-3 bg-primary/10">备注：{order.notes}</p>}{order.cancelReason && <p className="text-muted-foreground">取消原因：{order.cancelReason}</p>}</div>
          <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{order.payMethod === "wechat" ? "微信" : "支付宝"}（模拟）· {order.paymentStatus === "paid" ? "已付款" : order.paymentStatus === "refunded" ? "已模拟退款" : "未付款"}</span><strong className="text-primary text-xl shrink-0">¥{money(order.totalCents)}</strong></div>
          {action ? <div className="flex flex-wrap gap-3 justify-end">{order.status === "pending_acceptance" && <button disabled={update.isPending} className={adminButton} onClick={() => rejectOrder(order)}>拒单并模拟退款</button>}<button disabled={update.isPending} className={adminPrimary} onClick={() => update.mutate({ id: order.id, target: action.status })}>{update.isPending && update.variables?.id === order.id ? "更新中…" : action.label}</button></div> : order.status === "pending_payment" ? <p className="text-xs text-muted-foreground">等待顾客完成模拟付款后可接单。</p> : null}
        </article>;
      })}</div>}
      <AdminPagination page={page} total={query.data!.total} onChange={setPage} />
    </>}
    <Dialog open={Boolean(reject)} onOpenChange={open => { if (!open && !update.isPending) setReject(null); }}><DialogContent className="w-[calc(100vw-2rem)] max-h-[85dvh] overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>拒单并模拟退款</DialogTitle><DialogDescription>订单将取消，¥{money(reject?.totalCents ?? 0)} 的模拟退款会同时记录。请填写顾客可以看到的原因。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (reject && reason.trim() && !update.isPending) update.mutate({ id: reject.id, target: "cancelled", reason: reason.trim() }, { onSuccess: () => setReject(null) }); }}><div><label htmlFor="reject-reason" className="block text-sm mb-2">拒单原因</label><textarea id="reject-reason" required maxLength={500} rows={3} value={reason} disabled={update.isPending} onChange={event => setReason(event.target.value)} className={`${adminControl} p-3`} /></div>{update.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(update.error)}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={update.isPending} className={adminButton} onClick={() => setReject(null)}>保留订单</button><button disabled={update.isPending || !reason.trim()} className={adminPrimary}>{update.isPending ? "处理中…" : "确认拒单并退款"}</button></div></form></DialogContent></Dialog>
  </AdminLayout>;
}
