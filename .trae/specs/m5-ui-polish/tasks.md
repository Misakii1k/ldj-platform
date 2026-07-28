# M5 UI 打磨与 PWA 任务列表

## 任务依赖

- Task 1（spec）→ Task 2-5 可并行准备
- Task 6（验证）依赖 Task 2-5

## 任务

- [ ] Task 1: 创建 PWA 资源（manifest、图标、离线页）
  - 文件：
    - 创建 `packages/client/public/manifest.json`
    - 创建 `packages/client/public/icon.svg`
    - 创建 `packages/client/public/offline.html`
    - 创建 `packages/client/public/sw.js`
  - manifest 内容：
    - `name`: 局域网桌游平台
    - `short_name`: 桌游平台
    - `start_url`: "/"
    - `display`: "standalone"
    - `background_color`: "#f9fafb"
    - `theme_color`: "#4f46e5"
    - `icons`: 192x192、512x512 指向 icon.svg（浏览器支持 SVG 图标）
  - offline.html：最小静态页面，提示"当前离线，请检查网络后刷新"。
  - sw.js：
    - install 时缓存 `/`、`/offline.html`、`/manifest.json`、`/icon.svg`。
    - fetch 优先网络，离线时返回 offline.html（导航请求）。
    - 无需复杂缓存策略，保持零构建依赖。

- [ ] Task 2: 更新 index.html 与 Vite 配置
  - 修改 `packages/client/index.html`：
    - 添加 `<link rel="manifest" href="/manifest.json" />`
    - 添加 `<meta name="theme-color" content="#4f46e5" />`
    - 添加 `<link rel="apple-touch-icon" href="/icon.svg" />`
    - 添加 `<meta name="description" content="谁是卧底局域网联机" />`
  - 修改 `packages/client/vite.config.ts`：
    - `build.copyPublicDir: true`（默认 true，显式保留）
    - 确保 `publicDir: 'public'`
  - 验证：build 后 dist 包含 public 内容。

- [ ] Task 3: 注册 Service Worker
  - 修改 `packages/client/src/main.tsx`：
    - 在 render 后注册 SW：`navigator.serviceWorker.register('/sw.js')`，失败仅 console.warn。
  - 注意开发环境 Vite 也会 serve public/sw.js，注册不应报错。

- [ ] Task 4: 可访问性优化
  - 修改 `packages/client/src/styles.css`：
    - 添加 `:focus-visible` 统一样式（替代默认 outline）。
    - 添加 `@media (prefers-reduced-motion: reduce)`，禁用 pulse 动画、transition。
  - 修改 `packages/client/src/app/ConnectPage.tsx`：
    - 为无文本按钮/图标添加 `aria-label`。
    - 表单输入添加 `aria-invalid={!!error}`、`aria-describedby` 关联错误。
  - 修改 `packages/client/src/room/RoomPage.tsx`：
    - 复制按钮添加 `aria-label="复制房间码"`。
    - 踢人/转让按钮添加 `aria-label`。
    - 聊天输入添加 `aria-label="聊天输入"`。
  - 修改 `packages/client/src/App.tsx`：
    - 各状态屏幕的 `<h1>` 保持语义；loading 页添加 `aria-live="polite"` 区域。

- [ ] Task 5: UX 打磨
  - 新增 `packages/client/src/shared-ui/useToast.ts`：
    - 返回 `{ toasts, showToast }`，支持自动消失。
  - 新增 `packages/client/src/shared-ui/ToastContainer.tsx`：
    - 渲染 toast 列表，支持 role="status" / role="alert"。
  - 修改 `packages/client/src/App.tsx`：
    - 顶层挂载 `<ToastContainer />`。
  - 修改 `packages/client/src/room/RoomPage.tsx`：
    - 复制房间码成功后调用 `showToast('房间码已复制')`。
    - 聊天发送后自动聚焦输入框（使用 ref）。
  - 修改 `packages/client/src/app/ConnectPage.tsx`：
    - 提交错误也使用 toast 展示（与 room 页一致），保留 inline error-banner 用于表单内错误。
    - 输入框自动聚焦（昵称输入）。
  - 修改 `packages/client/src/connection/ConnectionContext.tsx`：
    - 重连/恢复状态增加更友好的提示文案。

- [ ] Task 6: 验证
  - 运行 `npm run typecheck`。
  - 运行 `npm run lint`。
  - 运行 `npm run test`（104 测试）。
  - 运行 `npm run build -w @ldj/client`。
  - 启动 `dev:server`，浏览器访问：
    - DevTools Application → Manifest 显示正确。
    - DevTools Application → Service Workers 已注册。
    - Network 模拟 Offline 后刷新，显示 offline.html。
    - 复制房间码有 toast 提示。
