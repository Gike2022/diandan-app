// ============================================
// 导入依赖
// ============================================
import { useState, useRef, useEffect } from "react";
import { MENU_DATA, MENU_CATEGORIES } from "../data/menu";
import { useCart } from "../context/CartContext";
import { MobileLayout } from "../components/layout";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Plus, Minus, Heart, Sparkles, TrendingUp, Star } from "lucide-react";

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

  /** 横幅区域引用，用于视差效果 */
  const bannerRef = useRef<HTMLDivElement>(null);

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

  // ==================== 视差滚动效果 ====================
  
  /**
   * 监听滚动实现横幅视差效果
   */
  useEffect(() => {
    const container = scrollContainerRef.current;
    const banner = bannerRef.current;
    if (!container || !banner) return;

    const handleParallax = () => {
      const scrollTop = container.scrollTop;
      // 视差速度系数（0.3 表示背景移动速度是滚动速度的30%）
      banner.style.transform = `translateY(${scrollTop * 0.3}px)`;
      banner.style.opacity = `${Math.max(0.3, 1 - scrollTop / 300)}`;
    };

    container.addEventListener('scroll', handleParallax);
    return () => container.removeEventListener('scroll', handleParallax);
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
      <div className="relative h-40 w-full overflow-hidden">
        {/* 渐变背景层 */}
        <motion.div 
          ref={bannerRef}
          className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
        
        {/* 装饰光晕 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-accent/15 rounded-full blur-3xl" />
        
        {/* 标题内容 */}
        <div className="absolute inset-0 flex flex-col justify-center px-6 z-10">
          {/* 装饰图标 - 添加动画 */}
          <motion.div 
            className="flex items-center gap-2 mb-2"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Heart className="w-5 h-5 text-primary fill-primary drop-shadow-lg" />
            </motion.div>
            <Sparkles className="w-4 h-4 text-secondary drop-shadow-lg" />
            <Star className="w-3 h-3 text-accent fill-accent drop-shadow-lg" />
          </motion.div>
          
          {/* 主标题 - 添加动画 */}
          <motion.h2 
            className="font-['Zhi_Mang_Xing'] text-5xl text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)] mb-1"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            甜蜜小厨
          </motion.h2>
          
          {/* 副标题 - 添加动画 */}
          <motion.p 
            className="text-sm text-foreground/80 font-medium tracking-wide"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            用心烹饪 · 为爱而食
          </motion.p>
        </div>
      </div>

      {/* ==================== 通知栏 ==================== */}
      <motion.div 
        className="bg-gradient-to-r from-secondary/15 via-primary/10 to-accent/15 border-y border-secondary/20 px-4 py-2.5 flex items-center gap-2 overflow-hidden backdrop-blur-sm"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <motion.span 
          className="text-xs font-bold text-secondary-foreground bg-gradient-to-r from-secondary/40 to-primary/40 px-2 py-1 rounded-full shrink-0 shadow-sm"
          animate={{ 
            boxShadow: [
              "0 0 0 0 rgba(167, 139, 250, 0)",
              "0 0 0 4px rgba(167, 139, 250, 0.1)",
              "0 0 0 0 rgba(167, 139, 250, 0)"
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          💕 爱情提示
        </motion.span>
        <motion.p 
          className="text-xs text-foreground/80 truncate font-medium"
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          I LOVE YOU ✨
        </motion.p>
      </motion.div>

      {/* ==================== 主内容区域 ==================== */}
      <div className="flex h-[calc(100dvh-17rem)] relative">
        
        {/* ========== 左侧分类导航栏 ========== */}
        <div className="w-24 bg-gradient-to-b from-muted/40 via-muted/30 to-muted/40 overflow-y-auto sticky top-0 h-full border-r border-border/30 hide-scrollbar backdrop-blur-sm">
          {MENU_CATEGORIES.map((category, index) => (
            <motion.button
              key={category}
              onClick={() => scrollToCategory(category)}
              className={`w-full py-4 px-2 text-sm text-center transition-all duration-300 relative group ${
                activeCategory === category
                  ? "text-primary font-bold bg-gradient-to-r from-primary/10 to-accent/10"
                  : "text-foreground/70 font-medium hover:bg-muted/50 hover:text-foreground"
              }`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6 + index * 0.05, duration: 0.4 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* 激活状态指示条（带动画） */}
              {activeCategory === category && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-accent to-secondary rounded-r-full shadow-lg shadow-primary/50"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              
              {/* 悬浮光晕效果 */}
              {activeCategory === category && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
              
              <span className="relative z-10">{category}</span>
            </motion.button>
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
                <motion.h3 
                  className="font-bold text-lg mb-4 flex items-center gap-2"
                  initial={{ x: -20, opacity: 0 }}
                  whileInView={{ x: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <motion.span 
                    className="w-1 h-5 bg-gradient-to-b from-primary via-accent to-secondary rounded-full block shadow-lg shadow-primary/50"
                    animate={{ 
                      height: ["20px", "24px", "20px"],
                      boxShadow: [
                        "0 0 10px rgba(244, 114, 182, 0.5)",
                        "0 0 20px rgba(244, 114, 182, 0.8)",
                        "0 0 10px rgba(244, 114, 182, 0.5)"
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {category}
                  </span>
                </motion.h3>
                
                {/* 菜品列表 */}
                <div className="space-y-6">
                  {dishes.map((dish, dishIndex) => {
                    // 获取当前菜品在购物车中的数量
                    const cartItem = cart.find(c => c.id === dish.id);
                    const qty = cartItem?.quantity || 0;

                    return (
                      <DishCard 
                        key={dish.id} 
                        dish={dish}
                        qty={qty}
                        dishIndex={dishIndex}
                        addToCart={addToCart}
                        updateQuantity={updateQuantity}
                      />
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

// ============================================
// 菜品卡片组件（独立组件以优化性能）
// ============================================

interface DishCardProps {
  dish: any;
  qty: number;
  dishIndex: number;
  addToCart: (dish: any) => void;
  updateQuantity: (id: string, quantity: number) => void;
}

function DishCard({ dish, qty, dishIndex, addToCart, updateQuantity }: DishCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { once: true, margin: "-50px" });

  return (
    <motion.div 
      ref={cardRef}
      className={`flex gap-3 group relative ${dish.soldOut ? "opacity-60" : ""}`}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ 
        duration: 0.5, 
        delay: dishIndex * 0.1,
        ease: "easeOut"
      }}
      whileHover={{ scale: 1.02 }}
    >
      {/* 玻璃态背景卡片 */}
      <div className="absolute inset-0 bg-gradient-to-br from-card/40 via-card/20 to-transparent backdrop-blur-sm rounded-2xl border border-border/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10 flex gap-3 w-full">
        {/* ===== 菜品图片 ===== */}
        <motion.div 
          className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 relative shadow-lg"
          whileHover={{ scale: 1.05, rotate: 2 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <img
            src={dish.imageUrl}
            alt={dish.name}
            className="w-full h-full object-cover transition-all duration-700 group-hover:scale-125 group-hover:brightness-110"
            loading="lazy"
          />
          
          {/* 图片光晕效果 */}
          <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* 售罄遮罩 */}
          {dish.soldOut && (
            <motion.div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="text-white text-xs font-bold bg-destructive/80 px-2 py-1 rounded-full shadow-lg">
                今日售罄
              </span>
            </motion.div>
          )}
          
          {/* 热门标签 */}
          {!dish.soldOut && dishIndex < 2 && (
            <motion.div 
              className="absolute top-1 right-1 bg-gradient-to-r from-accent to-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.5 + dishIndex * 0.1, type: "spring" }}
            >
              <TrendingUp className="w-2.5 h-2.5" />
              <span>热销</span>
            </motion.div>
          )}
        </motion.div>
        
        {/* ===== 菜品信息 ===== */}
        <div className="flex flex-col flex-1 py-0.5 justify-between relative z-10">
          {/* 菜品名称和描述 */}
          <div>
            <h4 className="font-bold text-foreground leading-tight mb-1 group-hover:text-primary transition-colors duration-300">
              {dish.name}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2 group-hover:text-foreground/70 transition-colors duration-300">
              {dish.description}
            </p>
          </div>
          
          {/* 价格和购物车操作 */}
          <div className="flex items-center justify-between mt-2">
            {/* 价格显示 - 添加跳动动画 */}
            <motion.div
              className="text-primary font-bold text-lg flex items-baseline"
              whileHover={{ scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <span className="text-sm">¥</span>
              <motion.span
                key={dish.price}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
              >
                {dish.price}
              </motion.span>
            </motion.div>
            
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
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    onClick={() => addToCart(dish)}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/40 relative overflow-hidden"
                  >
                    {/* 按钮光晕效果 */}
                    <motion.div
                      className="absolute inset-0 bg-white/20"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 0, 0.5]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <Plus className="w-4 h-4 relative z-10" />
                  </motion.button>
                ) : (
                  // 已添加时：显示加减数量控制器
                  <motion.div
                    key="stepper"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    {/* 减少按钮 */}
                    <motion.button
                      onClick={() => updateQuantity(dish.id, qty - 1)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-7 h-7 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                    >
                      <Minus className="w-3 h-3" />
                    </motion.button>
                    
                    {/* 数量显示 - 添加数字跳动动画 */}
                    <motion.span
                      key={qty}
                      initial={{ y: -10, opacity: 0, scale: 0.5 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      className="w-5 text-center font-bold text-sm bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
                    >
                      {qty}
                    </motion.span>
                    
                    {/* 增加按钮 */}
                    <motion.button
                      onClick={() => addToCart(dish)}
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-7 h-7 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/40 relative overflow-hidden"
                    >
                      {/* 按钮光晕效果 */}
                      <motion.div
                        className="absolute inset-0 bg-white/20"
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <Plus className="w-3 h-3 relative z-10" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
