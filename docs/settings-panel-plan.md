# 运行期设置面板 + AI 大模型玩家接入：实施计划

状态：**全栈已完成**（更新于 2026-07-30）
关联：M5 子任务 5.5

## 进度一览

| # | 事项 | 状态 |
|---|------|------|
| — | 迁移 v4 `app_settings` 表 | ✅ `87d7826` |
| — | `settings.ts` 校验与读写 | ✅ `87d7826` |
| — | `llmProvider.ts` 热生效持有者 | ✅ `87d7826` |
| — | `gatewayBot.test.ts` 真实 WS 验证 `add_bot` | ✅ `87d7826` |
| — | `http.ts` 设置端点 + 鉴权 | ✅ `9da02ab` |
| — | `config.ts` `ADMIN_TOKEN` | ✅ `9da02ab` |
| — | `ws.ts` `llmAvailable` 改动态 | ✅ `9da02ab` |
| — | `botRunner.ts` `llm` 改动态 | ✅ `9da02ab` |
| — | `app.ts` 装配 `LlmProvider` | ✅ `9da02ab` |
| 1 | 客户端 `SettingsSheet.tsx` | ✅ 已完成 |
| 2 | `GameHomePage` 入口按钮（`AI 设置`） | ✅ 已完成 |
| 3 | `settings.test.ts` 校验分支 | ✅ 已完成 |
| 4 | HTTP 端点测试 (`gatewaySettings.test.ts`) | ✅ 已完成 |
| 5 | `npm run typecheck` + `npm run build` | ✅ 已完成 |
| 6 | 版本 0.4.0 并打包 | ✅ 已完成 |
| 7 | README 环境变量与 AI 说明 | ✅ 已完成 |

## 背景

两件事合成一次改动：

1. **「添加机器人失败：请求格式有误」** —— 已定位，不是代码缺陷。运行中的服务端进程启动于
   本次改动之前，它加载的库还停在迁移 v2（`room_members` 没有 `is_bot` 列），进程内的 zod
   schema 也没有 `add_bot` 分支，所以整个 payload 在 `ws.ts` 的
   `roomCommandPayloadSchema.safeParse` 处被判格式错误。**重启服务端即可**，迁移 v3/v4 会自动应用。
   `packages/server/tests/gatewayBot.test.ts` 用真实 WebSocket 连接跑通了 `add_bot` 全链路，
   证明服务端这条路是通的。

2. **设置面板** —— 大模型端点、密钥、模型名、超时目前只能靠环境变量配置。改环境变量要动文件、
   要重启进程，聚会现场没人愿意干这个。

## 设计决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 设置存放位置 | SQLite `app_settings` 表（迁移 v4） | 重启后仍在；与其它状态同一份备份 |
| 环境变量的地位 | 兜底。库里有就用库里的，库里没有就用环境变量 | 部署方可以继续用 `LLM_BASE_URL` 预置，房主也能在网页上临时改 |
| 生效方式 | 热生效，不重启 | `LlmProvider` 持有当前 `LlmClient`，配置变更时换掉实例 |
| 密钥可见性 | 只进不出 | 任何接口只回 `hasApiKey` 布尔，原文永不出库；日志也不记端点与密钥 |
| 传输通道 | HTTP，不走 WS | 设置入口在首页，此时还没有房间连接 |
| 写入鉴权 | 设了 `ADMIN_TOKEN` 就校验它；没设则只放行本机（127.0.0.1/::1） | 局域网里谁都能访问这个端点，改掉端点或塞进别人的密钥花的是服主的钱。默认「只有开服务器那台机器能改」，想在手机上改就设口令 |
| 读取鉴权 | 不设限 | 返回内容不含密钥原文 |
| 请求体上限 | 16 KiB | 设置对象含多个 API 预设，超了直接拒绝而不是攒内存 |

### 为什么 `llmAvailable` 与 `botRunner.llm` 都得是函数

原先两处都是构造时传入的静态值。`WsGateway` 那份静态布尔会让设置改完之后已连着的客户端
一直以为没配大模型；`BotRunner` 在 `planNextAction` 里解构 `deps.llm`，抓住的是构造时那个
客户端引用，热生效根本到不了机器人。两处都改成 `() => T`，每次用时才读。

### 为什么大模型的 `fetch` 必须在事务外

`executeOnRoom` / `executeInternal` / `executeCreate` 三条命令执行链的 handler 全是同步函数。
所以 `BotRunner` 拆成三段：`peekSession`（事务外读状态切片）→ `planNextAction`（事务外 async
决策，大模型优先、失败回落 `pickBotAction` 规则策略）→ 同步 handler 落库。

### 模型只做选择题

候选动作由游戏模块枚举，模型只回一个候选 id。这样模型不需要理解出牌合法性，也无法产出非法动作；
超时、格式错误、id 不存在一律回落规则策略。日志只记 choiceId / reason / elapsedMs，不记含身份
和手牌的局势描述。

## 已完成的改动明细

