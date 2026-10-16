# 已实现的点餐 API（第一阶段）

基础地址：`http://127.0.0.1:3001/api`。本文件描述实际实现；原 `API接口说明.md` 下方的大段内容是前期草案。

除图片上传使用图片二进制请求体外，其余写接口使用 JSON。带身份的接口传 `Authorization: Bearer <登录返回的token>`。顾客只能访问本人的订单，管理员可查看全部订单。账号注册固定为顾客，密码要求 8–128 个字符，用户名为 3–32 位小写字母、数字或下划线（输入会转换小写）。

## 接口清单

| 方法 | 路径 | 身份 | 用途 |
| --- | --- | --- | --- |
| GET | /health | 无 | 数据库可用性、支付模式 |
| POST | /auth/register | 无 | 注册并返回 token |
| POST | /auth/login | 无 | 登录并返回 token |
| GET | /auth/me | 登录 | 当前账号 |
| PATCH | /auth/me | 登录 | 修改本人的昵称和联系电话 |
| POST | /auth/password | 登录 | 核验原密码、修改密码并轮换会话 |
| POST | /auth/logout | 登录 | 吊销当前 token，返回 204 |
| GET | /categories | 无 | 启用的分类 |
| GET | /menu | 无 | 启用分类下的上架菜品，包含售罄标记 |
| GET | /menu/:id | 无 | 菜品详情 |
| POST | /orders | 登录 | 事务下单，需要 Idempotency-Key |
| GET | /orders | 登录 | 本人的订单 |
| GET | /orders/:id | 登录 | 本人订单详情；管理员可读取全部 |
| POST | /orders/:id/cancel | 登录 | 取消未付款订单 |
| POST | /orders/:id/demo-payment | 登录 | 模拟付款成功或失败 |
| GET | /admin/categories | 管理员 | 全部分类 |
| POST | /admin/categories | 管理员 | 新建分类 |
| PATCH | /admin/categories/:id | 管理员 | 修改、启停分类 |
| GET | /admin/menu | 管理员 | 全部菜品，含停售菜品 |
| POST | /admin/menu | 管理员 | 新建菜品 |
| PATCH | /admin/menu/:id | 管理员 | 修改菜品、价格、售罄与上架状态 |
| DELETE | /admin/menu/:id | 管理员 | 停售菜品，保留历史引用 |
| GET | /admin/orders | 管理员 | 全部订单 |
| GET | /admin/orders/notifications | 管理员 | 全部已付款待接单订单的轻量快照 |
| GET | /admin/orders/summary | 管理员 | 订单数和已完成金额等全量汇总 |
| PATCH | /admin/orders/:id/status | 管理员 | 接单、配送、完成或拒单 |
| GET | /admin/statistics | 管理员 | 日期范围内的营业指标、每日趋势与热门菜品 |
| POST | /admin/uploads/images | 管理员 | 上传并转换菜品图片 |
| GET | /uploads/menu/:filename | 无 | 读取已上传的 WebP 图片 |

菜单和订单列表均支持 `page`（默认 1）、`pageSize`（默认 20，最大 100）。菜单另支持 `categoryId`、`search`，订单另支持 `status`。返回 `{items, total, page, pageSize}`。分类列表返回 `{categories}`。

### 商家订单查询与提醒

`GET /admin/orders` 另支持 `orderNumber`、`dateFrom`、`dateTo`，可与 `status` 组合使用。订单号支持完整或部分匹配，不区分大小写，最多 40 位字母数字；不支持 SQL 通配符。日期格式为真实的 `YYYY-MM-DD`，支持年份 1000–9998；允许只传一端，开始日不能晚于结束日，非法输入返回 400。日期按照北京时间的**下单时间**计算，包含结束日整天，后端将边界转换为 UTC 并使用 `created_at >= 开始日零点 AND created_at < 结束日次日零点`。分页总数使用相同条件。

例如 `/admin/orders?orderNumber=SK&dateFrom=2026-10-16&dateTo=2026-10-16&status=pending_acceptance&page=1&pageSize=20`。

`GET /admin/orders/notifications` 返回 `{pending: [{id, orderNumber}], total}`，仅包含 `paid` 且 `pending_acceptance` 的订单，不含联系人和地址。一次读取完整待接单队列，无列表筛选和分页参数；顾客付款失败、未付款、已接单或已退款订单不会进入队列。成功付款重试不会产生重复记录。未登录返回 401，顾客返回 403。该接口复用现有表，无需新增数据库迁移。

