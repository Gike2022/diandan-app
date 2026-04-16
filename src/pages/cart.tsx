import { Link } from "wouter";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ShoppingBag, Heart } from "lucide-react";

export default function Cart() {
  const { cart, updateQuantity, totalPrice, totalItems } = useCart();

  if (cart.length === 0) {
    return (
      <MobileLayout title="购物车" showBack>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <ShoppingBag className="w-10 h-10 text-muted-foreground/50" />
          </div>
          <h2 className="text-xl font-bold mb-2">购物车是空的</h2>
          <p className="text-muted-foreground mb-8 flex items-center gap-1">
            点些好吃的 <Heart className="w-4 h-4 text-primary fill-primary" /> 犒劳一下自己吧
          </p>
          <Link href="/">
            <button className="bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 py-3 rounded-full font-medium active:scale-95 transition-transform shadow-lg shadow-primary/30">
              去浏览菜单
            </button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="购物车" showBack>
      <div className="p-4 space-y-4">
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-card-border">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full block"></span>
            已选菜品 ({totalItems})
          </h3>
          
          <div className="space-y-6">
            <AnimatePresence>
              {cart.map((item) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  key={item.id} 
                  className="flex gap-4 items-center"
                >
                  <img 
                    src={item.imageUrl} 
                    alt={item.name} 
                    className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0" 
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm mb-1 truncate">{item.name}</h4>
                    <p className="text-primary font-bold text-sm">¥{item.price}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <button 
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-foreground active:scale-95 transition-transform"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-4 text-center font-bold text-sm">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-card-border space-y-3">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>商品总价</span>
            <span>¥{totalPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>包装费</span>
            <span>¥{(totalItems * 0.5).toFixed(2)}</span>
          </div>
          <div className="pt-3 border-t border-border flex justify-between items-center">
            <span className="font-bold">小计</span>
            <span className="text-xl font-bold text-primary">¥{(totalPrice + totalItems * 0.5).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border max-w-[430px] mx-auto z-40">
        <Link href="/checkout">
          <button className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full py-3.5 font-bold shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform text-lg flex items-center justify-center gap-2">
            去结算
          </button>
        </Link>
      </div>
    </MobileLayout>
  );
}
