# M5 子任务 5.5 收尾：设置面板客户端 + 测试 + 发布

## Why

服务端设置面板地基（`87d7826`）与接线（`9da02ab`）已落地并提交，HTTP 端点 `GET/PUT /api/settings/llm`、`LlmProvider` 热生效、动态读取均已通过 `gatewayBot.test.ts` 真实 WS 验证。

但客户端收尾卡在三处：

1. `packages/client/src/app/SettingsSheet.tsx` 已新建，但中文全部损坏为 "?"（编码错误），文件不可用。
2. `packages/server/tests/settings.test.ts` 与 HTTP 端点测试缺失，校验分支与鉴权分支未覆盖。
3. 版本号仍是 0.3.0，README 未补环境变量表与「怎么开 AI 玩家」说明。

不补齐这三处，M5 子任务 5.5 无法收尾，0.4.0 无法发布。

## What Changes

- **重写** `packages/client/src/app/SettingsSheet.tsx`：修复中文乱码，复用 `SheetDialog` + 现有 CSS，按 [docs/settings-panel-plan.md](../../../docs/settings-panel-plan.md) 「待办 1」实现：
  - 打开时 `GET /api/settings/llm` 填表
  - 密钥只写不回显（`hasApiKey` 为 true 时显示"已设置"占位符 + 清空按钮）
  - 保存 `PUT`，成功 toast，403 弹出 admin token 输入框
  - 口令只存 React state，不落 localStorage/sessionStorage
- **保留**当前工作区两处已正确的改动：
  - `GameHomePage.tsx`：`ActiveSheet` 加 `'settings'`，渲染 `<SettingsSheet>`
  - `http.ts`：`readJsonBody` 的 `tooLarge` 标志位修复（避免 `req.destroy()` 同时关闭 socket 导致 413 响应到不了客户端）
- **新增** `packages/server/tests/settings.test.ts`：覆盖 `settings.ts` 全部校验分支
- **新增** HTTP 端点测试到 `packages/server/tests/gateway.test.ts` 或新文件 `gatewaySettings.test.ts`：覆盖 `GET/PUT /api/settings/llm`
- **升级** 版本号 0.3.0 → 0.4.0（`package.json` 与 `package-lock.json`）
- **补全** `README.md`：环境变量表 + 「怎么开 AI 玩家」章节

## Impact

- **Affected specs**：M5 子任务 5.5（机器人陪练 + AI 大模型玩家 + 运行期设置面板）
- **Affected code**：
  - 客户端：`packages/client/src/app/SettingsSheet.tsx`（重写）
  - 服务端测试：`packages/server/tests/settings.test.ts`（新增）、HTTP 端点测试（新增）
  - 项目根：`package.json`、`package-lock.json`、`README.md`
- **不受影响**：游戏逻辑、持久化恢复、PWA、机器人服务端管道（已提交完成）
- **依赖**：无前置依赖，可独立推进；与 `m5-termux-docs`、`m5-perf-security` 可并行

## ADDED Requirements

### Requirement: 客户端设置弹层可用

系统 SHALL 在首页提供"AI 设置"入口按钮，打开后展示当前 LLM 配置，允许房主修改 baseUrl / apiKey / model / timeoutMs。

#### Scenario: 打开弹层读取当前配置

- **WHEN** 用户点击首页"AI 设置"按钮
- **THEN** 弹层显示 `baseUrl`、`model`、`timeoutMs` 当前值；`hasApiKey` 为 true 时密钥输入框占位符为"已设置，留空保持不变"

#### Scenario: 密钥只写不回显

- **WHEN** 后端返回 `hasApiKey: true`
- **THEN** 密钥输入框 type=password、留空、占位符为"已设置，留空保持不变"；任何接口都不返回密钥原文

#### Scenario: 清空密钥

- **WHEN** 用户点击"清空已设置密钥"按钮
- **THEN** 提交时 `apiKey` 字段为 `null`；UI 提示"清空（回到启动配置）"，不写"删除"

#### Scenario: 403 需要口令

- **WHEN** 服务端对 `PUT` 返回 403
- **THEN** 弹出 admin token 输入框，再次提交时请求头带 `x-admin-token`；口令只存 React state，不落 localStorage/sessionStorage

#### Scenario: 保存成功

- **WHEN** `PUT` 返回 200
- **THEN** 用返回的视图刷新表单，清空密钥输入框，toast 提示"AI 设置已更新"

### Requirement: 设置校验测试覆盖

系统 SHALL 通过自动化测试覆盖 `packages/server/src/core/settings.ts` 的所有校验分支与库/env 优先级。

#### Scenario: URL 非法或非 http(s)

