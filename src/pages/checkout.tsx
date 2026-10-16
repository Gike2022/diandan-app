import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Loader2, MapPin, Phone, User, MessageSquare, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { MobileLayout } from "../components/layout";
import { api, ApiError, errorMessage, money, type CreateOrderBody } from "../lib/api";
import { clearAttempt, readAttempt, saveAttempt } from "../lib/checkout-attempt";

export default function Checkout() {
  const { cart, consumeItems, getCartSnapshot } = useCart();
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(() => readAttempt(user!.id));
  const [form, setForm] = useState({
    name: attempt?.body.name ?? user!.displayName,
    phone: attempt?.body.phone ?? user!.phone ?? "",
    address: attempt?.body.address ?? "", notes: attempt?.body.notes ?? "",
  });
  const [payMethod, setPayMethod] = useState<"wechat" | "alipay">(attempt?.body.payMethod ?? "wechat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const lines = attempt?.lines ?? cart.map(item => ({ name: item.name, quantity: item.quantity, unitPriceCents: item.priceCents ?? Math.round(item.price * 100) }));
  const totalItems = lines.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = lines.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const packingFee = totalItems * 50;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    let pending = attempt;
    try {
      if (!pending) {
        const snapshot = getCartSnapshot();
        if (!snapshot.cart.length) { navigate("/cart", { replace: true }); return; }
        const body: CreateOrderBody = {
          ...form, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), notes: form.notes.trim(), payMethod,
          items: snapshot.cart.map(item => ({ dishId: item.id, quantity: item.quantity })),
        };
        try { pending = saveAttempt(user!.id, body, snapshot.cart, `checkout-${snapshot.revision}`); }
        catch { throw new Error("浏览器暂时无法保存本次提交，请允许页面存储后重试"); }
        setAttempt(pending);
      }
      const { order } = await api.createOrder(pending.body, pending.key, token!);
      if (!mounted.current) return;
      await consumeItems(pending.body.items, `${user!.id}:${pending.key}`);
      if (!mounted.current) return;
      clearAttempt(user!.id);
      queryClient.setQueryData(["order", user!.id, order.id], { order });
      void queryClient.invalidateQueries({ queryKey: ["orders", user!.id] });
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 401 && failure.status !== 429) {
        clearAttempt(user!.id);
        setAttempt(null);
      }
      setError(failure instanceof ApiError && failure.code === "DISH_UNAVAILABLE" ? "部分菜品已停售或售罄，请返回购物车调整后重试" : errorMessage(failure));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (!cart.length && !attempt) return <Redirect to="/cart" replace />;

  return <MobileLayout title="确认订单" showBack>
    <form onSubmit={submit} className="p-4 space-y-4 pb-36" aria-busy={busy}>
      {attempt && !busy && <p role="status" className="p-4 text-sm rounded-2xl bg-primary/10 border border-primary/30">这笔提交结果尚待确认。请点击下方按钮重试，系统会核对原订单。</p>}
      <fieldset disabled={busy || Boolean(attempt)} className="contents">
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-5 border border-card-border space-y-4">
          <h2 className="font-bold text-lg">配送信息</h2>
          <div><label htmlFor="checkout-name" className="block text-sm mb-2">联系人姓名</label><div className="flex items-center gap-3 bg-muted/30 rounded-xl px-3 border border-border/30 focus-within:border-primary"><User className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" /><input id="checkout-name" name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="bg-transparent outline-none flex-1 min-w-0 min-h-12 text-sm" /></div></div>
          <div><label htmlFor="checkout-phone" className="block text-sm mb-2">手机号码</label><div className="flex items-center gap-3 bg-muted/30 rounded-xl px-3 border border-border/30 focus-within:border-primary"><Phone className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" /><input id="checkout-phone" name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={32} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="bg-transparent outline-none flex-1 min-w-0 min-h-12 text-sm" /></div></div>
          <div><label htmlFor="checkout-address" className="block text-sm mb-2">详细地址</label><div className="flex items-start gap-3 bg-muted/30 rounded-xl p-3 border border-border/30 focus-within:border-primary"><MapPin className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" /><textarea id="checkout-address" name="address" autoComplete="street-address" required maxLength={500} rows={2} value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} className="bg-transparent outline-none flex-1 min-w-0 text-sm resize-none" /></div></div>
          <div><label htmlFor="checkout-notes" className="block text-sm mb-2">备注（选填）</label><div className="flex items-start gap-3 bg-muted/30 rounded-xl p-3 border border-border/30 focus-within:border-primary"><MessageSquare className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" /><textarea id="checkout-notes" name="notes" maxLength={1000} rows={2} placeholder="少辣、不加葱、餐具数量…" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="bg-transparent outline-none flex-1 min-w-0 text-sm resize-none" /></div></div>
        </div>
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-5 border border-card-border">
          <h2 className="font-bold text-lg mb-4">付款方式（模拟）</h2>
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["wechat", "alipay"] as const).map(method => <button type="button" key={method} aria-pressed={payMethod === method} onClick={() => setPayMethod(method)} className={`flex-1 min-h-12 text-sm font-medium flex items-center justify-center gap-2 ${payMethod === method ? (method === "wechat" ? "bg-[#07C160] text-white" : "bg-[#1677FF] text-white") : "bg-muted/30 text-muted-foreground"}`}><Wallet className="w-4 h-4" aria-hidden="true" />{method === "wechat" ? "微信" : "支付宝"}</button>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">课程演示使用模拟付款，不会产生真实扣款。下单后可选择模拟成功或失败。</p>
        </div>
      </fieldset>
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-5 border border-card-border">
        <h2 className="font-bold text-lg mb-4">订单详情</h2>
        <div className="space-y-3 mb-4">{lines.map((line, index) => <div key={index} className="flex justify-between text-sm gap-2"><span className="flex-1">{line.name}</span><span className="text-muted-foreground">×{line.quantity}</span><span className="w-20 text-right">¥{money(line.unitPriceCents * line.quantity)}</span></div>)}</div>
        <div className="border-t border-border pt-4 space-y-3"><div className="flex justify-between text-sm text-muted-foreground"><span>包装费</span><span>¥{money(packingFee)}</span></div><div className="flex justify-between font-bold"><span>预计合计</span><span className="text-primary text-xl">¥{money(subtotal + packingFee)}</span></div></div>
        <p className="mt-3 text-xs text-muted-foreground">下一步查看订单确认金额，再进行模拟付款。</p>
      </div>
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"><p>{error}</p><Link href="/cart" className="mt-2 inline-flex min-h-11 items-center underline">返回购物车</Link></div>}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border max-w-[430px] mx-auto z-40">
        <button type="submit" disabled={busy} className="w-full min-h-12 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full font-bold shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}{busy ? "正在确认订单…" : attempt ? "重试确认订单" : "确认下单，前往模拟付款"}</button>
      </div>
    </form>
  </MobileLayout>;
}
