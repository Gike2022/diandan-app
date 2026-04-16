import { Link } from "wouter";
import { MobileLayout } from "../components/layout";
import { ClipboardList, RotateCcw, Heart } from "lucide-react";
import { useCart } from "../context/CartContext";
import { motion } from "framer-motion";

export interface SavedOrder {
  id: string;
  date: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  name: string;
  address: string;
  notes: string;
  payMethod: string;
}

export function getSavedOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem("order_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: SavedOrder) {
  const existing = getSavedOrders();
  const updated = [order, ...existing].slice(0, 20);
  localStorage.setItem("order_history", JSON.stringify(updated));
}

export default function Orders() {
  const orders = getSavedOrders();
  const { addToCart } = useCart();

  const reorder = (order: SavedOrder) => {
    order.items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        addToCart({
          id: item.name,
          name: item.name,
          category: "",
          description: "",
          price: item.price,
          imageUrl: ""
        });
      }
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <MobileLayout title="甜蜜回忆" showBack>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <ClipboardList className="w-10 h-10 text-muted-foreground/50" />
          </div>
          <h2 className="text-xl font-bold mb-2">还没有甜蜜回忆</h2>
          <p className="text-muted-foreground mb-8 flex items-center gap-1">
            去点一份好吃的 <Heart className="w-4 h-4 text-primary fill-primary" /> 吧
          </p>
          <Link href="/">
            <button className="bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 py-3 rounded-full font-medium active:scale-95 transition-transform shadow-lg shadow-primary/30">
              去浏览菜单
            </button>
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {orders.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card/80 backdrop-blur-sm rounded-2xl p-4 border border-card-border shadow-sm"
            >
              {/* Order Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{formatDate(order.date)}</p>
                  <p className="font-bold text-sm mt-0.5">订单 #{order.id.slice(-6)}</p>
                </div>
                <span className="text-primary font-bold text-lg">¥{order.total.toFixed(2)}</span>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3 pb-3 border-b border-border">
                {order.items.map((item, j) => (
                  <div key={j} className="flex justify-between text-sm">
                    <span className="text-foreground/80">{item.name}</span>
                    <span className="text-muted-foreground">x{item.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span className={`inline-flex items-center gap-1 ${order.payMethod === "wechat" ? "text-[#07C160]" : "text-[#1677FF]"}`}>
                    {order.payMethod === "wechat" ? "微信支付" : "支付宝"}
                  </span>
                  {order.notes && <span className="ml-2 text-muted-foreground">· {order.notes}</span>}
                </div>
                <Link href="/">
                  <button
                    onClick={() => reorder(order)}
                    className="flex items-center gap-1 text-xs text-primary font-medium border border-primary/30 rounded-full px-3 py-1.5 active:scale-95 transition-transform hover:bg-primary/10"
                  >
                    <RotateCcw className="w-3 h-3" />
                    再来一单
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}
