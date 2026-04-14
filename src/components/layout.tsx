import { Link, useLocation } from "wouter";
import { useCart } from "../context/CartContext";
import { ShoppingBag, ChevronLeft, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MobileLayout({ children, title, showBack = false }: { children: React.ReactNode, title: string, showBack?: boolean }) {
  const { totalItems, totalPrice } = useCart();
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-muted/30 w-full flex justify-center font-sans">
      <div className="w-full max-w-[430px] bg-background shadow-2xl flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center w-1/3">
            {showBack ? (
              <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors active:scale-95">
                <ChevronLeft className="w-5 h-5" />
              </Link>
            ) : null}
          </div>
          <div className="w-1/3 flex justify-center">
            <h1 className="font-medium text-lg tracking-tight text-foreground">{title}</h1>
          </div>
          <div className="w-1/3 flex justify-end">
            {location === "/" && (
              <Link href="/orders" className="p-2 -mr-2 rounded-full hover:bg-muted text-foreground transition-colors active:scale-95">
                <ClipboardList className="w-5 h-5" />
              </Link>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-24">
          {children}
        </main>

        {/* Floating Cart Bar (only on home, when cart has items) */}
        <AnimatePresence>
          {location === "/" && totalItems > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-40 pb-6"
            >
              <Link href="/cart">
                <div className="bg-primary text-primary-foreground rounded-full px-4 py-3 flex items-center justify-between shadow-xl shadow-primary/20 cursor-pointer active:scale-[0.98] transition-transform">
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