### `87d7826` 地基

- `packages/server/src/persistence/migrations.ts` —— 迁移 v4，建 `app_settings` 表（key/value/updated_at）
- `packages/server/src/core/settings.ts` —— `resolveLlmConfig` / `getLlmSettingsView` /
  `updateLlmSettings` / `SettingsError`；baseUrl 只允许 http/https，timeoutMs 限 1000–120000，
  模型名 ≤128 字符
- `packages/server/src/core/game/llmProvider.ts` —— 热生效持有者（`current()` / `isAvailable()` /
  `config()` / `update()`）
- `packages/server/tests/gatewayBot.test.ts` —— 真实 WS 验证 `add_bot`（5 测试）

### `9da02ab` 接线

- `gateway/http.ts` —— `GET /api/settings/llm`（含 HEAD）、`PUT /api/settings/llm`；路由放在
  「非 GET/HEAD 一律 405」关卡**之前**，否则 PUT 进不来。新增 `isLocalAddress`、
  `parseLlmSettingsPatch`（白名单键，区分「没传」与「传了 null」）、`readJsonBody`（16 KiB 上限）
- `config.ts` —— `ServerConfig.adminToken` ← `ADMIN_TOKEN`
- `gateway/ws.ts` —— `llmAvailable?: () => boolean`，新增 `#llmAvailable()` 私有方法，
  welcome payload 与 `applyRoomCommand` 两处调用点改为动态读
- `core/game/botRunner.ts` —— `llm?: () => LlmClient | null`
- `app.ts` —— `new LlmProvider(resolveLlmConfig(db, config.llm), logger)` 替换静态客户端；
  写设置时**先落库拿到合并后配置、再换客户端**（顺序反了会在校验失败时留下脏客户端）
- 5 个测试的 `ServerConfig` 字面量补 `adminToken: null`

## 待办

### 1. 客户端设置弹层 `packages/client/src/app/SettingsSheet.tsx`

复用现成的 `SheetDialog`（title / description / onClose / initialFocusRef / children，
自带 Escape 关闭与焦点归还）。CSS 全部现成，不新写样式：
`room-sheet__form` / `room-sheet__field` / `room-sheet__field small` / `room-sheet__error` /
`room-sheet__submit` / `room-sheet__checkbox`。

- 打开时 `GET /api/settings/llm` 填表，参照 `JoinRoomSheet` 里 `/api/rooms` 的 fetch 写法
- 字段：接口地址、密钥、模型名、超时毫秒
- 密钥框只写不回显：`hasApiKey` 为真时显示「已设置」加一个清空按钮；留空提交则不动这一项
- 保存走 `PUT`，成功后 toast 提示（`useToast`）
- 收到 403 时把服务端那句话显示出来，并展开口令输入框（发 `x-admin-token`），
  口令只存 React state，不落 localStorage/sessionStorage

### 2. 入口按钮

`GameHomePage` 的 `home-header__actions`，放在「局域网限定」badge 旁边；
`ActiveSheet` 类型加 `'settings'`。

### 3. `packages/server/tests/settings.test.ts`

- 校验分支：URL 非法、非 http(s)、超时越界（含边界 1000 / 120000）、模型名超长
- 库优先 env 兜底；清空后回落 env
- `getLlmSettingsView` 不漏密钥原文

### 4. HTTP 端点测试

- `GET` 返回体不含密钥
- `PUT` 改完即时生效：新连接的 `welcome.llmAvailable` 跟着变
- 非本机且未设口令 → 403；设了口令但没带/带错 → 403
- 坏 JSON → 400；超大 body → 413；未知键 → 400

### 5–7. 收尾

`npm run ci`（typecheck + lint + test）与 `npm run build`；版本 0.3.0 → 0.4.0（含 lockfile）；
README 补环境变量表与「怎么开 AI 玩家」。按逻辑单元 commit。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LLM_BASE_URL` | 无 | OpenAI 兼容端点。不设则 AI 玩家不可用，已在房间里的 llm 机器人退化为规则策略 |
| `LLM_API_KEY` | 无 | 端点密钥 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_TIMEOUT_MS` | `20000` | 单次决策超时，范围 1000–120000 |
| `ADMIN_TOKEN` | 无 | 设置写入口令。不设则只有本机能改设置 |

以上都可被设置面板里的值覆盖。

## 两个已知限制（需在 UI 文案里说清）

**清空 ≠ 关闭。** 按「库里没有就用环境变量兜底」的规则，在面板里清空 baseUrl 或密钥，会回落到
环境变量里的值，而不是变成空。如果部署时设了 `LLM_BASE_URL`，面板上关不掉 AI 玩家。
UI 文案写「清空（回到启动配置）」而不是「删除」。

**手机上默认改不了设置。** 没设 `ADMIN_TOKEN` 时只放行 127.0.0.1，手机访问会拿 403。
开发时 vite 代理过来的请求算本机，所以本地开发无感；真机聚会要在手机上改就得设口令。
