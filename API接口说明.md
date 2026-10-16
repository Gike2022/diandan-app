# API 接口说明

更新日期：2026-10-16。本文对应 [server/src/app.ts](server/src/app.ts) 中的实际实现，提供接口索引、常用请求和调用规则。字段边界与统计细节见 [详细接口文档](docs/backend-api.md)，可执行请求见 [server/requests.http](server/requests.http)。

## 1. 地址与通用约定

| 环境 | API 基础地址 |
| --- | --- |
| 在线版本 | `https://diandan-app-gike2022.onrender.com/api` |
| 本机后端 | `http://127.0.0.1:3001/api` |
| 本机前端 | 使用相对地址 `/api`，由 Vite 代理至后端 |

下方路径均相对于 API 基础地址。订单 ID 是 UUID，菜品 ID 可能是 `h1` 等资源 ID，不能混用。

- 除退出和图片上传外，写接口使用 `Content-Type: application/json`。
- 登录接口返回的令牌通过 `Authorization: Bearer <token>` 发送，不放在查询参数里。
- 金额字段 `*Cents` 为整数分，例如 `2500` 表示 25 元；订单由后端计价。
- 日期时间返回 UTC ISO 字符串；商家按日期查询与营业统计使用北京时间自然日。
- 成功响应直接返回业务对象，如 `{user, token, expiresAt}`、`{order}`，没有统一的 `code/message/data` 外层。
- 分页列表返回 `{items, total, page, pageSize}`；默认第 1 页、每页 20 条，每页最多 100 条。
- 参数验证失败返回 JSON 错误；未实现的购物车服务、地址簿、真实支付回调不属于当前接口。

## 2. 接口清单

### 公开访问与账号

| 方法 | 路径 | 身份 | 功能 |
| --- | --- | --- | --- |
| GET | /health | 公开 | 数据库连通性和支付模式 |
| POST | /auth/register | 公开 | 注册顾客并返回会话 |
| POST | /auth/login | 公开 | 账号密码登录 |
| GET | /auth/me | 已登录 | 当前账号 |
| PATCH | /auth/me | 已登录 | 修改本人的昵称与电话 |
| POST | /auth/password | 已登录 | 校验原密码、改密并轮换会话 |
| POST | /auth/logout | 已登录 | 吊销当前会话，返回 204 |
| GET | /categories | 公开 | 启用分类 |
| GET | /menu | 公开 | 上架菜单，含售罄标记 |
| GET | /menu/:id | 公开 | 上架菜品详情 |
| GET | /uploads/menu/:filename | 公开 | 上传后的 WebP 图片 |

### 顾客订单

| 方法 | 路径 | 身份 | 功能 |
| --- | --- | --- | --- |
| POST | /orders | 已登录 | 幂等下单 |
| GET | /orders | 已登录 | 本人的分页订单 |
| GET | /orders/:id | 已登录 | 本人订单详情；管理员可读取全部 |
| POST | /orders/:id/cancel | 已登录 | 取消本人的未付款订单 |
| POST | /orders/:id/demo-payment | 已登录 | 对本人订单执行模拟付款 |

### 商家管理

以下接口均要求管理员令牌。

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | /admin/categories | 全部分类 |
| POST | /admin/categories | 新增分类 |
| PATCH | /admin/categories/:id | 修改分类名称、排序及启用状态 |
| GET | /admin/menu | 全部菜品，包含停售菜品 |
| POST | /admin/menu | 新增菜品 |
| PATCH | /admin/menu/:id | 编辑菜品、价格、上架与售罄状态 |
| DELETE | /admin/menu/:id | 停售菜品，保留历史引用 |
| GET | /admin/orders | 组合查询全部订单 |
| GET | /admin/orders/summary | 全量订单数与金额汇总 |
| GET | /admin/orders/notifications | 完整待接单提醒快照 |
| PATCH | /admin/orders/:id/status | 接单、配送、完成或拒单 |
| GET | /admin/statistics | 日期范围营业统计 |
| POST | /admin/uploads/images | 上传并转换图片 |

## 3. 注册、登录与会话

