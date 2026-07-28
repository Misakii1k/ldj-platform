# M5 子里程碑：UI 打磨与 PWA

## 目标

在 M3/M4 功能已完整的基础上，把客户端提升到"可发布"体验：
- 可安装为 PWA（manifest、图标、离线占位）。
- 满足基础可访问性要求（§7.4）。
- 关键交互有即时反馈（复制成功、错误提示、加载状态）。

## 范围

**包含：**
- PWA manifest、应用图标、index.html meta、service worker 注册、离线 fallback 页。
- 可访问性：aria-label、focus-visible、 prefers-reduced-motion、语义化标题。
- UX 打磨：复制成功提示、轻量 toast、表单提交状态、聊天自动聚焦、连接状态机提示优化。

**不包含：**
- 新增游戏玩法或服务器逻辑。
- 性能压测、安全审计、Termux 文档、真实聚会验收（属 M5 其他子任务）。

## 验收标准

1. `npm run build -w @ldj/client` 成功，dist 包含 `manifest.json`、`sw.js`、`offline.html`、图标。
2. Lighthouse PWA 检查：manifest、icons、theme-color、service worker 注册通过。
3. 所有现有 104 个测试无回归。
4. 手动冒烟：启动 dev:server，访问首页，浏览器"安装应用"提示出现；断网刷新显示离线页；复制房间码有成功反馈。
