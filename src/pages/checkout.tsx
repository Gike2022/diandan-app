import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { CheckCircle2, MapPin, Phone, User, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { saveOrder } from "./orders";

type PayMethod = "wechat" | "alipay";

export default function Checkout() {
  const { cart, totalPrice, totalItems, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("wechat");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: ""
  });

  const subtotal = totalPrice;
  const packingFee = totalItems * 0.5;
  const finalTotal = subtotal + packingFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.address) return;

    setIsSubmitting(true);
    setTimeout(() => {
      saveOrder({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        items: cart.map(c => ({ name: c.name, quantity: c.quantity, price: c.price })),
        total: finalTotal,
        name: formData.name,
        address: formData.address,
        notes: formData.notes,
        payMethod
      });
      setIsSubmitting(false);
      setIsSuccess(true);
      clearCart();
    }, 1500);
  };

  if (isSuccess) {
    return (
      <MobileLayout title="下单成功">
        <div className="flex flex-col items-center justify-center h-[70vh] px-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 15 }}
            className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6"
          >
            <CheckCircle2 className="w-10 h-10" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">订单已提交！</h2>
          <p className="text-muted-foreground mb-8">感谢您的惠顾，厨房正在火速准备中...</p>
          <Link href="/">
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-medium active:scale-95 transition-transform shadow-lg shadow-primary/20">
              返回首页
            </button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  if (cart.length === 0 && !isSuccess) {
    setLocation("/");
    return null;
  }

  return (
    <MobileLayout title="确认订单" showBack>
      <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-36">

        {/* Delivery Info */}
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-card-border space-y-4">
          <h3 className="font-bold text-lg mb-2">配送信息</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3 border border-border/50 focus-within:border-primary focus-within:bg-background transition-colors">
              <User className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="联系人姓名"
                className="bg-transparent border-none outline-none flex-1 w-full text-sm"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3 border border-border/50 focus-within:border-primary focus-within:bg-background transition-colors">
              <Phone className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                type="tel"
                placeholder="手机号码"
                className="bg-transparent border-none outline-none flex-1 w-full text-sm"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-3 border border-border/50 focus-within:border-primary focus-within:bg-background transition-colors">
              <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <textarea
                placeholder="详细地址 (如: xx路xx小区x号楼x单元)"
                className="bg-transparent border-none outline-none flex-1 w-full text-sm resize-none h-16"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>
            <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-3 border border-border/50 focus-within:border-primary focus-within:bg-background transition-colors">
              <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <textarea
                placeholder="备注 (如: 少辣、不加葱、餐具x2…)"
                className="bg-transparent border-none outline-none flex-1 w-full text-sm resize-none h-14"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-card-border">
          <h3 className="font-bold text-lg mb-4">订单详情</h3>
          <div className="space-y-3 mb-4">
            {cart.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="flex-1 truncate pr-4">{item.name}</span>
                <span className="text-muted-foreground w-12 text-right">x{item.quantity}</span>
                <span className="font-medium w-16 text-right">¥{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>包装费</span>
              <span>¥{packingFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="font-bold">合计</span>
              <span className="text-xl font-bold text-primary">¥{finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-card-border">
          <h3 className="font-bold text-lg mb-4">扫码付款</h3>

          {/* Tab Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border mb-5">
            <button
              type="button"
              onClick={() => setPayMethod("wechat")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                payMethod === "wechat"
                  ? "bg-[#07C160] text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.11.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.49.49 0 0 1 .176-.554C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-3.318 2.187c.534 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.543.434-.983.969-.983zm6.391 0c.534 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.543.434-.983.969-.983z"/>
              </svg>
              微信支付
            </button>
            <button
              type="button"
              onClick={() => setPayMethod("alipay")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                payMethod === "alipay"
                  ? "bg-[#1677FF] text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.422 15.358c-3.83-1.153-6.055-1.84-6.055-1.84.618-1.17 1.145-2.533 1.458-4.014H21V7.639h-5.538V5.928h-2.187v1.711H7.737v1.865h9.185a14.96 14.96 0 0 1-.8 2.54s-1.618-.48-3.19-.832c-1.616-.363-3.42-.387-4.735.54-1.315.928-1.802 2.354-1.688 3.606.194 2.12 2.003 3.784 5.023 3.784 1.756 0 3.735-.616 5.437-2.095 1.09.527 4.7 2.328 5.85 2.92L24 17.973c-.32-.7-1.28-2.01-2.578-2.615zM11.51 17.45c-2.17 0-3.454-1.096-3.523-2.265-.044-.764.347-1.63 1.278-2.027.79-.34 2.072-.308 3.02-.097.972.217 2.285.682 2.285.682-1.007 2.04-2.53 3.707-3.06 3.707zM0 24h14.234C6.354 20.71 1.048 15.36 0 14.234V24zM10.766 0H0v14.234C2.132 9.678 6.025 3.19 10.766 0zM24 0H12.43c3.552 1.5 7.486 5.482 9.893 9.993L24 0z"/>
              </svg>
              支付宝
            </button>
          </div>

          {/* QR Code Display */}
          <AnimatePresence mode="wait">
            <motion.div
              key={payMethod}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center"
            >
              <div className="rounded-2xl overflow-hidden border-4 border-white shadow-lg">
                <img
                  src={payMethod === "wechat" ? "/wechat-qr.png" : "/alipay-qr.jpg"}
                  alt={payMethod === "wechat" ? "微信收款码" : "支付宝收款码"}
                  className="w-52 h-52 object-cover"
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                请使用
                <span className={`font-medium mx-1 ${payMethod === "wechat" ? "text-[#07C160]" : "text-[#1677FF]"}`}>
                  {payMethod === "wechat" ? "微信" : "支付宝"}
                </span>
                扫码支付
                <span className="font-bold text-primary ml-1">¥{finalTotal.toFixed(2)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">付款后点击下方"提交订单"按钮</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border max-w-[430px] mx-auto z-40">
          <button
            type="submit"
            disabled={isSubmitting || !formData.name || !formData.phone || !formData.address}
            className="w-full bg-primary text-primary-foreground rounded-full py-3.5 font-bold shadow-xl shadow-primary/20 active:scale-[0.98] transition-transform text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                提交中...
              </span>
            ) : (
              `已付款，提交订单`
            )}
          </button>
        </div>
      </form>
    </MobileLayout>
  );
}
