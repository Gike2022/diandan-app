import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Heart, Loader2, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { MobileLayout } from "../components/layout";
import { RequestState } from "../components/request-state";
import { usePaymentWindow } from "../hooks/use-payment-window";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { api, activeOrder, errorMessage, money, orderStatusLabels, imageSource } from "../lib/api";

export default function OrderDetail({ id }: { id: string }) {
  const { user, token } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const key = ["order", user!.id, id];
  const query = useQuery({
    queryKey: key, queryFn: ({ signal }) => api.order(id, token!, signal), retry: false,
    refetchInterval: state => !busy && state.state.data && activeOrder(state.state.data.order) ? 5000 : false,
  });
  const paymentWindow = usePaymentWindow(query.data?.order);
  useEffect(() => { if (paymentWindow.expired) void query.refetch(); }, [paymentWindow.expired, query.refetch]);

  const perform = async (action: "success" | "failed" | "cancel") => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setConfirmCancel(false);
    try {
      await client.cancelQueries({ queryKey: key });
      const response = action === "cancel" ? await api.cancel(id, token!) : await api.pay(id, token!, action);
      if (!mounted.current) return;
      client.setQueryData(key, { order: response.order });
      void client.invalidateQueries({ queryKey: ["orders", user!.id] });
    } catch (failure) {
      if (mounted.current) { setError(errorMessage(failure)); void query.refetch(); }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (query.isPending) return <MobileLayout title="订单详情" showBack><RequestState message="正在查询订单…" /></MobileLayout>;
  if (query.isError && !query.data) return <MobileLayout title="订单详情" showBack><RequestState error message={errorMessage(query.error)} retry={() => { void query.refetch(); }} /></MobileLayout>;
  const order = query.data!.order;
  const unpaid = order.status === "pending_payment";
  const failed = unpaid && order.payments.some(payment => payment.kind === "charge" && payment.outcome === "failed");
  const paid = order.paymentStatus === "paid";

  return <MobileLayout title="订单详情" showBack>
    <div className="p-4 space-y-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card/80 backdrop-blur-sm rounded-2xl border border-card-border p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/15 text-primary flex items-center justify-center mx-auto mb-4">{paid ? <CheckCircle2 className="w-8 h-8" aria-hidden="true" /> : <Clock3 className="w-8 h-8" aria-hidden="true" />}</div>
        <h2 className="text-xl font-bold mb-2">{orderStatusLabels[order.status]}</h2>
        <p className="text-sm text-muted-foreground">{unpaid ? "订单已保存，请在付款时限内确认金额并模拟付款" : order.status === "pending_acceptance" ? "模拟付款成功，等待商家接单" : order.paymentStatus === "refunded" ? "商家已取消订单，模拟退款已记录" : order.cancelReason === "付款超时自动取消" ? "订单因超时未付款已自动取消，可以重新点餐" : order.status === "cancelled" ? "订单已取消" : "订单进度会自动更新"}</p>
        <p className="mt-4 text-3xl font-bold text-primary" aria-label={`订单金额 ${money(order.totalCents)} 元`}>¥{money(order.totalCents)}</p>
        <p className="mt-2 text-xs text-muted-foreground">订单号：<span className="break-all">{order.orderNumber}</span></p>
      </motion.div>

      {unpaid && <section className="bg-card/80 rounded-2xl border border-card-border p-5 space-y-4" aria-label="模拟付款">
        <h2 className="font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" aria-hidden="true" />模拟付款</h2>
        <p className="text-sm text-muted-foreground">方式：{order.payMethod === "wechat" ? "微信" : "支付宝"}（模拟）。本次操作不会真实扣款。</p>
        <p className="text-sm rounded-xl p-3 bg-primary/10 text-primary" data-testid="payment-countdown">{paymentWindow.expired ? "付款时间已结束，正在确认订单状态…" : paymentWindow.label}</p>
        {failed && <p role="status" className="text-sm rounded-xl p-3 bg-destructive/10 border border-destructive/30">上次模拟付款失败，订单仍待付款，可以继续重试。</p>}
        <button onClick={() => { void perform("success"); }} disabled={busy || paymentWindow.expired} className="w-full min-h-12 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}{busy ? "正在确认结果…" : "模拟付款成功"}</button>
        <button onClick={() => { void perform("failed"); }} disabled={busy || paymentWindow.expired} className="w-full min-h-11 border border-border rounded-full text-sm text-muted-foreground disabled:opacity-50">模拟付款失败</button>
        <button onClick={() => setConfirmCancel(true)} disabled={busy || paymentWindow.expired} className="w-full min-h-11 text-sm text-destructive disabled:opacity-50">取消订单</button>
      </section>}
      {error && <div role="alert" className="p-4 border border-destructive/30 rounded-xl text-sm text-destructive">{error}</div>}
      {query.isError && query.data && <div role="alert" className="p-4 border border-border rounded-xl text-sm">暂时无法更新订单进度。<button onClick={() => { void query.refetch(); }} className="ml-2 text-primary underline min-h-11">重试</button></div>}

      <section className="bg-card/80 rounded-2xl border border-card-border p-5 space-y-4" aria-label="订单明细">
        <h2 className="font-bold text-lg">订单明细</h2>
        {order.items.map(item => <div key={item.dishId} className="flex gap-3 items-center"><img src={imageSource(item.imageUrl)} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm font-medium break-words">{item.name}</p><p className="text-xs text-muted-foreground mt-1">¥{money(item.unitPriceCents)} × {item.quantity}</p></div><span className="text-sm">¥{money(item.lineTotalCents)}</span></div>)}
        <div className="border-t border-border pt-3 flex justify-between text-sm text-muted-foreground"><span>包装费</span><span>¥{money(order.packingFeeCents)}</span></div>
        <div className="flex justify-between font-bold"><span>合计</span><span className="text-primary">¥{money(order.totalCents)}</span></div>
      </section>
      <section className="bg-card/80 rounded-2xl border border-card-border p-5 space-y-2 text-sm" aria-label="收货信息">
        <h2 className="font-bold mb-3">收货信息</h2>
        <p>{order.name} · {order.phone}</p><p className="text-muted-foreground break-words">{order.address}</p>
        {order.notes && <p className="text-muted-foreground break-words">备注：{order.notes}</p>}
        {order.cancelReason && <p className="text-destructive break-words">取消原因：{order.cancelReason}</p>}
      </section>
      <div className="flex gap-3"><Link href="/orders" className="flex-1 min-h-12 flex items-center justify-center rounded-full border border-primary/40 text-primary text-sm">查看历史订单</Link><Link href="/" className="flex-1 min-h-12 flex items-center justify-center rounded-full bg-primary/15 text-primary text-sm gap-1"><Heart className="w-4 h-4" aria-hidden="true" />继续点餐</Link></div>
    </div>
    <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>取消这笔订单？</AlertDialogTitle><AlertDialogDescription>订单尚未付款。取消后如果还想购买，需要重新下单。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留订单</AlertDialogCancel><AlertDialogAction onClick={() => { void perform("cancel"); }}>确认取消</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </MobileLayout>;
}
