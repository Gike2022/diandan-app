# 🔌 甜蜜小厨 - API 接口分析报告

## 📊 项目现状分析

### ⚠️ 重要发现：当前项目**没有真实的后端 API 接口**

你的项目目前是一个**纯前端应用**，所有数据都存储在**浏览器本地**（localStorage），没有与后端服务器进行任何 HTTP 通信。

---

## 🗂️ 当前数据存储方式

### 1. **菜单数据** - 硬编码在前端
**位置**: `src/data/menu.ts`  
**存储方式**: 静态 TypeScript 数组  
**数据类型**: 
```typescript
{
  id: string,
  name: string,
  description: string,
  price: number,
  image: string,
  category: string
}
```

**特点**:
- ✅ 无需网络请求，加载速度快
- ❌ 无法动态更新菜单
- ❌ 所有用户看到的菜单完全相同
- ❌ 修改菜单需要重新部署前端代码

---

### 2. **购物车数据** - 浏览器内存
**位置**: `src/context/CartContext.tsx`  
**存储方式**: React Context + useState  
**生命周期**: 页面刷新后丢失（除非手动实现 localStorage 持久化）

**当前功能**:
- `addToCart(dish)` - 添加菜品到购物车
- `removeFromCart(dishId)` - 从购物车移除菜品
- `updateQuantity(dishId, quantity)` - 更新菜品数量
- `clearCart()` - 清空购物车
- `totalItems` - 计算总数量
- `totalPrice` - 计算总价

**特点**:
- ✅ 响应速度快，无延迟
- ❌ 数据仅存在于当前浏览器
- ❌ 无法跨设备同步
- ❌ 页面刷新后购物车清空

---

### 3. **订单数据** - localStorage
**位置**: `src/pages/orders.tsx`  
**存储方式**: `localStorage.setItem("order_history", JSON.stringify(orders))`  
**数据结构**:
```typescript
{
  id: string,              // 订单ID（时间戳）
  date: string,            // 下单时间（ISO格式）
  items: Array<{           // 订单商品列表
    name: string,
    quantity: number,
    price: number
  }>,
  total: number,           // 订单总价
  name: string,            // 顾客姓名
  address: string,         // 配送地址
  notes: string,           // 订单备注
  payMethod: string        // 支付方式（wechat/alipay）
}
```

**当前功能**:
- `getSavedOrders()` - 从 localStorage 读取订单历史
- `saveOrder(order)` - 保存新订单到 localStorage
- 最多保存 20 条订单记录

**特点**:
- ✅ 数据持久化，刷新页面不丢失
- ❌ 数据仅存在于当前浏览器
- ❌ 无法跨设备查看订单
- ❌ 清除浏览器数据后订单丢失
- ❌ 商家无法看到顾客的订单

---

## 🚫 当前项目缺少的功能

由于没有后端 API，以下功能**无法实现**：

### 1. 商家端功能
- ❌ 商家无法接收顾客订单
- ❌ 商家无法管理菜单（增删改查）
- ❌ 商家无法查看订单统计
- ❌ 商家无法更新订单状态

### 2. 用户端功能
- ❌ 用户无法跨设备查看订单
- ❌ 用户无法实时查看订单状态
- ❌ 用户无法收到订单通知
- ❌ 用户无法进行真实支付

### 3. 数据管理
- ❌ 订单数据无法统一管理
- ❌ 菜单价格无法动态调整
- ❌ 库存无法实时更新
- ❌ 数据无法备份和恢复

---

## 🎯 如果要接入后端，需要哪些 API？

以下是一个完整的点餐系统应该具备的 API 接口设计：

---

## 📋 API 接口设计方案

### 基础配置
```
BASE_URL: https://api.sweetkitchen.com/v1
认证方式: JWT Token (Authorization: Bearer <token>)
数据格式: JSON
```

---

## 1️⃣ 菜单相关 API

### 1.1 获取菜单列表
```http
GET /menu
```