商家页面独立每 5 秒读取提醒快照，首次成功同步只显示存量数量，后续按 ID 比较并合并提示新增待接单订单；当前标签页按管理员保存上一份快照，切页及刷新不会把同一批订单重复提醒。提醒查询失败时保留快照，恢复后补查仍待接单的新订单。

## 注册与登录

注册体：

```json
{ "username": "student", "password": "Student123!", "displayName": "演示同学", "phone": "13800000000" }
```

登录体：

```json
{ "username": "demo", "password": "Customer12345!" }
```

返回 `{user: {id, username, displayName, phone, role}, token, expiresAt}`。密码哈希不返回给客户端。登录与注册共享每个来源 IP 每 15 分钟 30 次的限额。

注册成功固定为 customer，前端直接采用返回会话自动登录。账号不区分大小写；重复账号返回 `409 USERNAME_TAKEN`，提示更换账号或直接登录。前端 `/register` 额外检查两次输入的密码一致，不把确认密码或角色字段提交给接口。

## 个人资料与修改密码

`PATCH /auth/me` 请求 `{displayName, phone}`。昵称去除首尾空白后为 1–80 字符，电话沿用结算手机号格式，也可传空字符串或 null 清空。返回 `{user}`，仅修改当前登录用户；用户名、角色、用户 ID 等额外字段返回 400。不会修改订单已保存的收货信息。

`POST /auth/password` 请求 `{currentPassword, newPassword}`，均为 8–128 字符，且不能相同。原密码错误返回 `400 INVALID_CURRENT_PASSWORD`，当前会话保持有效；过期会话仍返回 401。确认密码仅由页面校验，不传入接口。成功在同一事务保存 scrypt 新摘要、撤销该用户所有旧会话并创建新会话，返回与登录相同的 `{user, token, expiresAt}`；客户端应立即替换 token。登录和改密均锁定用户行，防止并发旧密码登录在撤销后留下旧会话。修改密码独立限流，每 IP 每 15 分钟最多 10 次，超限返回 429。

## 营业统计

`GET /admin/statistics?dateFrom=2026-10-10&dateTo=2026-10-16`。完全不传参数时默认最近 7 个自然日；自定义时两个日期都必填，最多 92 天，非法日期或倒置区间返回 400。按北京时间下单日期筛选，包含结束日整天。所有聚合在同一事务快照读取。

返回字段：

- `dateFrom/dateTo/generatedAt`：已应用的范围和查询生成时间。
- `summary`：`totalOrders` 总订单数、`completedOrders` 已完成且已付款数量、`revenueCents` 这些完成订单的总金额（含包装费）、`cancelledOrders` 取消数、`refundedCents` 范围内下单订单对应的成功模拟退款金额。
- `daily`：逐日 `{day,totalOrders,completedOrders,revenueCents}`，无订单日期补零。
- `statuses`：全部六种 `{status,count}`，合计等于总订单数。
- `topDishes`：销量前五 `{dishId,name,quantity,amountCents}`，仅计算已完成且已付款订单；金额来自下单明细价格快照，不含包装费，名称使用当前菜品名。排序为销量、销售额降序，再按 ID 保持稳定。

范围指下单订单群组，随后完成或退款会更新该群组的当前统计；不是按支付/退款发生日期划分的现金流水报表。模拟付款失败、未完成订单及已退款订单不计入营业额。各摘要不能直接使用订单明细连接后重复累加订单总额。

## 菜品图片上传

`POST /admin/uploads/images` 需管理员 Bearer token，`Content-Type` 为 `image/jpeg`、`image/png` 或 `image/webp`，请求体直接为文件二进制，最多 5 MiB；不是 multipart 或 JSON。每 IP 每 15 分钟最多 30 次上传。

后端检查文件签名、真实解码格式和像素数，拒绝 SVG、损坏图片、动画和超过 2500 万像素的输入，转换为最长边不超过 1600px 的 WebP，处理后仍限制 5 MiB。成功返回 201 `{imageUrl: "/api/uploads/menu/<64位摘要>.webp", size}`，重复相同内容可复用路径。`IMAGE_STORAGE=filesystem` 原子写入配置目录；`mysql` 按摘要去重写入 `menu_images`，两种模式使用相同接口。