注册请求：

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "student01",
  "displayName": "演示同学",
  "phone": "13800000000",
  "password": "Student123!"
}
```

账号为 3–32 位字母、数字或下划线，去除首尾空白并转为小写；昵称为 1–80 字符，电话选填，密码为 8–128 字符。注册返回 201，角色固定为 `customer`；账号重复返回 `409 USERNAME_TAKEN`。

登录请求体：

```json
{
  "username": "demo",
  "password": "Customer12345!"
}
```

注册和登录返回 `{user, token, expiresAt}`。其中 `user` 包含 `id/username/displayName/phone/role`；`token` 是 64 位十六进制随机会话令牌，默认有效期 7 天。数据库只保存令牌摘要，接口不返回密码摘要。

后续请求示例：

```http
GET /api/auth/me
Authorization: Bearer <替换为登录返回的token>
```

修改资料：`PATCH /auth/me`，请求体为：

```json
{
  "displayName": "新的昵称",
  "phone": null
}
```

两个字段都需提交。电话可为有效号码、空字符串或 `null`；后两者用于清空。响应为 `{user}`，不允许修改账号、ID 或角色。

修改密码：`POST /auth/password`，请求体为：

```json
{
  "currentPassword": "Student123!",
  "newPassword": "StudentNew123!"
}
```

新旧密码不能相同。成功后返回新会话，撤销该用户全部旧会话，客户端必须立即替换 token。确认密码只在前端校验，不传给接口。退出使用 `POST /auth/logout`，成功返回 204，无 JSON 响应体。

默认限额：登录与注册共用每 IP 每 15 分钟 30 次，修改密码单独为每 IP 每 15 分钟 10 次。

## 4. 菜单查询与维护

公开菜单支持 `categoryId/search/page/pageSize`，例如：

```http
GET /api/menu?categoryId=main&search=红烧&page=1&pageSize=20
```

分类响应为 `{categories}`；菜单列表使用通用分页结构，详情为 `{dish}`。菜品包括 `id/categoryId/category/name/description/priceCents/price/imageUrl/soldOut/isActive/sortOrder/version`。金额计算使用 `priceCents`。

新增分类请求为 `{name, sortOrder?, isActive?}`。停用分类会隐藏该分类下的公开菜品，并阻止新订单购买。

新增菜品请求示例：

```json
{
  "categoryId": "main",
  "name": "今日新菜",
  "description": "课程演示菜品",
  "priceCents": 2500,
  "imageUrl": "",
  "soldOut": false,
  "isActive": true,
  "sortOrder": 20
}
```

`priceCents` 为 1–1000000 的整数。图片接受空字符串、HTTP/HTTPS 地址或上传接口返回的规范路径。

编辑分类、菜品时使用 PATCH，至少提交一个业务修改字段。建议同时提交查询到的 `expectedVersion`：

```json
{
  "priceCents": 2600,
  "expectedVersion": 1
}
```

版本不一致返回 `409 VERSION_CONFLICT`，重新读取后再编辑。`soldOut=true` 表示仍展示但不可购买，`isActive=false` 表示下架。

新增分类和菜品可传 `Idempotency-Key`：首次返回 201，内容相同的重试返回 200，并带 `created` 标记；相同键换内容返回 409。现有商家页面已使用此能力。

## 5. 创建与查询订单

下单必须携带 `Idempotency-Key`，格式为 8–128 位字母、数字、下划线或短横线。每笔新订单使用新键，同一次请求重试复用原键与原始内容。

```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: demo-order-20261016-001

