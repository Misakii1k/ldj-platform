# M5 子任务 5.2：Termux 部署与运维文档

## Why

M5 发布候选要求交付 Termux 部署文档（[task_plan.md](../../../task_plan.md) 子任务 5.2），让用户能在 Android 手机上启动服务端充当主机。当前文档缺失，仅 [poc/m0/README.md](../../../poc/m0/README.md) 提供了真机 PoC 清单（待用户回填）。

需要一份完整部署文档覆盖：环境安装、首次启动、后台运行、自启动、备份恢复、环境变量配置，使非开发者用户也能按文档操作。

## What Changes

- **新增** `packages/server/docs/termux.md`：Termux 部署完整文档
- **更新** `README.md`：在「部署」段加入指向 `packages/server/docs/termux.md` 的链接

## Impact

- **Affected specs**：M5 子任务 5.2
- **Affected code**：仅新增文档，不动代码
- **依赖**：无前置依赖；与 `m5-settings-finish`、`m5-perf-security` 可并行
- **关联未决项**：DG-01/DG-02（SQLite 驱动 + WebSocket 库冻结）依赖用户在 ARM64 Termux 真机执行 [poc/m0/README.md](../../../poc/m0/README.md) 清单后回填结果；本文档基于当前服务端实现编写，真机 PoC 结果回来后如需调整再补

## ADDED Requirements

### Requirement: Termux 部署文档完整

系统 SHALL 提供 Termux 部署文档，覆盖以下章节：

#### Scenario: 环境安装

- **WHEN** 用户按文档执行
- **THEN** 能在 Termux 中安装 Node.js 24 LTS（`pkg install nodejs-lts` 或对应版本）并验证 `node --version`

#### Scenario: 首次启动

- **WHEN** 用户克隆仓库并按文档执行
- **THEN** 能运行 `npm install`、`npm run build`、`npm run dev:server`，并通过浏览器访问 `http://<手机IP>:8080`

#### Scenario: 后台运行

- **WHEN** 用户关闭 Termux 后
- **THEN** 文档指导使用 `termux-wake-lock` + `nohup` 或 `tmux`/`screen` 让服务端持续运行

#### Scenario: 自启动

- **WHEN** 手机重启后
- **THEN** 文档指导安装 Termux:Boot 应用并配置 `~/.termux/boot/` 启动脚本

#### Scenario: 备份恢复

- **WHEN** 用户按文档执行备份
- **THEN** 能用 `cp data/platform.db data/platform.db.bak` 或 SQLite `VACUUM INTO` 在线备份；重装/换机时复制 `data/` 目录恢复

#### Scenario: 环境变量与端口配置

- **WHEN** 用户查阅文档
- **THEN** 可看到 `PORT / HOST / DATA_DIR / DB_PATH / PUBLIC_BASE_URL / LOG_LEVEL / ALLOWED_ORIGINS / LLM_* / ADMIN_TOKEN` 等变量的用途与示例

#### Scenario: 已知限制说明

- **WHEN** 用户查阅文档
- **THEN** 可看到 Termux 限制说明：长时间运行需 wake-lock、Android 后台杀进程对策、电池优化白名单

## MODIFIED Requirements

### Requirement: README 部署段

在 README 中新增指向 Termux 部署文档的链接，让用户知道有这份文档可用。

## REMOVED Requirements

无。
