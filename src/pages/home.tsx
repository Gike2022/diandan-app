// ============================================
// 导入依赖
// ============================================
import { useState, useRef, useEffect } from "react";
import { MENU_DATA, MENU_CATEGORIES } from "../data/menu";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, Heart, Sparkles } from "lucide-react";

// ============================================
// 首页组件
// ============================================

/**
 * 首页组件 - 展示菜单和购物车功能
 * 
 * 主要功能：
 * 1. 左侧分类导航栏，支持点击跳转
 * 2. 右侧菜品列表，支持滚动自动更新分类
 * 3. 菜品加减购物车功能
 * 4. 售罄状态显示
 */
export default function Home() {
  // ==================== 状态管理 ====================
  
  /** 当前激活的菜单分类 */
  const [activeCategory, setActiveCategory] = useState<string>(MENU_CATEGORIES[0]);
  
  /** 购物车相关方法和数据 */
  const { addToCart, updateQuantity, cart } = useCart();
  
  /** 各分类区域的DOM引用，用于滚动定位 */
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  /** 菜单滚动容器的引用 */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  /** 标记是否正在执行点击滚动，避免与自动跟踪冲突 */
  const isScrollingRef = useRef(false);

  // ==================== 滚动监听与分类自动跟踪 ====================
  
  /**
   * 监听菜单滚动，自动更新左侧分类指示器
   * 当用户滚动菜单时，根据当前可见区域自动高亮对应分类
   */
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    /**
     * 滚动事件处理函数
     * 计算当前滚动位置对应的分类，并更新激活状态
     */
    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      // 偏移量：让分类标题接近顶部时就激活（100px提前量）
      const containerTop = containerRect.top + 100;

      let currentCategory: string = MENU_CATEGORIES[0];

      // 遍历所有分类，找到当前应该激活的分类
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

      // 只在非手动点击滚动时更新分类（避免冲突）
      if (!isScrollingRef.current) {
        setActiveCategory(currentCategory);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ==================== 分类点击滚动 ====================
  
  /**
   * 点击分类时滚动到对应区域
   * @param category - 目标分类名称
   */
  const scrollToCategory = (category: string) => {
    // 立即更新激活状态
    setActiveCategory(category);
    // 标记为手动滚动，暂停自动跟踪
    isScrollingRef.current = true;

    const el = categoryRefs.current[category];
    const container = scrollContainerRef.current;
    
    if (el && container) {
      // 计算目标位置并平滑滚动
      const containerTop = container.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      container.scrollBy({
        top: elTop - containerTop - 8, // 8px 顶部间距
        behavior: 'smooth'
      });
    }

    // 滚动动画结束后（500ms）恢复自动跟踪
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 500);
  };

  // ==================== 渲染组件 ====================
  
  return (
    <MobileLayout title="甜蜜小厨">
      
      {/* ==================== 顶部横幅 ==================== */}
      <div className="relative h-36 w-full overflow-hidden">
        {/* 渐变背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20" />
        
        {/* 标题内容 */}
        <div className="absolute inset-0 flex flex-col justify-center px-6">
          {/* 装饰图标 */}
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-5 h-5 text-primary fill-primary" />
            <Sparkles className="w-4 h-4 text-secondary" />
          </div>
          
          {/* 主标题 */}
          <h2 className="font-['Zhi_Mang_Xing'] text-4xl text-foreground drop-shadow-sm mb-1">
            甜蜜小厨
          </h2>
          
          {/* 副标题 */}
          <p className="text-sm text-foreground/70 font-medium">
            用心烹饪 · 为爱而食
          </p>
        </div>
      </div>

      {/* ==================== 通知栏 ==================== */}
      <div className="bg-secondary/10 border-y border-secondary/20 px-4 py-2 flex items-center gap-2 overflow-hidden">
        <span className="text-xs font-bold text-secondary-foreground bg-secondary/30 px-1.5 py-0.5 rounded shrink-0">
          爱情提示
        </span>
        <p className="text-xs text-foreground/70 truncate">
          I LOVE YOU
        </p>
      </div>

      {/* ==================== 主内容区域 ==================== */}
      <div className="flex h-[calc(100dvh-17rem)] relative">
        
        {/* ========== 左侧分类导航栏 ========== */}
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
              {/* 激活状态指示条（带动画） */}
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

        {/* ========== 右侧菜品列表 ========== */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pb-24">
          {MENU_CATEGORIES.map((category) => {
            // 筛选当前分类的菜品
            const dishes = MENU_DATA.filter((d) => d.category === category);
            if (dishes.length === 0) return null;

            return (
              <div
                key={category}
                ref={(el) => { categoryRefs.current[category] = el; }}
                className="mb-8"
              >
                {/* 分类标题 */}
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-primary to-accent rounded-full block"></span>
                  {category}
                </h3>
                
                {/* 菜品列表 */}
                <div className="space-y-6">
                  {dishes.map((dish) => {
                    // 获取当前菜品在购物车中的数量
                    const cartItem = cart.find(c => c.id === dish.id);
                    const qty = cartItem?.quantity || 0;

                    return (
                      <div 
                        key={dish.id} 
                        className={`flex gap-3 group ${dish.soldOut ? "opacity-60" : ""}`}
                      >
                        {/* ===== 菜品图片 ===== */}
                        <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-muted border border-border/30 relative">
                          <img
                            src={dish.imageUrl}
                            alt={dish.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          
                          {/* 售罄遮罩 */}
                          {dish.soldOut && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">
                                今日售罄
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* ===== 菜品信息 ===== */}
                        <div className="flex flex-col flex-1 py-0.5 justify-between">
                          {/* 菜品名称和描述 */}
                          <div>
                            <h4 className="font-bold text-foreground leading-tight mb-1">
                              {dish.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {dish.description}
                            </p>
                          </div>
                          
                          {/* 价格和购物车操作 */}
                          <div className="flex items-center justify-between mt-2">
                            {/* 价格显示 */}
                            <span className="text-primary font-bold text-lg">
                              <span className="text-sm">¥</span>{dish.price}
                            </span>
                            
                            {/* 购物车按钮区域 */}
                            {dish.soldOut ? (
                              // 售罄状态
                              <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1">
                                已售罄
                              </span>
                            ) : (
                              // 加减购物车按钮（带动画切换）
                              <AnimatePresence mode="wait">
                                {qty === 0 ? (
                                  // 未添加时：显示加号按钮
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
                                  // 已添加时：显示加减数量控制器
                                  <motion.div
                                    key="stepper"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="flex items-center gap-2"
                                  >
                                    {/* 减少按钮 */}
                                    <button
                                      onClick={() => updateQuantity(dish.id, qty - 1)}
                                      className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center active:scale-90 transition-transform"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    
                                    {/* 数量显示 */}
                                    <span className="w-4 text-center font-bold text-sm">
                                      {qty}
                                    </span>
                                    
                                    {/* 增加按钮 */}
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
