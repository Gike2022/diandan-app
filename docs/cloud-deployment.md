# 免费云端演示部署

方案：Render Free Web Service 同时运行 Express API 和 React 构建产物，Aiven MySQL Free 持久保存业务数据及上传图片。访客使用同一个 HTTPS 网址访问页面和 `/api`，无需自购域名。页面风格和所有现有功能保持相同。

本文件是部署配置与操作说明，不代表部署已经完成。公网网址应以 Render 创建服务后返回并验证的地址为准。

## Aiven 数据库

1. 登录 [Aiven 控制台](https://console.aiven.io)，创建 MySQL 服务，选择 **Free**，确认显示免费且没有绑定银行卡；不要选择付费试用计划。免费套餐的地区以控制台实际可选项为准。
2. 等待服务运行，在 Overview 的 Connection information 找到 Service URI、数据库名及 CA certificate。数据库通常为 `defaultdb`，使用实际显示值。
3. 把完整 `mysql://...` 连接串放入 Render 的 `DATABASE_URL`，CA certificate 的完整 PEM 内容放入 `DATABASE_SSL_CA`。连接保持 TLS 验证，不能通过关闭证书验证来解决连接失败。
4. 使用全新数据库。云端首次启动会新建 10 张表（含迁移表）、5 个分类、15 道菜品及 admin/demo 账户；不复制本机顾客、地址和订单。

协助部署时可将 URI 填入本机 `.local/deploy/aiven.env` 的 `DATABASE_URL=`，将 CA 下载为 `.local/deploy/aiven-ca.pem`。该目录已被 Git 忽略。不要把真实配置贴进 README、截图、提交记录或公开仓库。

## Render 服务

仓库：<https://github.com/Gike2022/diandan-app>，分支 `main`，Node 24。

根目录 [render.yaml](../render.yaml) 已声明 `plan: free`。可由已连接的 Render 工具创建等价配置，或从 [Blueprint 创建入口](https://dashboard.render.com/blueprint/new?repo=https://github.com/Gike2022/diandan-app) 导入。两种方式选择一种，避免重复创建服务。

| 设置 | 值 |
| --- | --- |
| 服务类型 | Web Service，Node，Free |
| 地区 | Singapore（数据库地区尽量接近） |
| Build Command | `npm ci --include=dev && npm --prefix server ci --include=dev && npm run build && npm run build:api` |
| Start Command | `npm --prefix server run start:cloud` |
| Health Check Path（支持配置时） | `/api/health` |
| NODE_ENV / APP_MODE | `production` / `demo` |
| HOST | `0.0.0.0`，端口使用 Render 注入的 `PORT` |
| SERVE_FRONTEND / FRONTEND_DIRECTORY | `true` / `../dist`（后端工作目录为 `server/`） |
| TRUST_PROXY_HOPS | `1` |
| IMAGE_STORAGE | `mysql` |
| DATABASE_SSL | `true` |
| DATABASE_URL | Aiven 的完整连接串，私密环境变量 |
| DATABASE_SSL_CA | Aiven CA 的完整 PEM 内容，私密环境变量 |
| ENABLE_DEMO_PAYMENTS | `true`，只产生模拟记录 |
| DEMO_ADMIN_PASSWORD | 独立随机密码，Blueprint 自动生成；不要使用仓库公开演示密码 |
| DEMO_CUSTOMER_PASSWORD | `Customer12345!`，公开体验账号 |
| VITE_API_BASE_URL | `/api` |

`RENDER_EXTERNAL_URL` 由 Render 注入并自动加入允许来源。默认付款时限为 900 秒，扫描间隔为 30000 毫秒。普通访客可以自行注册。管理员密码只交给项目所有者，后续可在个人资料中修改；修改环境变量不会覆盖已初始化账号的密码。

`start:cloud` 每次启动先校验并执行新增迁移，再幂等初始化。重复部署不会清空订单、覆盖菜单或重置密码。不要把 `TEST_DATABASE_URL` 配到云端应用库，也不要对线上库运行测试清理脚本。

## 上线验证

- 部署状态 Live，`/api/health` 返回 `status=ok`、`database=mysql`、`paymentMode=demo`。
- 首页与菜单可用；直接打开或刷新 `/login`、`/register`、`/profile`、`/admin` 不出现主机 404。
- 注册、登录、下单、模拟付款、商家接单与状态推进、顾客历史订单可用。
- 商家订单筛选、统计、图片上传及读取、资料修改与改密可用。
- 重启服务后订单与图片仍存在；未知 `/api` 路径继续返回 JSON 404，缺失 JS 不会错误返回页面 HTML。
- 全程使用虚构演示地址和联系电话。

本机回归命令（使用独立测试库，先 API 后浏览器）：

```powershell
npm run typecheck:api
npm run typecheck
npm run test:api
npm run test:e2e
npm run build:api
npm run build
```

## 免费方案的使用边界

Render 免费网站闲置 15 分钟后会休眠，下一位访客首次打开可能等待约一分钟。休眠期间定时任务停止；唤醒后及订单查询、付款时会检查并补取消到期订单，不会允许过期付款。Render 本机文件不持久保存，所以本方案将上传图片存入 MySQL。参见 [Render 免费服务说明](https://render.com/docs/free)。

Aiven MySQL Free 当前提供 1 GB 存储，无信用卡要求和固定到期日；长期无活动可能被暂停，需从控制台恢复。图片应压缩并适量上传，备份需包含 `menu_images`。参见 [Aiven 免费套餐说明](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)。
