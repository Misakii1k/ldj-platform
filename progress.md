# 会话进度日志

## 2026-07-26 会话 1：SPEC 审查 + 项目初始化 + M0 PoC

- 审查桌面 SPEC-v1.1-optimized.md，发现 8 处边界缺口，全部补入原文并新增附录 D。
- 建立 D:\项目：task_plan.md / findings.md / progress.md / README.md。
- 编写 poc/m0：sqlite-poc.mjs、ws-poc.mjs、package.json、README.md（Termux 真机清单）。
- 本机 PoC 结果（Windows / Node 24.13.1 / SQLite 3.51.2）：
  - sqlite-poc：11 项全部通过（WAL、外键、千行事务、回滚、崩溃重开、在线 backup()、
    VACUUM INTO、完整性检查）；单行事务延迟 avg 4.41ms / p95 4.72ms。
  - ws-poc：20 并发连接 × 10 消息回显 200 条，优雅关闭并释放端口。
  - 修正一处脚本错误：在线备份应使用模块级 `backup(db, path)` 而非 `db.backup()`。
- Phase 0 剩余：用户在 ARM64 Termux 真机执行 poc/m0/README.md 清单 → 冻结 DG-01/DG-02。
- 下一步：Phase 1（M1 工程骨架），不依赖真机结果可先行。

## 2026-07-26 会话 2：M1 工程骨架

- 建立规格基线提交，创建 `codex/r1-mvp` 分支与独立 worktree。
- 初始化四个 npm workspace、TypeScript 严格模式、ESLint、Vitest、Playwright 与三平台 CI。
- 完成协议 v1 严格 schema、17 个稳定错误码及 GameModule 公共契约。
- 完成 SQLite 薄边界、顺序迁移、十张逻辑表、房间串行队列、幂等回执与 `roomSeq`。
- 完成 HTTP/WS 网关、健康/诊断接口、Origin 校验、安全头、日志脱敏、地址与二维码输出、优雅关闭。
- 完成暖色聚会风移动客户端骨架、连接状态、Undercover 安全共享边界与基础 manifest。
- 验证：类型检查、lint、35 项单测、2 项集成测试、生产构建、生产冒烟全部通过；320px 浏览器检查 0 error/0 warning。
- 生成版本 `0.1.0` 预构建包 `artifacts/lan-party-platform-v0.1.0.zip`。
- 下一步：用户按 `poc/m0/README.md` 回填 Termux 结果，同时开始 M2 房间闭环；持久化主体冻结前关闭 DG-01/DG-02。

## 2026-07-26 会话 3：M2 alpha 基础切片

- 完成昵称 NFC/Unicode 边界、scrypt 密码、五位房间码、32 字节恢复令牌及 SHA-256 持久化摘要等安全原语。
- 完成连接接管、席位保留、房主转让、玩家/观战容量与权限的纯领域策略及边界测试。
- 完成创建/加入/恢复客户端大厅、严格 envelope 构造、本地凭证容错、指数退避重连和 320px 可操作布局。
- 并行安全复核发现并修复协议 JSON 污染边界、未配对 UTF-16 surrogate、陈旧房主计时器、会话接管身份绑定，以及客户端重同步/会话替换竞态。
- 版本统一为 `0.2.0-alpha.1`；服务端运行时版本读取 package 元数据；`ws` 升级到 8.21.1 后生产依赖审计为 0。
- 验证：根级 lint/typecheck、120 项单元测试、2 项集成测试、四 workspace 构建、生产冒烟与浏览器秘密扫描全部通过。
- Playwright 320px 实测创建/加入两态；修复装饰元素导致的 11px 横向溢出后，`scrollWidth=320`，控制台 0 error/0 warning；截图保存在忽略目录 `output/playwright/`。
- 生成 `artifacts/lan-party-platform-v0.2.0-alpha.1.zip`（150 个条目）；在全新临时目录以 `npm ci --omit=dev --ignore-scripts` 安装并启动，readiness、首页及诊断版本均通过，随后释放端口并删除临时目录。
- 本批仍是 M2 基础能力，不含 SQLite 房间仓储和持久化命令路由；该主体继续等待 ARM64 Termux M0 结果冻结 DG-01/DG-02。
