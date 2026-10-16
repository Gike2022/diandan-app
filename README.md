# 甜蜜小厨点餐系统

用于课程设计和作品演示的单店点餐系统。

## 已完成功能

- 顾客前端：React + TypeScript + Vite，保留原有粉紫主题、星空背景和移动端页面风格。
- 后端：`server/` 中的 Node.js + TypeScript + Express 服务，使用真实 MySQL 持久化。
- 顾客页面已连接真实接口：注册、自动登录、登录与退出、动态菜单、购物车恢复、下单、模拟付款、订单详情与历史订单查询。
- 支持待付款订单继续付款、取消订单和按最新菜单再来一单。
- 未付款订单默认 15 分钟后自动取消，详情显示倒计时；后台持续扫描，付款接口也会检查截止时间。
- 商家工作台：菜品新增编辑、售罄与上下架、分类维护、接单、配送、完成以及拒单模拟退款，服务端校验管理员权限。
- 商家订单支持按完整/部分订单号、北京时间下单日期及状态组合查询；整个工作台每 5 秒检查新付款订单，显示待接单数量和去重提醒。
- 营业统计：按北京时间下单日期查看营业额、单量、每日趋势、订单状态、模拟退款和热门菜品。
- 菜品图片支持本机 JPG/PNG/WebP 上传、预览和保存，单张最多 5 MB；原有图片地址仍可使用。
- 顾客和管理员均可维护昵称、联系电话并验证原密码修改密码，成功后撤销旧会话，当前页面继续登录。
- 支付接口仅供模拟演示，所有支付记录的 provider 为 `demo`。

## 本机启动

本机数据库连接已配置在被 Git 忽略的 `server/.env`，使用独立的点餐账号，不使用 MySQL root 账号运行 API。

```powershell
# 项目根目录 D:\Project-My\laojiegang-order-app
npm run install:api
npm run db:migrate
npm run db:seed
npm run dev:api
```

API 健康检查：<http://127.0.0.1:3001/api/health>。

另开一个终端启动前端：

```powershell
npm install
npm run dev
```

打开 [点餐首页](http://127.0.0.1:5173)，使用演示顾客账号 `demo`、密码 `Customer12345!` 登录。手机号、联系人和地址可在结算时填写；下单后在详情页选择模拟付款成功或失败，不会发生真实扣款。

也可从登录页点击“注册账号”，或打开 [注册页](http://127.0.0.1:5173/register)。填写账号、昵称、可选联系电话及两次密码，成功后自动登录并保留购物车；从结算进入注册会自动回到结算。

商家打开 [商家工作台](http://127.0.0.1:5173/admin)，使用管理员账号 `admin`、密码 `Admin12345!` 登录。管理员也可从点餐首页左上角进入工作台；普通顾客账号无法访问管理页面。

开发时 `/api` 自动代理到本机 3001 端口。前端可选配置见根目录 `.env.example`；数据库配置仍只保存在 `server/.env`。

## 文档与验证

- [后端安装、数据库与运行说明](server/README.md)
- [前端使用、配置与端到端验证](docs/frontend-integration.md)
- [商家页面使用和流程演示](docs/merchant-guide.md)
- [营业统计、图片上传与个人资料操作](docs/statistics-images-account-guide.md)
- [网站演示登录账号](登录账号说明.md)
- [免费云端部署：Render 网站与 Aiven MySQL](docs/cloud-deployment.md)
- [已实现接口、请求格式与业务规则](docs/backend-api.md)
- [可在 REST Client 中运行的请求示例](server/requests.http)
- [数据库 SQL 迁移](server/migrations/001_initial.sql)
- [第一阶段设计](docs/superpowers/specs/2026-10-16-ordering-backend-design.md)

```powershell
npm run typecheck:api
npm run test:api
npm run build:api
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

`test:api` 和 `test:e2e` 需要独立的 `TEST_DATABASE_URL`，会清理测试库内的点餐业务数据，不操作应用数据库。这两组测试请顺序执行。浏览器测试自动启动 3002/5174 测试服务。
