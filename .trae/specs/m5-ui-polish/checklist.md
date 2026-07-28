# M5 UI 打磨与 PWA 验收清单

- [ ] `packages/client/public/manifest.json` 存在且字段完整
- [ ] `packages/client/public/icon.svg` 存在
- [ ] `packages/client/public/offline.html` 存在
- [ ] `packages/client/public/sw.js` 存在并缓存核心资源
- [ ] `index.html` 包含 manifest、theme-color、apple-touch-icon、description
- [ ] Vite 配置保留 publicDir，build 后 dist 含 public 内容
- [ ] `main.tsx` 注册 service worker，失败不阻断应用
- [ ] `:focus-visible` 统一样式已添加
- [ ] `prefers-reduced-motion` 已禁用脉冲动画与过渡
- [ ] 关键按钮/输入已添加 aria-label / aria-invalid / aria-describedby
- [ ] Toast 组件可显示并自动消失
- [ ] 复制房间码触发 toast 提示
- [ ] 聊天发送后输入框重新聚焦
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test` 104/104 通过
- [ ] `npm run build -w @ldj/client` 成功
- [ ] 启动冒烟：manifest、service worker、离线页均正常