`GET /uploads/menu/<64位摘要>.webp` 可匿名读取，返回 `image/webp`，无效或不存在的文件名返回 404。菜品 `imageUrl` 现在也接受此规范相对地址；任意其他本地相对路径不接受。上传只保存图片，需再保存菜品绑定图片；替换图片不删除旧内容，以便历史订单继续使用原图。部署和备份见 [操作说明](statistics-images-account-guide.md)。图片处理选项参考 [sharp 构造参数](https://sharp.pixelplumbing.com/api-constructor/) 和 [输出说明](https://sharp.pixelplumbing.com/api-output/)。

## 分类与菜品

新建分类：`{name, sortOrder?, isActive?}`。修改分类传其中至少一个字段，停用分类会同时隐藏该分类下的公开菜单，并阻止新订单购买这些菜品。

分类与菜品返回 `version`。PATCH 可传 `expectedVersion`，与数据库当前版本不符时返回 409 `VERSION_CONFLICT`，不覆盖任何字段；成功更新版本加一。商家页面只提交改动字段，并始终附带读取时的版本；快捷售罄和上下架同样带版本。旧接口调用不传版本时仍按字段更新，接入方应使用版本检查防止并发覆盖。

管理新增接口支持 `Idempotency-Key`（格式与下单相同）。同一管理员、资源类型、键和请求内容首次返回 201，重试返回 200，响应包含 `{category/dish, created}`；相同键换内容返回 409 `IDEMPOTENCY_CONFLICT`。请求摘要、资源 ID 与创建操作在同一事务保存到 `catalog_create_requests`。为兼容旧调用，不传键仍可新增；商家页面会在请求前保存键与原始内容，网络结果不明时禁止修改本次内容并复用键重试，刷新后也可恢复。

新建菜品示例：

```json
{
  "categoryId": "main",
  "name": "测试新菜",
  "description": "课程演示菜品",
  "priceCents": 2500,
  "imageUrl": "https://example.com/dish.jpg",
  "soldOut": false,
  "isActive": true,
  "sortOrder": 20
}
```

`priceCents` 为整数分，范围 1–1000000；图片可以为空字符串、HTTP/HTTPS URL 或上传接口返回的规范相对地址。新菜品 ID 由后端生成。PATCH 仅修改传入字段，至少一个字段。`isActive=false` 表示停售，`soldOut=true` 表示展示但不可购买。DELETE 相当于设置 `isActive=false`，可通过 PATCH 重新上架。

返回 `{dish}`，其中保留前端熟悉的 `id/name/category/description/imageUrl/soldOut` 字段，新增 `categoryId/priceCents/isActive/sortOrder`；`price` 为从分换算的元，顾客前端按 `priceCents` 计算预览金额。

## 创建订单

请求头：`Idempotency-Key: course-demo-order-001`。每笔新订单生成一个新键；网络重试使用同一键，格式为 8–128 位字母、数字、下划线或短横线。

```json
{
  "items": [{ "dishId": "h1", "quantity": 2 }, { "dishId": "d2", "quantity": 1 }],
  "name": "张同学",
  "phone": "13800000000",
  "address": "课程演示地址",
  "notes": "少辣",
  "payMethod": "wechat"
}
```

最多 50 种不同菜品，每种 1–99 份，不可重复提交相同 dishId。`payMethod` 可为 `wechat` 或 `alipay`，这里只表示模拟付款方式，不代表真实渠道已接入。前端不能提交价格、总额、状态或用户 ID。

后端读取有效菜单价格，并按每份 50 分计算包装费。例中为菜品小计 14200 分、包装费 150 分、合计 14350 分。总额上限 100000000 分。

首次返回 201 `{created: true, order}`；相同用户、相同键、相同内容的重试返回 200 `{created: false, order}`；相同键换内容返回 409。同一商品数量、收货信息、备注与付款方式共同决定请求是否相同，菜品排列顺序不影响重试判断。

订单详情包含 `id/orderNumber/userId/name/phone/address/notes/payMethod/status/paymentStatus/subtotalCents/packingFeeCents/totalCents/totalItems/cancelReason/createdAt/updatedAt/items/payments`。金额以 `*Cents` 为准；另保留元单位 `total`、日期 `date` 及明细 `price`，便于对接旧前端。

每个明细包含 `dishId/name/imageUrl/unitPriceCents/quantity/lineTotalCents`。名称、图片和价格均为下单快照，后续菜单变更不修改历史订单；再次购买应根据 `dishId` 查询当前菜品和价格。

## 状态与模拟支付

主流程：`pending_payment`（待付款）→ `pending_acceptance`（待接单）→ `preparing`（制作中）→ `delivering`（配送中）→ `completed`（已完成）。

订单新增 `paymentExpiresAt`（付款截止 UTC ISO 时间）和 `serverTime`（查询时的数据库 UTC 时间）。默认截止时间为创建后 900 秒，具体配置见后端说明；同一幂等键重试不会续期。前端使用二者差值和单调计时显示倒计时，不依赖用户设备的系统时钟。

超过付款时限的未付款订单自动变为 cancelled，原因为“付款超时自动取消”，paymentStatus 保持 unpaid，没有退款记录。API 启动和定时扫描执行关闭，查询订单前补扫。付款事务取得行锁后再次判断到期条件，过期时先提交取消，再返回 `409 PAYMENT_EXPIRED`。已付款订单和未到期订单不受影响。截止时间到达后付款被立即拒绝，空闲后台列表最多在下一个扫描周期关闭。

支付状态独立为 `unpaid`、`paid`、`refunded`。订单状态与模拟资金记录在同一事务更新，并对订单加行锁处理并发。

模拟支付请求：`{ "outcome": "success" }` 或 `{ "outcome": "failed" }`。返回 `{mode: "demo", order}`。失败记录留存，订单仍待付款；成功后转待接单。已支付订单重试不会重复记成功付款。取消或退款后的订单不能再次付款。

顾客取消请求：`{ "reason": "计划有变" }`，也可传 `{}` 使用默认原因。仅未付款订单可取消；取消重试返回现有结果。

管理员接单请求：`{ "status": "preparing" }`，后续可依次改为 `delivering`、`completed`。不能跳过阶段或回退，同一目标状态重试返回现有结果。

管理员拒单请求：`{ "status": "cancelled", "reason": "今日打烊" }`。仅已付款待接单订单可拒单，必须填写原因；同一事务写入模拟退款并设为 `refunded`。重复请求不重复退款。返回 `{order}`。

## 错误格式

```json
{ "error": { "code": "DISH_UNAVAILABLE", "message": "菜品 h4 不存在、已停售或已售罄" } }
```

| 状态码 | 常见情况 |
| --- | --- |
| 400 | 参数、JSON、数量或金额限制错误；缺少幂等键 |
| 401 | 未登录、令牌过期、账号密码不正确 |
| 403 | 无商家权限、来源不允许、模拟支付未开启 |
| 404 | 接口或资源不存在；试图读取其他顾客的订单 |
| 409 | 账号重名、菜品不可购买、幂等键内容冲突、非法状态转换 |
| 413 | 请求体超过 100 KB |
| 415 | 写接口请求体不是 application/json |
| 429 | 登录或注册请求过于频繁 |
| 500 | 服务端未预期错误，隐藏 SQL 与堆栈 |
| 503 | 健康检查发现数据库不可用 |

## 已接入的顾客前端

首页读取 `/categories` 和完整分页 `/menu`；购物车使用 React Context 并缓存本地；登录使用 `/auth/login`、`/auth/me` 和 `/auth/logout`。结算页保存幂等键后创建订单，再进入 `/orders/:id` 模拟支付页面；历史记录分页读取 `/orders`，账号之间隔离查询缓存。详情支持继续付款、取消和定期刷新状态。商家页面已通过 `/admin/*` 接入菜品、分类、订单和状态操作。使用和验证步骤见 [前端接入说明](frontend-integration.md) 和 [商家指南](merchant-guide.md)。

同一浏览器来源下的标签页共享购物车 revision，新订单键为 `checkout-<revision>`；改动购物车产生新 revision。同一购物车的并发提交因此会由服务端幂等处理：相同内容返回同一订单，收货等内容不同返回冲突，不另建订单。跨标签页存储同步和消费标记避免重复扣除后续新加的菜品。

数据库连接池同时设置 mysql2 `timezone=Z` 和每条 MySQL 会话的 `time_zone=+00:00`，确保创建时间、自动更新时间与 API ISO 时间一致；不修改 MySQL 全局时区。