**请求参数**:
```typescript
{
  category?: string,  // 可选，筛选分类
  page?: number,      // 可选，分页页码
  limit?: number      // 可选，每页数量
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "dish_001",
        "name": "心心相印双人套餐",
        "description": "浪漫双人份，含主菜+甜品+饮品",
        "price": 128.00,
        "image": "https://cdn.example.com/dish_001.jpg",
        "category": "浪漫主菜",
        "stock": 50,
        "isAvailable": true,
        "tags": ["热销", "推荐"]
      }
    ],
    "total": 16,
    "page": 1,
    "limit": 20
  }
}
```

**使用场景**: 首页加载菜单列表

---

### 1.2 获取单个菜品详情
```http
GET /menu/:dishId
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "dish_001",
    "name": "心心相印双人套餐",
    "description": "浪漫双人份，含主菜+甜品+饮品",
    "price": 128.00,
    "image": "https://cdn.example.com/dish_001.jpg",
    "category": "浪漫主菜",
    "stock": 50,
    "isAvailable": true,
    "tags": ["热销", "推荐"],
    "ingredients": ["牛排", "意面", "沙拉"],
    "allergens": ["麸质", "乳制品"],
    "calories": 850
  }
}
```

**使用场景**: 查看菜品详情页

---

## 2️⃣ 购物车相关 API

### 2.1 获取购物车
```http
GET /cart
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "cart_item_001",
        "dishId": "dish_001",
        "name": "心心相印双人套餐",
        "price": 128.00,
        "quantity": 2,
        "image": "https://cdn.example.com/dish_001.jpg"
      }
    ],
    "totalItems": 2,
    "totalPrice": 256.00
  }
}
```

**使用场景**: 页面加载时同步购物车

---

### 2.2 添加商品到购物车
```http
POST /cart/add
```

**请求体**:
```json
{
  "dishId": "dish_001",
  "quantity": 1
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "添加成功",
  "data": {
    "cartItemId": "cart_item_001",
    "totalItems": 3,
    "totalPrice": 384.00
  }
}
```

**使用场景**: 点击"加入购物车"按钮

---

### 2.3 更新购物车商品数量
```http
PUT /cart/:cartItemId
```

**请求体**:
```json
{
  "quantity": 3
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "更新成功",
  "data": {
    "totalItems": 5,
    "totalPrice": 512.00
  }
}
```

**使用场景**: 购物车页面修改数量

---

### 2.4 删除购物车商品
```http
DELETE /cart/:cartItemId
```

**响应示例**:
```json
{
  "code": 200,
  "message": "删除成功",
  "data": {
    "totalItems": 2,
    "totalPrice": 256.00
  }
}
```

**使用场景**: 购物车页面删除商品

---

### 2.5 清空购物车
```http
DELETE /cart/clear
```

**响应示例**:
```json
{
  "code": 200,
  "message": "购物车已清空"
}
```

**使用场景**: 订单提交成功后清空购物车

---

## 3️⃣ 订单相关 API

### 3.1 创建订单
```http
POST /orders
```

**请求体**:
```json
{
  "items": [
    {
      "dishId": "dish_001",
      "quantity": 2,
      "price": 128.00
    }
  ],
  "customerInfo": {
    "name": "张三",
    "phone": "13800138000",
    "address": "北京市朝阳区xx路xx号"
  },
  "notes": "少辣，不加葱",
  "paymentMethod": "wechat",
  "totalAmount": 257.00
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "订单创建成功",
  "data": {
    "orderId": "order_20260421_001",
    "orderNumber": "202604210001",
    "status": "pending",
    "paymentUrl": "https://pay.example.com/qr/xxx",
    "createdAt": "2026-04-21T10:30:00Z"
  }
}
```

**使用场景**: 结算页面提交订单

---

### 3.2 获取订单列表
```http
GET /orders
```

