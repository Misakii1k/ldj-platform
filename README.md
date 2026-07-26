# 局域网桌游游戏平台

局域网优先、单机可运行的网页桌游平台。聚会时一台电脑或安卓设备（Termux）充当主机，
其他玩家扫码即玩。首发游戏：谁是卧底。

- **规格基线**：[docs/SPEC.md](docs/SPEC.md)（v1.1 + 实施前补遗）
- **实施计划**：[task_plan.md](task_plan.md)（里程碑 M0–M5）
- **调研记录**：[findings.md](findings.md) · **进度日志**：[progress.md](progress.md)
- **M0 可行性 PoC**：[poc/m0/README.md](poc/m0/README.md)（Termux 真机验证清单）

## 技术栈（MVP）

TypeScript（严格模式）· Node.js ≥ 24 LTS · `node:sqlite` · `ws` · React + Vite · npm workspaces

## 当前状态

Phase 0：SPEC 冻结候选，M0 PoC 进行中。工程骨架（M1）尚未生成。
