// ============================================
// 菜品数据类型定义
// ============================================

/**
 * 菜品数据结构
 * @property {string} id - 菜品唯一标识符
 * @property {string} name - 菜品名称
 * @property {string} category - 所属分类
 * @property {string} description - 菜品描述
 * @property {number} price - 价格（单位：元）
 * @property {string} imageUrl - 菜品图片URL
 * @property {boolean} soldOut - 是否售罄（可选）
 */
export type Dish = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  soldOut?: boolean;
};

// ============================================
// 菜单分类配置
// ============================================

/**
 * 菜单分类列表
 * 用于左侧导航栏和菜品分组显示
 */
export const MENU_CATEGORIES = [
  "甜蜜主菜",
  "清爽凉菜",
  "暖心主食",
  "甜蜜饮品",
  "小食甜点"
] as const;

// ============================================
// 菜品数据
// ============================================

/**
 * 完整菜单数据
 * 按分类组织所有可供点餐的菜品
 */
export const MENU_DATA: Dish[] = [
  // ==================== 甜蜜主菜 ====================
  {
    id: "h1",
    name: "爱心红烧肉",
    category: "甜蜜主菜",
    description: "肥而不腻，入口即化，甜蜜滋味",
    price: 68,
    imageUrl: "https://picsum.photos/seed/hongshaorou/400/300"
  },
  {
    id: "h2",
    name: "情侣鸡丁",
    category: "甜蜜主菜",
    description: "酸甜微辣，花生酥脆，鸡肉鲜嫩",
    price: 42,
    imageUrl: "https://picsum.photos/seed/gongbaojiding/400/300"
  },
  {
    id: "h3",
    name: "麻婆豆腐",
    category: "甜蜜主菜",
    description: "麻辣鲜香，烫爽下饭",
    price: 28,
    imageUrl: "https://picsum.photos/seed/mapodoufu/400/300"
  },
  {
    id: "h4",
    name: "鱼香肉丝",
    category: "甜蜜主菜",
    description: "咸甜酸辣，木耳爽脆，百吃不厌",
    price: 38,
    imageUrl: "https://picsum.photos/seed/yuxiangrousi/400/300",
    soldOut: true
  },
  
  // ==================== 清爽凉菜 ====================
  {
    id: "c1",
    name: "刀拍黄瓜",
    category: "清爽凉菜",
    description: "清脆爽口，蒜香浓郁，解腻佳品",
    price: 18,
    imageUrl: "https://picsum.photos/seed/daopaihuanggua/400/300"
  },
  {
    id: "c2",
    name: "夫妻肺片",
    category: "清爽凉菜",
    description: "麻辣红油，肉质劲道，风味独特",
    price: 56,
    imageUrl: "https://picsum.photos/seed/fuqifeipian/400/300"
  },
  {
    id: "c3",
    name: "川味口水鸡",
    category: "清爽凉菜",
    description: "麻辣鲜香嫩爽，红油色泽诱人",
    price: 48,
    imageUrl: "https://picsum.photos/seed/koushuiji/400/300"
  },
  
  // ==================== 暖心主食 ====================
  {
    id: "s1",
    name: "扬州炒饭",
    category: "暖心主食",
    description: "粒粒分明，配料丰富，香气四溢",
    price: 28,
    imageUrl: "https://picsum.photos/seed/yangzhouchaofan/400/300"
  },
  {
    id: "s2",
    name: "老北京炸酱面",
    category: "暖心主食",
    description: "手工面条，秘制肉酱，菜码丰富",
    price: 26,
    imageUrl: "https://picsum.photos/seed/zhajiangmian/400/300"
  },
  {
    id: "s3",
    name: "阳春面",
    category: "暖心主食",
    description: "清汤挂面，葱香扑鼻，暖胃舒心",
    price: 15,
    imageUrl: "https://picsum.photos/seed/yangchunmian/400/300"
  },
  
  // ==================== 甜蜜饮品 ====================
  {
    id: "d1",
    name: "冰镇酸梅汤",
    category: "甜蜜饮品",
    description: "古法熬制，生津止渴，解辣神器",
    price: 12,
    imageUrl: "https://picsum.photos/seed/suanmeitang/400/300"
  },
  {
    id: "d2",
    name: "冰峰汽水",
    category: "甜蜜饮品",
    description: "经典橙味汽水，童年回忆",
    price: 6,
    imageUrl: "https://picsum.photos/seed/bingfeng/400/300"
  },
  {
    id: "d3",
    name: "冰镇菊花茶",
    category: "甜蜜饮品",
    description: "清热降火，微甜回甘",
    price: 10,
    imageUrl: "https://picsum.photos/seed/juhuacha/400/300"
  },
  
  // ==================== 小食甜点 ====================
  {
    id: "k1",
    name: "特色生煎包",
    category: "小食甜点",
    description: "底酥皮薄，汤汁丰盈，肉馅鲜美",
    price: 22,
    imageUrl: "https://picsum.photos/seed/shengjianbao/400/300"
  },
  {
    id: "k2",
    name: "香酥春卷",
    category: "小食甜点",
    description: "外皮金黄酥脆，内馅鲜香爽口",
    price: 18,
    imageUrl: "https://picsum.photos/seed/chunjuan/400/300"
  }
];