- **WHEN** `updateLlmSettings` 的 `patch.baseUrl` 不是合法 URL 或协议非 http/https
- **THEN** 抛出 `SettingsError`

#### Scenario: 超时越界

- **WHEN** `patch.timeoutMs` < 1000 或 > 120000 或非整数
- **THEN** 抛出 `SettingsError`

#### Scenario: 模型名超长

- **WHEN** `patch.model.trim().length > 128`
- **THEN** 抛出 `SettingsError`

#### Scenario: 库优先 env 兜底

- **WHEN** 库中有 `llm.baseUrl` 而 env 也有 `LLM_BASE_URL`
- **THEN** `resolveLlmConfig` 返回库中的值；清空库中的值后回落 env

#### Scenario: 视图不含密钥原文

- **WHEN** 调用 `getLlmSettingsView`
- **THEN** 返回体只含 `hasApiKey: boolean`，不含 `apiKey` 字段

#### Scenario: 清空 baseUrl 回落 env

- **WHEN** `patch.baseUrl = null`
- **THEN** 库中删除该项；`resolveLlmConfig` 返回 env 的 `baseUrl`

### Requirement: HTTP 设置端点测试覆盖

系统 SHALL 通过自动化测试覆盖 `GET/PUT /api/settings/llm` 的所有分支。

#### Scenario: GET 不含密钥原文

- **WHEN** 调用 `GET /api/settings/llm`
- **THEN** 返回体只含 `baseUrl / model / timeoutMs / hasApiKey / fromEnv`，无 `apiKey` 字段

#### Scenario: PUT 改完即时生效

- **WHEN** 调用 `PUT /api/settings/llm` 修改 baseUrl 后建立新 WS 连接
- **THEN** welcome 帧的 `llmAvailable` 反映新配置

#### Scenario: 非本机且未设口令 → 403

- **WHEN** 远端 IP（非 127.x / ::1）调用 `PUT` 且服务端未设 `ADMIN_TOKEN`
- **THEN** 返回 403 + 提示文案

#### Scenario: 设了口令但未带或错带 → 403

- **WHEN** 设了 `ADMIN_TOKEN`，请求头 `x-admin-token` 缺失或不匹配
- **THEN** 返回 403

#### Scenario: 坏 JSON → 400

- **WHEN** `PUT` 请求体不是合法 JSON
- **THEN** 返回 400 + `INVALID_JSON`

#### Scenario: 超大 body → 413

- **WHEN** `PUT` 请求体超过 16 KiB（16 × 1024 bytes）
- **THEN** 返回 413 + `BODY_TOO_LARGE`，且超限后继续排空但不再保留后续字节

#### Scenario: 未知键 → 400

- **WHEN** `PUT` 请求体含 `unknownKey`
- **THEN** 返回 400 + `INVALID_SETTINGS` + 提示「未知设置项」

#### Scenario: 非本机 GET 不受限

- **WHEN** 远端 IP 调用 `GET`
- **THEN** 返回 200（GET 不需要鉴权，因为不含密钥原文）

### Requirement: 版本号升级

系统 SHALL 在完成上述改动后将版本号从 0.3.0 升至 0.4.0。

#### Scenario: package.json 升级

- **WHEN** 完成所有改动
- **THEN** 根 `package.json` 与 `package-lock.json` 中版本字段为 `0.4.0`

### Requirement: README 补环境变量与 AI 玩家说明

系统 SHALL 在 README 补充环境变量表与「怎么开 AI 玩家」章节。

#### Scenario: 环境变量表

- **WHEN** 用户查阅 README
- **THEN** 可看到 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_TIMEOUT_MS / ADMIN_TOKEN` 五项变量、默认值与说明

#### Scenario: 怎么开 AI 玩家

- **WHEN** 用户查阅 README
- **THEN** 可看到「设置环境变量或访问首页 AI 设置入口，填入 OpenAI 兼容端点；不设则只能用规则机器人」的说明

#### Scenario: 两个已知限制

- **WHEN** 用户查阅 README
- **THEN** 可看到「清空 ≠ 关闭（回落 env）」与「手机上默认改不了设置（需设 ADMIN_TOKEN）」两条限制说明

## MODIFIED Requirements

### Requirement: M5 子任务 5.5 完成定义

实现项（客户端设置弹层、settings 校验与 HTTP 端点测试、README 与版本升级）已有产物；但只有当前工作树的全量质量门与必要冒烟均有可复现证据后，才能把 5.5 整体标为完成。2026-08-02 设置专项测试 61/61 通过，不代表全量质量门已绿。

## REMOVED Requirements

无。
