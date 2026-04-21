# 部署流程（GitHub + Cloudflare Pages）

本文档说明如何使用 **GitHub** 作为代码托管，并通过 **Cloudflare Pages** 自动构建与部署本项目（Vite + React）。

## 1. 前置条件

- 你拥有：
  - 一个 GitHub 仓库（已推送本项目代码）
  - 一个 Cloudflare 账号
- 本项目构建命令：
  - `npm run build`
- 本项目构建产物目录：
  - `dist/`

> 依据：见 [package.json](package.json) 和 [vite.config.ts](vite.config.ts)。

## 2. 本地构建与自检（可选但推荐）

1) 安装依赖

- `npm install`

2) 类型检查

- `npm run typecheck`

3) 本地开发

- `npm run dev`

4) 本地预览生产构建

- `npm run build`
- `npm run serve`

## 3. Cloudflare Pages 创建项目

1) 登录 Cloudflare Dashboard
2) 进入 **Workers & Pages** → **Pages**
3) 点击 **Create a project** → 选择 **Connect to Git**
4) 授权并选择你的 GitHub 仓库

### 3.1 构建配置（关键）

在 Pages 的项目配置里设置：

- **Framework preset**：Vite（或选择 None 后手动填写）
- **Build command**：`npm run build`
- **Build output directory**：`dist`

Node 版本通常可保持默认；如遇到依赖兼容问题再在 Pages 环境变量里指定 `NODE_VERSION`。

## 4. 环境变量（如需要）

本项目在 [vite.config.ts](vite.config.ts) 中支持：

- `BASE_PATH`：用于设置 Vite `base`（默认为 `/`）
- `PORT`：本地 dev/preview 端口（默认 5173；对 Pages 部署通常无影响）

### 4.1 常见场景：部署到子路径

如果你不是用自定义域名根路径部署，而是类似：

- `https://example.pages.dev/myapp/`

则需要设置：

- `BASE_PATH=/myapp/`

并重新部署。

> 如果你用的是 Pages 默认域名或自定义域名的根路径，一般保持 `BASE_PATH=/` 即可。

## 5. SPA 路由刷新 404 的处理（非常常见）

本项目依赖前端路由（例如 wouter）。在 Cloudflare Pages 上，**直接刷新子路由** 可能出现 404，需要配置回退到 `index.html`。

做法：在 Cloudflare Pages 中添加 `_redirects` 文件。

- 路径：`public/_redirects`
- 内容：
  
  ```
  /* /index.html 200
  ```

说明：
- 这会把所有未知路径回退到 `index.html`，由前端路由接管。

> 如果你希望我直接把该文件加进仓库，请告诉我，我会按项目结构确认是否已有 `public/`，并添加最小改动。

## 6. 自动部署流程（推荐）

完成 Pages 绑定 GitHub 后：

- 推送到默认分支（通常 `main`）会触发 **Production 部署**
- 新开 PR / 分支推送会触发 **Preview 部署**（可用于测试）

建议工作流：

1) 本地开发 → 提交 commit
2) 推送到 GitHub
3) Cloudflare Pages 自动构建
4) 在 Pages 提供的 URL 上验证
5) 合并 PR 后自动发布到 Production

## 7. 发布检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 页面在 Pages URL 能打开
- [ ] 刷新任意路由不 404（若 404，按第 5 节处理）
- [ ] 若有接口/环境变量：在 Pages 里已正确配置

## 8. 回滚方式

Cloudflare Pages 支持基于历史部署回滚：

- Pages 项目 → **Deployments** → 选择一个历史部署 → **Rollback**（或重新部署该 commit）

更常见/可审计的方式：

- 在 GitHub 上 revert 对应 commit / 回滚合并，然后推送到 `main` 触发重新部署。

---

## 项目信息（从仓库读取）

- 构建输出目录：`dist`（见 [vite.config.ts](vite.config.ts)）
- 构建命令：`npm run build`（见 [package.json](package.json)）
