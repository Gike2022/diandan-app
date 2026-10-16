# 甜蜜小厨点餐系统

面向课程设计和作品演示的单店点餐系统，包含 React 顾客页面、商家工作台、Express 后端和 MySQL 数据库。页面采用粉紫主题、星空背景和圆角卡片。

**在线体验**：[顾客首页](https://diandan-app-gike2022.onrender.com) · [注册账号](https://diandan-app-gike2022.onrender.com/register) · [商家工作台](https://diandan-app-gike2022.onrender.com/admin)

演示顾客账号为 `demo`，初始密码为 `Customer12345!`。云端管理员使用独立私密密码，见 [登录账号说明](登录账号说明.md)。所有付款和退款均为模拟，不会产生真实扣款。

## 功能概览

| 使用者 | 已实现功能 |
| --- | --- |
| 顾客 | 注册登录、菜单与分类浏览、购物车、收货信息、下单、模拟支付、15 分钟未付款自动取消、订单详情与历史、再次购买 |
| 商家 | 分类维护、菜品新增编辑、上下架与售罄、图片上传、按订单号/日期/状态查询、接单与配送完成、拒单模拟退款、新订单提醒、营业统计 |
| 双方 | 昵称与联系电话维护、验证原密码修改密码、退出与会话管理 |

菜单、账户、订单和模拟支付记录保存在 MySQL。浏览器保存购物车、登录令牌和请求恢复信息，订单历史以服务端查询结果为准。

## 技术与部署

| 部分 | 当前方案 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite 5、Tailwind CSS 4、Wouter、TanStack Query |
| 后端 | Node.js、TypeScript、Express 5、mysql2、Zod、sharp |
| 数据库 | MySQL；使用 SQL 迁移管理表结构 |
| 自动化验证 | Node.js 测试运行器、真实 MySQL 集成测试、Playwright |
| 在线部署 | Render 托管前端与后端，Aiven 托管 MySQL；同一 HTTPS 地址提供页面和 API |

云端上传图片保存在 MySQL，重新部署后仍可读取；本机默认使用文件存储。依赖与脚本以 [package.json](package.json) 和 [server/package.json](server/package.json) 为准。

## 本机快速启动

建议使用 Node.js 24，后端最低要求 Node.js 22；MySQL 要求 8.0.16 或以上。新机器先按 [部署说明](部署说明.md) 配置数据库和 `server/.env`，已有配置时保留原文件。

在项目根目录运行：

```powershell
npm ci
npm --prefix server ci
npm run db:migrate
npm run db:seed
```

打开两个终端，工作目录都设为项目根目录：

```powershell
# 终端一：后端
npm run dev:api
```

```powershell
# 终端二：前端
npm run dev
```

访问 [本机首页](http://127.0.0.1:5173)、[商家工作台](http://127.0.0.1:5173/admin) 或 [API 健康检查](http://127.0.0.1:3001/api/health)。Vite 自动将 `/api` 代理到本机 3001 端口。本机账号见 [登录账号说明](登录账号说明.md)。

初始化只为新记录创建演示数据，再次执行不会覆盖已修改的密码、菜单或订单。

## 文档导航

| 文档 | 主要用途 |
| --- | --- |
| [项目介绍](项目介绍.md) | 项目定位、功能、业务流程、技术架构和适用边界 |
| [项目文件分析](项目文件分析.md) | 目录结构、关键文件、数据库迁移与代码阅读顺序 |
| [API 接口说明](API接口说明.md) | 实际接口清单、请求示例、认证、状态和错误处理 |
| [部署说明](部署说明.md) | 本机运行、Render + Aiven 部署、配置、更新与排查 |
| [登录账号说明](登录账号说明.md) | 本机与云端账号、权限和修改密码说明 |

进一步阅读：[后端安装](server/README.md)、[接口细节](docs/backend-api.md)、[前端接入](docs/frontend-integration.md)、[商家操作](docs/merchant-guide.md)、[统计与图片操作](docs/statistics-images-account-guide.md)、[云端部署记录](docs/cloud-deployment.md)。

## 检查与测试

先在 `server/.env` 配置独立的 `TEST_DATABASE_URL`。测试库名须以 `_test` 或 `_test_十六进制后缀` 结尾，且不能与应用库同名。API 和浏览器测试会清理测试库业务数据，须顺序运行。

```powershell
npm run typecheck
npm run typecheck:api
npm run test:api
npx playwright install chromium
npm run test:e2e
npm run build:api
```

前端生产构建使用 `npm run build`，预览命令为 `npm run serve`。浏览器测试自动使用 3002/5174 端口。

2026-10-16 上线验证记录：45 项后端测试、38 项浏览器测试通过；公网已验证注册、下单、模拟支付、商家操作、统计、上传、资料和改密，重新部署后订单与图片仍可读取。详见 [部署记录](docs/cloud-deployment.md)。

## 代码清理记录

2026-10-16 按入口引用检查清理了 49 个闲置源码文件，保留实际使用的 7 个 UI 组件；移除旧菜单常量、无调用的购物车方法、闲置支付二维码及海报、旧静态部署配置和多余字体请求。根目录 `dist/` 改为构建生成并由 Git 忽略，保留数据库迁移、种子数据和旧购物车/API 兼容逻辑。

前端直接运行依赖从 53 个减少为 18 个，锁文件移除 93 个安装包，保留依赖的版本未变化。相同构建条件下，CSS 从 146.19 kB 降为 64.86 kB，减少约 55.6%。

清理后重新通过 45 项后端测试、38 项浏览器测试，以及前后端类型检查和生产构建；额外对照手机/桌面共 30 个页面场景的字体、配色、尺寸和间距，持续动画按基础样式比较。

## 演示范围

当前支持单店演示，尚未接入真实支付、真实配送平台、短信找回密码和多商家入驻。Render 免费服务闲置后会休眠，重新打开可能等待约一分钟，说明见 [Render 免费服务文档](https://render.com/docs/free)。数据库和上传内容需按部署说明备份。

文档更新日期：2026-10-16。