**请求参数**:
```typescript
{
  status?: string,    // 可选，筛选状态
  page?: number,      // 可选，分页页码
  limit?: number      // 可选，每页数量
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "orders": [
      {
        "id": "order_20260421_001",
        "orderNumber": "202604210001",
        "status": "completed",
        "items": [
          {
            "name": "心心相印双人套餐",
            "quantity": 2,
            "price": 128.00
          }
        ],
        "totalAmount": 257.00,
        "customerInfo": {
          "name": "张三",
          "phone": "13800138000",
          "address": "北京市朝阳区xx路xx号"
        },
        "notes": "少辣，不加葱",
        "paymentMethod": "wechat",
        "createdAt": "2026-04-21T10:30:00Z",
        "updatedAt": "2026-04-21T11:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 20
  }
}
```

**使用场景**: 订单历史页面

---

### 3.3 获取订单详情
```http
GET /orders/:orderId
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "order_20260421_001",
    "orderNumber": "202604210001",
    "status": "completed",
    "statusHistory": [
      {
        "status": "pending",
        "timestamp": "2026-04-21T10:30:00Z"
      },
      {
        "status": "confirmed",
        "timestamp": "2026-04-21T10:32:00Z"
      },
      {
        "status": "preparing",
        "timestamp": "2026-04-21T10:35:00Z"
      },
      {
        "status": "completed",
        "timestamp": "2026-04-21T11:00:00Z"
      }
    ],
    "items": [...],
    "totalAmount": 257.00,
    "customerInfo": {...},
    "notes": "少辣，不加葱",
    "paymentMethod": "wechat",
    "createdAt": "2026-04-21T10:30:00Z"
  }
}
```

**使用场景**: 订单详情页面

---

### 3.4 取消订单
```http
POST /orders/:orderId/cancel
```

**请求体**:
```json
{
  "reason": "不想要了"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "订单已取消",
  "data": {
    "orderId": "order_20260421_001",
    "status": "cancelled",
    "refundAmount": 257.00
  }
}
```

**使用场景**: 订单详情页面取消订单

---

## 4️⃣ 支付相关 API

### 4.1 创建支付订单
```http
POST /payment/create
```

**请求体**:
```json
{
  "orderId": "order_20260421_001",
  "paymentMethod": "wechat",
  "amount": 257.00
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "支付订单创建成功",
  "data": {
    "paymentId": "pay_001",
    "qrCodeUrl": "https://cdn.example.com/qr/pay_001.png",
    "expireAt": "2026-04-21T10:45:00Z"
  }
}
```

**使用场景**: 结算页面生成支付二维码

---

### 4.2 查询支付状态
```http
GET /payment/:paymentId/status
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "paymentId": "pay_001",
    "status": "paid",
    "paidAt": "2026-04-21T10:35:00Z",
    "amount": 257.00
  }
}
```

**使用场景**: 轮询查询支付是否完成

---

### 4.3 支付回调（Webhook）
```http
POST /payment/webhook
```

**请求体**（由支付平台发送）:
```json
{
  "paymentId": "pay_001",
  "orderId": "order_20260421_001",
  "status": "paid",
  "amount": 257.00,
  "paidAt": "2026-04-21T10:35:00Z",
  "signature": "xxx"
}
```

**使用场景**: 支付平台通知支付结果

---

## 5️⃣ 用户相关 API

### 5.1 用户注册
```http
POST /auth/register
```

**请求体**:
```json
{
  "phone": "13800138000",
  "password": "123456",
  "name": "张三"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "注册成功",
  "data": {
    "userId": "user_001",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 7200
  }
}
```

---

### 5.2 用户登录
```http
POST /auth/login
```

**请求体**:
```json
{
  "phone": "13800138000",
  "password": "123456"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "userId": "user_001",
    "name": "张三",
    "phone": "13800138000",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 7200
  }
}
```

---

### 5.3 获取用户信息
```http
GET /user/profile
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "userId": "user_001",
    "name": "张三",
    "phone": "13800138000",
    "avatar": "https://cdn.example.com/avatar/user_001.jpg",
    "addresses": [
      {
        "id": "addr_001",
        "name": "张三",
        "phone": "13800138000",
        "address": "北京市朝阳区xx路xx号",
        "isDefault": true
      }
    ]
  }
}
```

