# 运行期设置面板 + AI 大模型玩家接入：实施计划

状态：进行中（2026-07-29 起）
关联：M5 子任务 5.5

## 背景

两件事合成一次改动：

1. **「添加机器人失败：请求格式有误」** —— 已定位，不是代码缺陷。运行中的服务端进程启动于
   本次改动之前，它加载的库还停在迁移 v2（`room_members` 没有 `is_bot` 列），进程内的 zod
   schema 也没有 `add_bot` 分支，所以整个 payload 在 `ws.ts` 的
   `roomCommandPayloadSchema.safeParse` 处被判格式错误。**重启服务端即可**，迁移 v3 会自动应用。
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

### 为什么大模型的 `fetch` 必须在事务外

`executeOnRoom` / `executeInternal` / `executeCreate` 三条命令执行链的 handler 全是同步函数。
所以 `BotRunner` 拆成三段：`peekSession`（事务外读状态切片）→ `planNextAction`（事务外 async
决策，大模型优先、失败回落 `pickBotAction` 规则策略）→ 同步 handler 落库。

### 模型只做选择题

候选动作由游戏模块枚举，模型只回一个候选 id。这样模型不需要理解出牌合法性，也无法产出非法动作；
超时、格式错误、id 不存在一律回落规则策略。日志只记 choiceId / reason / elapsedMs，不记含身份
和手牌的局势描述。

## 已完成

- `packages/server/src/persistence/migrations.ts` —— 迁移 v4，建 `app_settings` 表（key/value/updated_at）
- `packages/server/src/core/settings.ts` —— 读写与校验；`resolveLlmConfig` / `getLlmSettingsView` /
  `updateLlmSettings`；baseUrl 只允许 http/https，timeoutMs 限 1000–120000
- `packages/server/src/core/game/llmProvider.ts` —— 热生效持有者
- `packages/server/tests/gatewayBot.test.ts` —— 真实 WS 验证 `add_bot`（5 测试）

## 待办

### 服务端接线

1. `gateway/http.ts`
   - `GET /api/settings/llm` → `LlmSettingsView`
   - `PUT /api/settings/llm` → 收 `LlmSettingsPatch`，返回更新后的视图
   - 现在这里是「非 GET/HEAD 一律 405」，需为这条路径放开 PUT
   - `HttpDeps` 扩出设置读写依赖
2. `app.ts` —— 把静态的 `const llm = isLlmEnabled(...) ? new LlmClient(...) : null` 换成
   `LlmProvider`，初值取 `resolveLlmConfig(db, config.llm)`
3. `gateway/ws.ts` —— `llmAvailable` 现在是构造时传入的静态布尔（deps 声明、welcome payload、
   `applyRoomCommand` 三处），改成每次从 provider 读，否则设置改完之后老连接仍以为没配

### 客户端

4. 设置弹层 —— 复用现成的 `SheetDialog`；密钥框只写不回显，已配过就显示「已设置」加一个清空按钮
5. 入口按钮 —— 放 `GameHomePage` 的 `home-header__actions`（「局域网限定」badge 旁边）

### 测试与收尾

6. `settings.ts` 校验分支（baseUrl 协议限制、timeoutMs 边界、密钥清空）+ HTTP 两个端点
7. `npm run ci`（typecheck + lint + test）与 `npm run build`
8. 版本升至 0.4.0 并打包；按逻辑单元 commit
9. README 补一节环境变量与「怎么开 AI 玩家」（现在没有这一节）

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LLM_BASE_URL` | 无 | OpenAI 兼容端点。不设则 AI 玩家不可用，已在房间里的 llm 机器人退化为规则策略 |
| `LLM_API_KEY` | 无 | 端点密钥 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_TIMEOUT_MS` | `20000` | 单次决策超时，范围 1000–120000 |
| `ADMIN_TOKEN` | 无 | 设置写入口令。不设则只有本机能改设置 |

以上都可被设置面板里的值覆盖。
