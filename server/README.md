# 点餐后端

Express 5、严格 TypeScript、mysql2、MySQL 8.0.16 及以上。当前机器已在 MySQL 9.7 上验证。使用 Node.js 22 及以上。

## 已配置的当前机器

`server/.env` 已连接系统 MySQL 的 3306 端口，应用库为 `order_app`，测试库为 `order_app_test`。已创建专用应用账号，其随机密码只写入 `.env`，root 密码未保存到项目。系统已有数据库未修改。

从项目根目录运行：

```powershell
npm run install:api
npm run db:migrate
npm run db:seed
npm run dev:api
```

API 地址为 `http://127.0.0.1:3001/api`，健康检查路径为 `/health`。后端只监听本机；前端来源在 `CORS_ORIGINS` 中配置。

演示账号由 `db:seed` 显式创建：

| 账号 | 角色 | 初始密码来源 |
| --- | --- | --- |
| admin | 商家管理员 | `.env` 的 `DEMO_ADMIN_PASSWORD` |
| demo | 顾客 | `.env` 的 `DEMO_CUSTOMER_PASSWORD` |

本机使用 `.env.example` 中的演示登录密码。它们仅用于课程演示，与 MySQL 的连接密码无关。再次执行 seed 不会修改已有账号密码、角色或菜品信息。

## 新环境：使用自己的 MySQL

1. 安装 Node.js 和 MySQL，运行 `npm run install:api`。
2. 首次创建 `server/.env`，已有文件保持原值：

```powershell
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

3. 在 MySQL 中建立独立应用库、测试库和专用账号。使用 `mysql -u root -p` 交互输入管理员密码，然后根据实际情况执行：

```sql
CREATE DATABASE order_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE order_app_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'order_app'@'localhost' IDENTIFIED BY '<自行生成的应用密码>';
GRANT ALL PRIVILEGES ON order_app.* TO 'order_app'@'localhost';
GRANT ALL PRIVILEGES ON order_app_test.* TO 'order_app'@'localhost';
```

4. 将 `.env` 的 `DATABASE_URL`、`TEST_DATABASE_URL` 改为实际连接地址，例如 `mysql://order_app:<经过URL编码的密码>@127.0.0.1:3306/order_app`。用户名与密码中的特殊字符需要 URL 编码。
5. 运行 `db:migrate`、`db:seed`、`dev:api`。

数据库迁移需要建表权限；运行时账号权限可以在部署时进一步按实际需求收紧。数据库名只允许字母、数字、下划线。

## 可选：项目独立的本地 MySQL

如果安装了 `mysqld`，但不希望配置系统服务，可以使用可选启动脚本。它只适用于 `.env.example` 的 127.0.0.1:3307/order_app 配置，请勿覆盖当前机器已配置的 `.env`。

```powershell
# 在使用示例配置的新环境中，从项目根目录执行
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev:api
# 停止该项目实例
npm run db:stop
```

数据保存在项目根目录 `.local/mysql/data`，日志为 `.local/mysql/mysql.log`，生成的本地管理凭据保存在 `.local/mysql/admin.json`。整个 `.local/` 均忽略提交。脚本只监听本机 3307，不更改系统服务，不删除已有数据，先启动的实例可重复使用。若 `mysqld` 不在 PATH，在 `.env` 中配置 `MYSQLD_PATH`。

## 迁移和初始化

`migrations/001_initial.sql` 建立 7 张业务表：users、sessions、categories、dishes、orders、order_items、payments；迁移脚本另建 schema_migrations 表，共 8 张表。

`migrations/002_catalog_consistency.sql` 为菜品和分类增加版本，并增加管理新增请求去重表 `catalog_create_requests`，当前共 9 张表（含迁移表）。更新环境先运行 `npm run db:migrate`，再构建并重启 API；不要改写已执行的 001 文件。连接池在新建每条连接时设置会话 UTC，避免本机 MySQL 默认北京时间导致 `updated_at` 超前 8 小时，不更改系统服务或全局时区。

`migrations/003_order_payment_expiry.sql` 增加每笔订单的付款截止时间及扫描索引，已有订单按创建时间加 15 分钟回填，保留原更新时间。升级时先停止 API，再迁移、构建和重新启动，避免旧进程仍按旧表结构下单。