---

## 6️⃣ 地址管理 API

### 6.1 获取地址列表
```http
GET /addresses
```

### 6.2 添加地址
```http
POST /addresses
```

### 6.3 更新地址
```http
PUT /addresses/:addressId
```

### 6.4 删除地址
```http
DELETE /addresses/:addressId
```

---

## 📊 API 状态码规范

```typescript
200 - 成功
201 - 创建成功
400 - 请求参数错误
401 - 未授权（需要登录）
403 - 禁止访问（权限不足）
404 - 资源不存在
500 - 服务器内部错误
```

---

## 🔧 如何在项目中集成 API？

### 方案一：使用 Axios（推荐）

#### 1. 安装依赖
```bash
npm install axios
```

#### 2. 创建 API 配置文件
**文件**: `src/lib/api.ts`

```typescript
import axios from 'axios';

// 创建 axios 实例
const api = axios.create({
  baseURL: 'https://api.sweetkitchen.com/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器（添加 Token）
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器（统一错误处理）
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期，跳转登录
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

#### 3. 创建 API 服务文件
**文件**: `src/services/menuService.ts`

```typescript
import api from '@/lib/api';

export const menuService = {
  // 获取菜单列表
  getMenuList: (params?: { category?: string }) => {
    return api.get('/menu', { params });
  },

  // 获取菜品详情
  getDishDetail: (dishId: string) => {
    return api.get(`/menu/${dishId}`);
  }
};
```

**文件**: `src/services/orderService.ts`

```typescript
import api from '@/lib/api';

export const orderService = {
  // 创建订单
  createOrder: (data: any) => {
    return api.post('/orders', data);
  },

  // 获取订单列表
  getOrderList: (params?: { page?: number; limit?: number }) => {
    return api.get('/orders', { params });
  },

  // 获取订单详情
  getOrderDetail: (orderId: string) => {
    return api.get(`/orders/${orderId}`);
  },

  // 取消订单
  cancelOrder: (orderId: string, reason: string) => {
    return api.post(`/orders/${orderId}/cancel`, { reason });
  }
};
```

#### 4. 在组件中使用（配合 React Query）

**文件**: `src/pages/home.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { menuService } from '@/services/menuService';

export default function Home() {
  // 使用 React Query 获取菜单数据
  const { data, isLoading, error } = useQuery({
    queryKey: ['menu'],
    queryFn: () => menuService.getMenuList()
  });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>加载失败</div>;

  return (
    <div>
      {data?.data?.items.map(dish => (
        <div key={dish.id}>{dish.name}</div>
      ))}
    </div>
  );
}
```

---

### 方案二：使用原生 Fetch

**文件**: `src/lib/fetch.ts`

```typescript
const BASE_URL = 'https://api.sweetkitchen.com/v1';

async function request(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: (url: string) => request(url),
  post: (url: string, data: any) => request(url, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  put: (url: string, data: any) => request(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (url: string) => request(url, { method: 'DELETE' })
};
```

---

## 📝 总结

### 当前状态
- ❌ **没有任何后端 API 接口**
- ✅ 所有数据存储在前端（localStorage + 内存）
- ✅ 适合作为原型演示或学习项目

### 如果要上线运营
你需要：
1. ✅ 开发完整的后端 API（Node.js / Python / Java 等）
2. ✅ 集成真实的支付接口（微信支付 / 支付宝）
3. ✅ 实现用户认证系统（JWT / Session）
4. ✅ 部署数据库（MySQL / PostgreSQL / MongoDB）
5. ✅ 实现订单推送通知（WebSocket / 轮询）
6. ✅ 添加商家管理后台

### 推荐技术栈
**后端**: Node.js + Express + TypeScript  
**数据库**: PostgreSQL + Prisma ORM  
**认证**: JWT + bcrypt  
**支付**: 微信支付 SDK + 支付宝 SDK  
**部署**: Docker + Nginx + PM2

---

**文档生成时间**: 2026-04-21  
**分析者**: Kiro AI Assistant