{
  "items": [{"dishId": "h1", "quantity": 1}],
  "name": "演示顾客",
  "phone": "13800000000",
  "address": "课程演示虚构地址",
  "notes": "少辣",
  "payMethod": "wechat"
}
```

每单 1–50 种不同菜品，每种 1–99 份，相同菜品必须合并数量。`payMethod` 为 `wechat` 或 `alipay`，仅表示模拟付款方式。请求不能提交价格、总额、状态或用户 ID。

后端按有效菜单价格计价，每份包装费 50 分。首次返回 201 `{created: true, order}`；同一用户、键和内容重试返回 200 `{created: false, order}`；相同键换内容返回 `409 IDEMPOTENCY_CONFLICT`。

订单的主要字段：

| 字段 | 含义 |
| --- | --- |
| `id/orderNumber` | 内部 UUID / 展示用订单号 |
| `name/phone/address/notes` | 下单时收货信息快照 |
| `status/paymentStatus/payMethod` | 订单状态、付款状态、模拟方式 |
| `subtotalCents/packingFeeCents/totalCents/totalItems` | 菜品小计、包装费、合计、总份数 |
| `createdAt/updatedAt/paymentExpiresAt/serverTime` | UTC 时间、付款截止时间与服务端当前时间 |
| `cancelReason` | 取消原因，未取消时为 null |
| `items` | 商品名称、图片、单价、数量与明细金额快照 |
| `payments` | 该订单的模拟付款、退款记录 |

顾客列表支持 `status/page/pageSize`。详情返回 `{order}`；读取其他顾客的订单返回 404。

商家列表另支持 `orderNumber/dateFrom/dateTo`，例如：

```http
GET /api/admin/orders?orderNumber=SK&dateFrom=2026-10-16&dateTo=2026-10-16&status=pending_acceptance&page=1&pageSize=20
```

订单号支持不区分大小写的完整或部分匹配，最多 40 位字母数字；日期按北京时间的下单时间筛选，包含结束日整天，可只传一端。开始日不能晚于结束日。

## 6. 模拟支付、取消与订单状态

正常状态顺序：

```text
pending_payment → pending_acceptance → preparing → delivering → completed
待付款            待接单                制作中       配送中        已完成
```

| 操作 | 接口与请求体 | 结果 |
| --- | --- | --- |
| 模拟付款成功 | `POST /orders/:id/demo-payment`，`{"outcome":"success"}` | 待接单，支付状态 paid |
| 模拟付款失败 | 同上，`{"outcome":"failed"}` | 保持待付款，可在期限内重试 |
| 顾客取消 | `POST /orders/:id/cancel`，`{"reason":"计划有变"}` 或 `{}` | 仅未付款订单可取消 |
| 商家接单 | `PATCH /admin/orders/:id/status`，`{"status":"preparing"}` | 进入制作中 |
| 开始配送 | 同上，`{"status":"delivering"}` | 进入配送中 |
| 完成订单 | 同上，`{"status":"completed"}` | 进入已完成 |
| 商家拒单 | 同上，`{"status":"cancelled","reason":"今日打烊"}` | 仅已付款待接单订单可拒单，记录模拟退款 |

模拟支付响应为 `{mode: "demo", order}`，其他状态操作返回 `{order}`。支付状态为 `unpaid/paid/refunded`。付款和退款重试不会重复记成功记录，商家不能跳过阶段或回退。

默认下单后 900 秒到期。到期未付款订单变为 `cancelled`，原因是“付款超时自动取消”，支付状态仍为 unpaid，不生成退款。付款事务取得锁后再次检查截止时间，到期返回 `409 PAYMENT_EXPIRED`。

## 7. 提醒、统计与图片

### 新订单提醒

`GET /admin/orders/notifications` 返回 `{pending: [{id, orderNumber}], total}`，包含全部已付款且待接单订单，不受订单页筛选与分页影响。商家页面每 5 秒读取，首次成功同步作为已有订单基线，之后按 ID 识别新增订单。

### 营业统计

`GET /admin/statistics` 不传参数时默认最近 7 个北京时间自然日；自定义需同时传 `dateFrom/dateTo`，含结束日，最多 92 天。

返回 `dateFrom/dateTo/generatedAt/summary/daily/statuses/topDishes`。营业额为范围内下单、当前已完成且已付款订单的总额，含包装费；热门菜品金额不含包装费。未付款、未完成、已退款订单不计入营业额，统计并非按收款日划分的财务流水。

### 图片上传与读取

管理员向 `POST /admin/uploads/images` 直接发送文件二进制，请求头使用 `image/jpeg`、`image/png` 或 `image/webp`，不是 multipart 或 JSON。单张最多 5 MiB、2500 万像素，不支持 SVG 和动画；每 IP 每 15 分钟最多上传 30 次。

后端转换为最长边不超过 1600px 的 WebP，返回 201：

```json
{
  "imageUrl": "/api/uploads/menu/<64位内容摘要>.webp",
  "size": 12345
}
```

响应中的 `size` 为处理后字节数，示例摘要需替换为实际返回值。上传完成后，还需将 `imageUrl` 保存到菜品。图片通过返回路径匿名读取；云端内容保存在 MySQL，本机默认使用文件存储。

## 8. 错误与客户端处理

错误结构示例：

```json
{
  "error": {
    "code": "PAYMENT_EXPIRED",
    "message": "订单付款已超时"
  }
}
```

文案以实际响应为准；校验错误可能附带 `error.details`，客户端根据 HTTP 状态和 `error.code` 判断。

| HTTP 状态 | 常见情况 |
| --- | --- |
| 400 | 参数、JSON、幂等键、日期或原密码错误 |
| 401 | 未登录、账号密码错误或会话失效 |
| 403 | 无管理员权限、来源不允许或模拟支付未开启 |
| 404 | 资源不存在、无权查看的顾客订单 |
| 409 | 重名、版本冲突、重复键内容变化、菜品不可购买或订单状态冲突 |
| 413 | JSON 超过 100 KB，或图片超过 5 MiB |
| 415 | 请求类型或上传格式不支持 |
| 429 | 登录注册、改密或图片上传触发限流 |
| 500 | 内部错误；不向客户端暴露 SQL 和堆栈 |
| 503 | 健康检查发现数据库不可用 |

前端当前使用原生 Fetch 封装 [src/lib/api.ts](src/lib/api.ts) 和 [src/lib/admin-api.ts](src/lib/admin-api.ts)，默认超时 15 秒。认证失效后重新登录；下单结果不明时保留原请求和幂等键重试，不要立即新建另一个键。
