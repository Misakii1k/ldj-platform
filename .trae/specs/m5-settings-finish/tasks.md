# M5 设置面板收尾任务列表

## 任务依赖

- Task 1（重写 SettingsSheet）→ Task 5（验证）依赖
- Task 2（settings.test.ts）独立，可与 Task 1 并行
- Task 3（HTTP 端点测试）依赖 Task 2 的辅助函数（如建库/写设置的 helper）
- Task 4（版本 + README）独立，可任意时机
- Task 5（验证）依赖 Task 1–4 全部完成

## 任务

- [x] Task 1: 重写 `packages/client/src/app/SettingsSheet.tsx`
  - 当前文件中文全部损坏为 "?"，必须以 UTF-8 重写
  - 复用 `SheetDialog`（title / description / onClose / initialFocusRef / children）
  - 字段：接口地址（baseUrl，url 类型）、密钥（password，只写不回显）、模型名、超时毫秒（number，min 1000 max 120000）
  - 打开时 `GET /api/settings/llm` 填表
  - 密钥框：`hasApiKey` 为 true 时占位符为"已设置，留空保持不变"；提供"清空已设置密钥"按钮，文案为"清空（回到启动配置）"
  - 保存走 `PUT`，成功 toast（`useToast`），失败展示错误
  - 403 时展开 admin token 输入框（password 类型），再次提交带 `x-admin-token` header；口令只存 React state
  - 复用现有 CSS：`room-sheet__form / __field / __field small / __error / __submit / __checkbox`
  - 参考实现：[docs/settings-panel-plan.md](../../../docs/settings-panel-plan.md) 待办 1

- [x] Task 2: 新增 `packages/server/tests/settings.test.ts`
  - 覆盖 `settings.ts` 全部校验分支：
    - URL 非法（`not-a-url`）→ SettingsError
    - URL 协议非 http(s)（`ftp://x`、`javascript:alert`）→ SettingsError
    - 超时越界：< 1000、> 120000、非整数（1.5、NaN）→ SettingsError
    - 边界值：1000 与 120000 应通过
    - 模型名超长（> 128 字符）→ SettingsError
  - 库/env 优先级：
    - 库有值 → 用库值
    - 库无值 → 回落 env
    - 清空库值（`patch.baseUrl = null`）→ 回落 env
  - `getLlmSettingsView` 不漏密钥原文（无 `apiKey` 字段）
  - `fromEnv` 标志正确：库未写且 env 有值时为 true

- [ ] Task 3: HTTP 端点测试（主要分支已覆盖，远端无口令分支待补）
  - 文件：`packages/server/tests/gatewaySettings.test.ts`（或追加到 `gateway.test.ts`，按现有模式选择）
  - 覆盖 `GET /api/settings/llm`：
    - 返回 200，体不含 `apiKey` 字段
    - HEAD 返回 200，无 body
    - 远端 GET 也能通过（GET 不需要鉴权）
  - 覆盖 `PUT /api/settings/llm`：
    - 本机无口令：成功 200，返回视图
    - 改完后即时生效：新 WS 连接的 welcome.llmAvailable 反映新配置
    - [ ] 非本机 + 未设 ADMIN_TOKEN → 403 + `FORBIDDEN`（现有测试未直接模拟远端 IP）
    - [x] 设了 ADMIN_TOKEN + 未带 / 错带 → 403
    - 设了 ADMIN_TOKEN + 正确带 → 200
    - 坏 JSON → 400 + `INVALID_JSON`
    - 超大 body（> 16 KiB，即 > 16 × 1024 bytes）→ 413 + `BODY_TOO_LARGE`（2026-08-02 单独测试已通过）
    - 未知键 → 400 + `INVALID_SETTINGS`
    - 校验失败（非法 URL）→ 400 + `INVALID_SETTINGS` + 提示文案
  - 复用 `gatewayBot.test.ts` 的真实 HTTP/WS 启动模式

- [x] Task 4: 版本号升级 + README 补充
  - `package.json`：`version: 0.3.0` → `0.4.0`
  - `package-lock.json`：同步根 package 的 version 字段（运行 `npm install` 自动更新）
  - `README.md` 补两节：
    - 「环境变量」表：`LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_TIMEOUT_MS / ADMIN_TOKEN` 五项，含默认值与说明
    - 「怎么开 AI 玩家」段落：设置环境变量或首页 AI 设置入口；不设则只能用规则机器人；两个已知限制（清空≠关闭、手机默认改不了）
  - 更新 README 「当前状态」段：M4 完成 → M5 进行中

- [ ] Task 5: 验证
  - [x] 运行 `npm run typecheck` 通过
  - [x] 运行 `npm run lint` 通过
  - [x] 运行 `npm run test` 全绿：包内测试 365/365、D1 扫描器契约测试 4/4；设置专项测试 61/61 通过
  - [x] 运行 `npm run build -w @ldj/client` 成功
  - [ ] 启动 `dev:server` 冒烟：
    - `GET /api/settings/llm` 返回 200 且不含 apiKey
    - 浏览器打开首页，点击"AI 设置"按钮，弹层显示正常（无乱码）
    - 填入 baseUrl 保存，toast 提示成功
    - 未设 ADMIN_TOKEN 时，从手机访问 `PUT` 返回 403
