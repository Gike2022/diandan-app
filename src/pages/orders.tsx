import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, RotateCcw, Heart, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { MobileLayout } from "../components/layout";
import { RequestState } from "../components/request-state";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { toast } from "../hooks/use-toast";
import { fetchCatalog } from "../hooks/use-menu";
import { api, activeOrder, errorMessage, money, orderStatusLabels, type Order } from "../lib/api";

export default function Orders() {
  const { token, user } = useAuth();
  const { replaceCart } = useCart();
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [reordering, setReordering] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const query = useQuery({
    queryKey: ["orders", user!.id, page], queryFn: ({ signal }) => api.orders(token!, page, signal), retry: false,
    refetchInterval: state => state.state.data?.items.some(activeOrder) ? 5000 : false,
  });

  const reorder = async (order: Order) => {
    if (locked.current) return;
    locked.current = true;
    setReordering(order.id);
    try {
      const { dishes: menu } = await client.fetchQuery({
        queryKey: ["menu"], queryFn: ({ signal }) => fetchCatalog(signal), staleTime: 0,
      });
      if (!mounted.current) return;
      const items = order.items.map(item => {
        const dish = menu.find(dish => dish.id === item.dishId);
        if (!dish || dish.soldOut) throw new Error(`${item.name} 已停售或售罄，请从菜单重新选择`);
        return { ...dish, quantity: item.quantity };
      });
      replaceCart(items);
      toast({ title: "已按当前菜单加入购物车", description: "请确认菜品数量和最新价格" });
      navigate("/cart");
    } catch (failure) { if (mounted.current) toast({ title: "暂时无法再来一单", description: errorMessage(failure), variant: "destructive" }); }
    finally { locked.current = false; if (mounted.current) setReordering(null); }
  };

  if (query.isPending) return <MobileLayout title="甜蜜回忆" showBack><RequestState message="正在寻找你的订单…" /></MobileLayout>;
  if (query.isError && !query.data) return <MobileLayout title="甜蜜回忆" showBack><RequestState error message={errorMessage(query.error)} retry={() => { void query.refetch(); }} /></MobileLayout>;
  const orders = query.data!.items;

  return <MobileLayout title="甜蜜回忆" showBack>
    {query.isError && <div role="alert" className="m-4 p-3 text-sm rounded-xl border border-destructive/30">暂时无法更新订单，正在显示上次查询结果。<button onClick={() => { void query.refetch(); }} className="min-h-11 ml-2 text-primary">重试</button></div>}
    {query.data!.total === 0 ? <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
      <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-6"><ClipboardList className="w-10 h-10 text-muted-foreground/50" aria-hidden="true" /></div>
      <h2 className="text-xl font-bold mb-2">还没有甜蜜回忆</h2><p className="text-muted-foreground mb-8 flex items-center gap-1">去点一份好吃的 <Heart className="w-4 h-4 text-primary fill-primary" aria-hidden="true" /> 吧</p>
      <Link href="/" className="bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 min-h-12 flex items-center rounded-full font-medium shadow-lg shadow-primary/30">去浏览菜单</Link>
    </div> : <div className="p-4 space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{user!.displayName}的订单 · 共 {query.data!.total} 笔</p><button onClick={() => { void query.refetch(); }} disabled={query.isFetching} className="min-h-11 px-3 text-sm text-primary disabled:opacity-50">{query.isFetching ? "更新中…" : "刷新"}</button></div>
      {orders.map((order, index) => <motion.article key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 5) * 0.05 }} className="bg-card/80 backdrop-blur-sm rounded-2xl p-4 border border-card-border shadow-sm" aria-label={`订单 ${order.orderNumber}`}>
        <div className="flex items-start justify-between mb-3 gap-3"><div className="min-w-0"><time className="text-xs text-muted-foreground" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><p className="font-bold text-sm mt-1 break-all">订单 #{order.orderNumber}</p></div><span className="text-primary bg-primary/10 px-3 py-1 rounded-full text-xs whitespace-nowrap">{orderStatusLabels[order.status]}</span></div>
        <div className="space-y-2 mb-3 pb-3 border-b border-border">{order.items.map(item => <div key={item.dishId} className="flex justify-between text-sm gap-3"><span>{item.name}</span><span className="text-muted-foreground shrink-0">×{item.quantity}</span></div>)}</div>
        <div className="flex justify-between items-center mb-3"><span className="text-xs text-muted-foreground">{order.payMethod === "wechat" ? "微信" : "支付宝"}（模拟）{order.paymentStatus === "refunded" ? " · 已退款" : ""}</span><span className="text-primary font-bold text-lg">¥{money(order.totalCents)}</span></div>
        {order.cancelReason === "付款超时自动取消" && <p className="text-xs text-muted-foreground mb-3">付款超时自动取消</p>}
        <div className="flex gap-2 justify-end"><Link href={`/orders/${order.id}`} className="min-h-11 px-4 border border-border rounded-full flex items-center text-sm">{order.status === "pending_payment" ? "继续付款" : "查看详情"}</Link><button onClick={() => { void reorder(order); }} disabled={Boolean(reordering)} className="min-h-11 px-4 border border-primary/30 rounded-full flex items-center gap-1 text-sm text-primary disabled:opacity-50">{reordering === order.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}再来一单</button></div>
      </motion.article>)}
      <div className="flex items-center justify-between pt-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 px-4 rounded-full border border-border text-sm disabled:opacity-40">上一页</button><span className="text-xs text-muted-foreground">第 {page} / {Math.max(1, Math.ceil(query.data!.total / 20))} 页</span><button disabled={page * 20 >= query.data!.total} onClick={() => setPage(value => value + 1)} className="min-h-11 px-4 rounded-full border border-border text-sm disabled:opacity-40">下一页</button></div>
    </div>}
  </MobileLayout>;
}
