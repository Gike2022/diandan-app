# 免费云端演示部署

用户要求前端、后端和数据库上线供他人通过网址体验，已明确优先免费资源、尚无服务器或云账号。继续保留 React、Express 和 MySQL，保留所有页面风格与模拟支付。

## 方案与限制

使用 Render Free Web Service 托管 Express 及 React 构建产物，同一 HTTPS 网址提供页面、API 和图片；Aiven MySQL Free 提供独立云库。两个平台均需用户注册并授权，不自动购买付费计划、绑定银行卡或导入本机私人订单。当前账号连接等待用户完成，实际创建资源和公网验证在认证成功后执行。

Render 免费服务闲置会休眠，首次唤醒可能较慢；休眠期间后台扫描不运行，恢复启动及订单查询/付款时补扫到期订单。Aiven 免费库容量 1 GB，适合课程演示。免费额度不是持续可用性承诺，不使用保活任务规避平台限制。

## 部署所需变更

- Express 可配置托管前端 dist 并为页面路由返回 index.html，未知 API 继续返回 JSON 404，静态资源缺失不能回退为 HTML。默认本地开发保持原模式。
- 生产运行显式 APP_MODE=demo 时才允许 ENABLE_DEMO_PAYMENTS=true，正常生产模式继续禁止模拟支付。保留页面已有模拟标识。
- 云数据库连接启用 TLS，验证证书链和主机名，可配置 Aiven CA；拒绝把要求 TLS 的连接串当明文使用。
- 增加 IMAGE_STORAGE=mysql：压缩后的 WebP 按摘要写入新 menu_images 表，避免免费主机重启丢图；原 URL 和文件系统存储模式兼容。新迁移只建表，不修改已执行 SQL。
- Render 代理跳数、CORS 来源和监听地址通过明确配置设置；自带 Render 外部网址加入允许来源。
- 首次启动先运行幂等迁移与种子初始化，再启动服务。只有新云库创建演示菜单与账户；管理员使用云端生成的独立随机密码，访客可注册或使用普通演示账号。
- 提供显式 free 的 render.yaml、Node 版本文件、环境变量模板和操作说明；真实连接串、CA 配置和管理员密码放云端私密环境配置，不提交 GitHub。

## 验证

增加真实 MySQL 图片跨进程持久化、代理与同源路由测试及部署配置校验；跑完整 API、浏览器、类型检查和构建。上线后验证公网 HTTPS、健康检查、菜单、注册登录、下单模拟支付、商家操作、图片和历史记录；验证部署重启后数据保留。没有有效云账号或数据库连接前不声称已上线。

来源：[Render 免费服务](https://render.com/docs/free)、[Render Blueprint](https://render.com/docs/blueprint-spec)、[Aiven MySQL Free](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)。
