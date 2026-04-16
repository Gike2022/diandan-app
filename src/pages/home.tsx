import { useState, useRef, useEffect } from "react";
import { MENU_DATA, MENU_CATEGORIES } from "../data/menu";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, Heart, Sparkles } from "lucide-react";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0]);
  const { addToCart, updateQuantity, cart } = useCart();
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 监听滚动，自动更新左侧分类指示器
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top + 100; // 偏移量，让分类标题接近顶部时就激活

      let currentCategory = MENU_CATEGORIES[0];

      for (const category of MENU_CATEGORIES) {
        const el = categoryRefs.current[category];
        if (el) {
          const elRect = el.getBoundingClientRect();
          // 如果分类区域的顶部在容器顶部上方或刚好在视口内
          if (elRect.top <= containerTop) {
            currentCategory = category;
          }
        }
      }

      if (!isScrollingRef.current) {
        setActiveCategory(currentCategory);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    isScrollingRef.current = true;

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

    // 滚动动画结束后恢复自动跟踪
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 500);
  };

  return (
    <MobileLayout title="甜蜜小厨">
      {/* Hero Banner */}
      <div className="relative h-36 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20" />
        <div className="absolute inset-0 flex flex-col justify-center px-6">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-5 h-5 text-primary fill-primary" />
            <Sparkles className="w-4 h-4 text-secondary" />
          </div>
          <h2 className="font-['Zhi_Mang_Xing'] text-4xl text-foreground drop-shadow-sm mb-1">甜蜜小厨</h2>
          <p className="text-sm text-foreground/70 font-medium">用心烹饪 · 为爱而食</p>
        </div>
      </div>

      {/* Notice Bar */}
      <div className="bg-secondary/10 border-y border-secondary/20 px-4 py-2 flex items-center gap-2 overflow-hidden">
        <span className="text-xs font-bold text-secondary-foreground bg-secondary/30 px-1.5 py-0.5 rounded shrink-0">爱情提示</span>
        <p className="text-xs text-foreground/70 truncate">I LOVE YOU</p>
      </div>

      <div className="flex h-[calc(100dvh-17rem)] relative">
        {/* Sidebar categories */}
        <div className="w-24 bg-muted/30 overflow-y-auto sticky top-0 h-full border-r border-border/30 hide-scrollbar">
          {MENU_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => scrollToCategory(category)}
              className={`w-full py-4 px-2 text-sm text-center transition-colors relative ${
                activeCategory === category
                  ? "text-primary font-bold bg-background/50"
                  : "text-foreground/70 font-medium hover:bg-muted/50"
              }`}
            >
              {activeCategory === category && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-accent rounded-r-full"
                />
              )}
              {category}
            </button>
          ))}
        </div>

        {/* Menu Items */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pb-24">
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
                  <span className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full block"></span>
                  {category}
                </h3>
                <div className="space-y-6">
                  {dishes.map((dish) => {
                    const cartItem = cart.find(c => c.id === dish.id);
                    const qty = cartItem?.quantity || 0;

                    return (
                      <div key={dish.id} className={`flex gap-3 group ${dish.soldOut ? "opacity-60" : ""}`}>
                        <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-muted border border-border/30 relative">
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
                                    className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/30 active:scale-90 transition-transform"
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
                                      className="w-7 h-7 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/30 active:scale-90 transition-transform"
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