## 未付款自动取消

- `ORDER_PAYMENT_TIMEOUT_SECONDS` 默认 `900`（15 分钟，范围 1–604800 秒），新订单创建时保存截止时间，修改配置不续期旧订单。
- `ORDER_EXPIRY_SWEEP_INTERVAL_MS` 默认 `30000`，API 启动补扫并每 30 秒运行一次，服务关闭时停止任务并等待当前扫描结束。服务停机期间的到期订单在重启后补扫。
- 后台仅取消 `pending_payment + unpaid` 且已经到期的订单，原因“付款超时自动取消”，支付状态仍为 unpaid，不写模拟退款。
- 查询订单时也会补扫；付款取得行锁后再次检查数据库当前 UTC 时间，超过截止时间即提交取消并返回 `409 PAYMENT_EXPIRED`，不受后台扫描间隔影响。
- 无需 MySQL 事件计划、系统计划任务或额外 Redis 服务；API 进程需要运行。多个 API 实例扫描同一库时，条件 UPDATE 保持幂等，不影响已付款订单。

迁移脚本用数据库锁防止同时执行，保存迁移文件的 SHA-256 校验值。已执行的迁移不可直接修改，应新增 SQL 文件。MySQL DDL 隐式提交；迁移失败时请保留日志并修正新迁移，避免对已有应用库进行重置操作。

`seeds/menu.json` 是原有前端 5 个分类、15 道菜品的初始化快照，保留 `h1` 等 ID。初始售罄菜品为 `h4`。后台修改菜单后，重新 seed 保持修改结果。顾客前端现已通过 `/categories` 和 `/menu` 加载数据库中的菜单。

## 测试与构建

```powershell
npm run typecheck:api
npm run test:api
npm run build:api
npm run start:api
```

以上命令从项目根目录执行；在 `server/` 内对应运行 `npm run typecheck`、`npm test`、`npm run build`、`npm start`。

集成测试使用真实 MySQL，不使用内存数据库。测试前会删除 **TEST_DATABASE_URL 指定库** 中的点餐业务记录。测试库名必须以 `_test` 或 `_test_十六进制后缀` 结尾，且不得与应用库同名。当前机器已创建独立测试库。测试可重复执行。

构建输出在 `server/dist/`。构建后的 API 仍从 `server/.env` 读取配置；迁移和初始化命令通过 tsx 执行，需要开发依赖。先在部署阶段安装完整依赖、迁移、初始化和构建，再运行产物。仅部署前端静态文件不会启动后端或 MySQL。

## 图片与账户扩展

菜品图片由 sharp 解码转为 WebP，上传仅允许管理员；默认保存在项目 `.local/uploads/menu`，不随构建清理。`UPLOAD_DIRECTORY` 可指定其他持久目录，相对路径以启动 API 的 `server/` 工作目录为基准。备份数据库时也需备份图片目录，历史订单依赖原文件。图片通过 `/api/uploads/menu/<摘要>.webp` 匿名读取，不能列举目录。上传大小上限 5 MiB，支持 JPG/PNG/静态 WebP，像素数最多 2500 万，最长边处理到 1600px。

本次统计、图片和账户功能复用已有数据库字段，无需新增 SQL 迁移。`npm run install:api` 会安装图片处理依赖。修改个人资料接口只允许昵称、电话；改密验证原密码并事务撤销旧会话，返回新会话，登录也使用用户行锁避免旧密码竞争。统计口径、上传格式、限流和测试说明见 [接口文档](../docs/backend-api.md) 与 [操作说明](../docs/statistics-images-account-guide.md)。

## 支付与权限规则

- 认证使用 `Authorization: Bearer <token>`。令牌有效期 7 天，数据库只保存摘要；退出后立即失效。
- 用户注册不能指定角色。管理员由初始化脚本创建。
- 模拟支付需要 `ENABLE_DEMO_PAYMENTS=true`，返回 `mode: demo`。所有模拟付款和退款保存在 payments 表。
- `NODE_ENV=production` 时禁止启用模拟支付；此阶段尚未接入真实支付渠道。
- 金额用整数分存储；每份包装费固定 50 分，后端根据数据库菜品价格计价。
- 接口规则与完整清单见 [接口文档](../docs/backend-api.md)。
