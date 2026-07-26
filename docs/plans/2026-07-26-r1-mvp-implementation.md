# 局域网桌游平台 R1 MVP Implementation Plan

> **For implementers:** Follow the repository `docs/SPEC.md` and execute this plan milestone by milestone with tests and review checkpoints.

**Goal:** 交付可在局域网和 ARM64 Termux 主机运行、支持 4–12 人连续游玩的“谁是卧底”R1 MVP。

**Architecture:** 单进程模块化单体；所有命令按房间串行，并在 SQLite 原子提交后确认。浏览器只接收按玩家或观战者白名单重建的视角，游戏规则以内核注入时间和种子的纯函数模块实现。

**Tech Stack:** Node.js 24、TypeScript、npm workspaces、React/Vite、WebSocket、Zod、Pino、SQLite、Vitest、fast-check、Playwright。

---

## Milestones

1. M1：workspaces、共享协议、HTTP/WS、迁移、日志、二维码、命令队列和 CI。
2. M2：房间、权限、聊天、观战、重连、序号与幂等。
3. M3：谁是卧底状态机、视角、计时、词库和移动 UI。
4. M4：动作原子提交、启动恢复、过期计时器和进程崩溃测试。
5. M5：安全、性能、兼容性、Termux 文档和预构建 ZIP。

每个功能切片先写失败测试，再实现最小行为、运行相关验证并提交。M0 Termux 结果在 M2
持久化主体前冻结；词库在 M3 发布前人工复核；AC-18～20 需要真实设备和八人聚会验收。
