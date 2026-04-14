import { useState, useRef } from "react";
import { MENU_DATA, MENU_CATEGORIES } from "../data/menu";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0]);
  const { addToCart, updateQuantity, cart } = useCart();
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    const el = categoryRefs.current[category];
    const container = scrollContainerRef.current;
    if (el && container) {
      const containerTop = container.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      container.scrollBy({
        top: elTop - containerTop - 8,
        behavior: 'smooth'
      });
    }
  };

  return (
    <MobileLayout title="老街坊家常菜">
      {/* Hero Banner */}
      <div className="relative h-32 w-full bg-primary/10 overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-center px-6">
          <h2 className="font-['Zhi_Mang_Xing'] text-4xl text-primary drop-shadow-sm mb-1">老街坊家常菜</h2>
          <p className="text-sm text-foreground/70 font-medium">地道风味 · 匠心烹饪</p>
        </div>
      </div>

      {/* Notice Bar */}
      <div className="bg-secondary/20 border-y border-secondary/30 px-4 py-2 flex items-center gap-2 overflow-hidden">
        <span className="text-xs font-bold text-secondary-foreground bg-secondary/50 px-1.5 py-0.5 rounded shrink-0">公告</span>
        <p className="text-xs text-foreground/70 truncate">营业时间 11:00–21:00 · 今日特价：麻婆豆腐 ¥28 · 满 100 元免配送费</p>
      </div>

      <div className="flex h-[calc(100dvh-16rem)] relative">
        {/* Sidebar categories */}
        <div className="w-24 bg-muted/50 overflow-y-auto sticky top-0 h-full border-r border-border/50 hide-scrollbar">
          {MENU_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => scrollToCategory(category)}
              className={`w-full py-4 px-2 text-sm text-center transition-colors relative ${
                activeCategory === category
                  ? "text-primary font-bold bg-background"
                  : "text-foreground/70 font-medium hover:bg-muted"
              }`}
            >
              {activeCategory === category && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                />
              )}
              {category}
            </button>
          ))}
        </div>

        {/* Menu Items - actual scroll container */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pb-24 bg-background">
          {MENU_CATEGORIES.map((category) => {
            const dishes = MENU_DATA.filter((d) => d.category === category);
            if (dishes.length === 0) return null;

            return (
              <div
                key={category}
                ref={(el) => { categoryRefs.current[category] = el; }}
                className="mb-8"
              >
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-secondary rounded-full block"></span>
                  {category}
                </h3>
                <div className="space-y-6">
                  {dishes.map((dish) => {
                    const cartItem = cart.find(c => c.id === dish.id);
                    const qty = cartItem?.quantity || 0;

                    return (
                      <div key={dish.id} className={`flex gap-3 group ${dish.soldOut ? "opacity-60" : ""}`}>
                        <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-muted border border-border/50 relative">
                          <img
                            src={dish.imageUrl}
                            alt={dish.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          {dish.soldOut && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">今日售罄</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col flex-1 py-0.5 justify-between">
                          <div>
                            <h4 className="font-bold text-foreground leading-tight mb-1">{dish.name}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2">{dish.description}</p>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-primary font-bold text-lg"><span className="text-sm">¥</span>{dish.price}</span>
                            {dish.soldOut ? (
                              <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1">已售罄</span>
                            ) : (
                              <AnimatePresence mode="wait">
                                {qty === 0 ? (
                                  <motion.button
                                    key="plus"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    onClick={() => addToCart(dish)}
                                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/20 active:scale-90 transition-transform"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </motion.button>
                                ) : (
                                  <motion.div
                                    key="stepper"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="flex items-center gap-2"
                                  >
                                    <button
                                      onClick={() => updateQuantity(dish.id, qty - 1)}
                                      className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center active:scale-90 transition-transform"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="w-4 text-center font-bold text-sm">{qty}</span>
                                    <button
                                      onClick={() => addToCart(dish)}
                                      className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/20 active:scale-90 transition-transform"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MobileLayout>
  );
}
