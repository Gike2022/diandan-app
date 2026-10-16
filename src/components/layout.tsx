import { Link, useLocation } from "wouter";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { toast } from "../hooks/use-toast";
import { ShoppingBag, ChevronLeft, ClipboardList, Heart, LogIn, LogOut, Store, UserRound } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MobileLayout({ children, title, showBack = false, wide = false }: { children: React.ReactNode, title: string, showBack?: boolean; wide?: boolean }) {
  const { totalItems, totalPrice, clearCart } = useCart();
  const auth = useAuth();
  const [location, setLocation] = useLocation();
  const signOut = async () => {
    clearCart();
    setLocation("/");
    try { await auth.logout(); }
    catch { toast({ title: "已退出当前页面的登录", description: "网络恢复后可重新登录" }); }
  };

  return (
    <div className="min-h-[100dvh] w-full flex justify-center font-sans relative">
      <div className={`w-full ${wide ? "max-w-[1100px]" : "max-w-[430px]"} bg-background/80 backdrop-blur-md shadow-2xl flex flex-col relative overflow-hidden border-x border-border/30`}>
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/30 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center w-1/3">
            {showBack ? (
              <Link href="/" aria-label="返回菜单" className="p-2 -ml-2 min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50 text-foreground transition-colors active:scale-95">
                <ChevronLeft className="w-5 h-5" />
              </Link>
            ) : null}
            {location === "/" && auth.user?.role === "admin" && <Link href="/admin" aria-label="商家管理" title="商家管理" className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50"><Store className="w-5 h-5" aria-hidden="true" /></Link>}
            {auth.user && location !== "/profile" && <Link href="/profile" aria-label="个人资料" title="个人资料与修改密码" className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50"><UserRound className="w-5 h-5" aria-hidden="true" /></Link>}
          </div>
          <div className="w-1/3 flex justify-center items-center gap-1.5">
            <Heart className="w-4 h-4 text-primary fill-primary" />
            <h1 className="font-medium text-lg tracking-tight text-foreground">{title}</h1>
          </div>
          <div className="w-1/3 flex justify-end items-center">
            {location === "/" && (
              <Link href="/orders" aria-label="历史订单" className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50 text-foreground transition-colors active:scale-95">
                <ClipboardList className="w-5 h-5" />
              </Link>
            )}
            {auth.user ? <button onClick={() => { void signOut(); }} aria-label="退出登录" title={`退出 ${auth.user.displayName}`} className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50 text-foreground"><LogOut className="w-5 h-5" aria-hidden="true" /></button>
              : !auth.isChecking && !["/login", "/register"].includes(location) && <Link href={`/login?next=${encodeURIComponent(location)}`} aria-label="登录" className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-muted/50 text-foreground"><LogIn className="w-5 h-5" aria-hidden="true" /></Link>}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-24">
          {children}
        </main>

        {/* Floating Cart Bar */}
        <AnimatePresence>
          {location === "/" && totalItems > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent z-40 pb-6"
            >
              <Link href="/cart">
                <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full px-4 py-3 flex items-center justify-between shadow-xl shadow-primary/30 cursor-pointer active:scale-[0.98] transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <ShoppingBag className="w-5 h-5" />
                      <motion.div
                        key={totalItems}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-2 -right-2 bg-secondary text-secondary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                      >
                        {totalItems}
                      </motion.div>
                    </div>
                    <span className="font-medium">去结算</span>
                  </div>
                  <div className="font-bold">
                    ¥{totalPrice.toFixed(2)}
                  </div>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
