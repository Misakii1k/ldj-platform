# 安全审计报告

**审计日期**：2026-07-29
**审计范围**：M5 发布候选
**审计依据**：SPEC §14.1 安全检查清单
**审计方式**：只读审计（未修改任何代码文件），使用 Grep/Read 工具取证，证据引用形如 `file:line`

> **时点声明**：本报告只描述 **2026-07-29 当时的工作树**，不是 2026-08-02 当前工作树的完整安全复审。报告中的行号和“通过”结论均应按历史证据理解。
>
> **后续变化（2026-08-02 核验）**：`packages/server/src/gateway/http.ts` 当前为 `MAX_BODY_BYTES = 16 * 1024`，设置写入、模型目录和连接诊断 JSON 请求共用 **16 KiB** 上限；`packages/server/tests/gatewaySettings.test.ts` 当前以 `> 16 KiB` 用例验证 413，并在本次单独运行中 30/30 通过。因此，下文记载的 1 KiB 是审计时实现，**不得作为当前事实或当前验收阈值引用**。设置接口此后还有功能与安全改动，当前发布前仍需重新执行完整安全审计。
>
> **复审（2026-08-09）**：针对 2026-08-09 当前工作树（含设置面板/模型目录/连接诊断等新增上游）的完整安全复审已追加于文末「复审（2026-08-09）」章节，结论：10 项全部通过，未发现 P0。

## 总结

| 项 | 结果 | P0 数 |
|---|------|------|
| 1. 输入校验 | 通过 | 0 |
| 2. CORS 与 Origin 校验 | 通过 | 0 |
| 3. 密码哈希 | 通过 | 0 |
| 4. 日志脱敏 | 通过 | 0 |
| 5. WS 鉴权 | 通过 | 0 |
| 6. 限流 | 通过 | 0 |
| 7. SQL 注入 | 通过 | 0 |
| 8. XSS | 通过 | 0 |
| 9. 目录穿越 | 通过 | 0 |
| 10. 错误信息泄漏 | 通过 | 0 |

**历史时点结论**：2026-07-29 当时未发现 P0 缺陷，所有审计项均通过。该结论不自动覆盖后续工作树；详见“备注”中两条当时的非阻塞观察。

---

## 1. 输入校验

### 检查方法
- 检查 `packages/shared/src/protocol/messages.ts` 中 zod schema 是否覆盖所有 WS 消息类型，并是否使用 `.strict()` 拒绝未知字段。
- 审计时检查 `packages/server/src/gateway/http.ts` 中 `readJsonBody` 当时的 1 KiB 上限是否在超限时拒绝；当前阈值已变更为 16 KiB，见文首时点声明。
- 检查 `packages/server/src/config.ts` 中端口、日志级别、LLM 超时是否做范围校验。
- 检查 `packages/server/src/core/settings.ts` 中写入设置（URL、超时、模型名）是否做格式与范围校验。

### 结果
通过

### 证据
- `packages/shared/src/protocol/messages.ts:54-127` — `createRoomPayloadSchema` / `joinRoomPayloadSchema` / `resumeRoomPayloadSchema` / `leaveRoomPayloadSchema` / `roomCommandPayloadSchema` 覆盖所有客户端命令；`chatSendPayloadSchema`（line 130）与 `resyncPayloadSchema`（line 147）齐备。所有 schema 末尾均 `.strict()` 拒绝未知字段。
- `packages/shared/src/protocol/envelope.ts:38-46` — `clientEnvelopeSchema` 严格校验 `v`（协议版本字面量）、`type`（枚举）、`requestId`（1–64 字符）、`payload`。
- 历史证据：`packages/server/src/gateway/http.ts:54` 当时为 `const MAX_BODY_BYTES = 1024;`（1 KiB）；当前实现为 `16 * 1024`（16 KiB），该历史代码摘录已失效。
- `packages/server/src/gateway/http.ts:70-103` — `readJsonBody` 在 `size > MAX_BODY_BYTES` 时置 `tooLarge = true`，`end` 时 reject `BODY_TOO_LARGE`；同时区分 `INVALID_JSON`。
- `packages/server/src/gateway/http.ts:215-218` — 上层捕获 `BODY_TOO_LARGE` → 413、`INVALID_JSON` → 400。
- `packages/server/src/gateway/ws.ts:289-299` — 收到消息后先用 `clientEnvelopeSchema.safeParse` 校验，协议版本不符返回 `UNSUPPORTED_PROTOCOL`。
- `packages/server/src/config.ts:44-56` — `port` 必须 1–65535 整数；`LOG_LEVEL` 必须为 `debug|info|warn|error` 之一；`LLM_TIMEOUT_MS` 必须 1 000–120 000 整数；不合法直接抛错启动失败。
- `packages/server/src/config.ts:58` — `LLM_BASE_URL` 去尾斜杠；非空字符串才视为启用。
- `packages/server/src/core/settings.ts:101-117` — `baseUrl` 用 `new URL()` 解析，并强制 `protocol` 为 `http:` / `https:`。
- `packages/server/src/core/settings.ts:124-130` — `model` 去空白后长度上限 128。
- `packages/server/src/core/settings.ts:132-143` — `timeoutMs` 必须 1 000–120 000 整数，越界抛 `SettingsError`。
- `packages/server/src/core/settings.ts:119-122` — `apiKey` 类型校验（string 或 null），写入前 `.trim()`。

### 修复项
无

---

## 2. CORS 与 Origin 校验

### 检查方法
- 检查 WS 握手时是否在 `verifyClient` 中校验 Origin。
- 检查 HTTP 响应是否设置 CSP、X-Content-Type-Options、Referrer-Policy；是否故意未设置 `Access-Control-Allow-Origin`（同源策略）。
- 检查 `ALLOWED_ORIGINS` 环境变量解析与使用路径。

### 结果
通过

### 证据
- `packages/server/src/gateway/ws.ts:95-108` — `isOriginAllowed` 实现：无 Origin（非浏览器）放行；Origin 主机 == Host 头放行；其余必须命中 `allowedOrigins` 列表；URL 解析失败返回 false。
- `packages/server/src/gateway/ws.ts:131-142` — `verifyClient` 调用 `isOriginAllowed`，未通过时记 `ws_origin_rejected` 并 `done(false, 403, 'Forbidden')`。
- `packages/server/src/gateway/http.ts:145-152` — `setSecurityHeaders` 设置：
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:`
  - `Referrer-Policy: no-referrer`
- `packages/server/src/gateway/http.ts:158` — 每个响应都先调 `setSecurityHeaders`。
- `packages/server/src/config.ts:66-69` — `ALLOWED_ORIGINS` 按逗号分割、`trim`、`filter(Boolean)`；空字符串环境变量得到空数组。
- 全局搜索 `access-control-allow`：未发现该头被设置（即未开 CORS，默认同源策略生效）。

### 修复项
无

---

## 3. 密码哈希

### 检查方法
- 检查 `createRoom.ts` 是否对房间密码先哈希再入库。
- 检查 `joinRoom.ts` 是否用 `verifyRoomPassword` 比对、是否使用常数时间比较。
- 检查 `ids.ts` 哈希算法是否为慢哈希（scrypt/bcrypt/argon2/PBKDF2），参数是否合理。
- 全局搜索 `password` / `password_hash` 在日志、快照、API 响应中是否被明文泄漏。

### 结果
通过

### 证据
- `packages/server/src/core/commands/createRoom.ts:63` — `const passwordHash = payload.password === undefined ? null : hashRoomPassword(payload.password);` 入库前先哈希。
- `packages/server/src/core/commands/createRoom.ts:70-73` — `INSERT INTO rooms` 写入 `password_hash` 字段（哈希值），无明文。
- `packages/server/src/core/commands/joinRoom.ts:39-43` — 仅当 `room.password_hash !== null` 时校验；调用 `verifyRoomPassword(payload.password, room.password_hash)`，未通过抛 `INVALID_PASSWORD`。
- `packages/server/src/core/ids.ts:46-55` — `hashRoomPassword` 使用 `scryptSync`，参数 `N=16384, r=8, p=1, salt=16 字节随机`，输出 32 字节；存储格式 `scrypt$N$r$p$salt$hash`。
- `packages/server/src/core/ids.ts:57-68` — `verifyRoomPassword` 拆解存储格式后用相同参数重算哈希，并用 `timingSafeEqual`（line 68）常数时间比较，避免时序攻击。
- `packages/server/src/core/snapshot.ts:73` — 公开房间摘要只暴露 `CASE WHEN r.password_hash IS NULL THEN 0 ELSE 1 END AS requires_password`，仅布尔，不回传哈希。
- `packages/server/src/boot/logger.ts:11-18` — `SENSITIVE_KEY_PARTS` 包含 `'password'`，含 password 字段的对象会被脱敏为 `[REDACTED]`。
- 全局搜索 `password_hash` / `password`：仅出现在 DB schema、命令实现与脱敏列表中，未在日志 sink、HTTP 响应或 WS 广播中明文出现。

### 修复项
无

---

## 4. 日志脱敏

### 检查方法
- 检查 `logger.ts` 脱敏规则是否覆盖密钥、token、密码、秘密词、种子、快照等敏感键。
- 检查 `llmProvider.ts` 与 `llmClient.ts` 在日志中是否记录 API 密钥、Authorization 头、身份词、玩家手牌/秘密词、模型返回的完整 prompt。
- 检查 `botRunner.ts` 日志是否泄漏机器人手牌或局势秘密。

### 结果
通过

### 证据
- `packages/server/src/boot/logger.ts:11-18` — `SENSITIVE_KEY_PARTS = ['password','token','secret','seed','word','snapshot']`：
  - `'word'` 覆盖 `civilianWord` / `undercoverWord`（谁是卧底的身份词）
  - `'token'` 覆盖 `resumeToken`
  - `'seed'` 覆盖对局随机种子
  - `'snapshot'` 覆盖 `snapshot_json` 等字段
  - `'password'` / `'secret'` 覆盖密码与密钥
- `packages/server/src/boot/logger.ts:20-36` — `redact()` 递归处理对象（最深 6 层），命中片段的键值替换为 `[REDACTED]`。
- `packages/server/src/boot/logger.ts:58` — `emit` 调用前对 `fields` 整体 `redact`。
- `packages/server/src/core/game/llmProvider.ts:50-54` — `llm_config_updated` 仅记录 `enabled` 与 `model`，注释明确写"端点与密钥不入日志"。
- `packages/server/src/core/game/llmClient.ts:106-122` — `Authorization: Bearer ${apiKey}` 仅写入 HTTP 请求头，未出现在任何 `logger.*` 调用中。
- `packages/server/src/core/game/llmClient.ts:125, 134, 140, 146-151, 155-159` — 所有 LLM 日志只记 `meta`（roomId/botId/moduleId）、`status`、`replyLength`、`choiceId`、`reason`、`elapsedMs`、`message`，不记 prompt 内容、不记身份词、不记手牌、不记模型原始回复。
- `packages/server/src/core/game/llmClient.ts:62-66` — `reason` 在写入日志前 `slice(0, 60)` 截断，限制模型一句话理由长度。
- `packages/server/src/core/game/botRunner.ts:118, 137, 146, 177, 193, 266, 280, 290, 305` — 所有 bot 日志只记 `roomId / botId / moduleId / message / via / expectedSeq / actualSeq / action(JSON 序列化)`；`action` 是机器人自己投递的游戏动作（公开语义），不含秘密词或他人手牌。

### 修复项
无

---

## 5. WS 鉴权

### 检查方法
- 检查每条 WS 命令是否在路由前确认连接已绑定 `seatId + resumeToken`（即 `state.roomId` 与 `state.playerId`）。
- 检查 actor 来源是否来自连接上下文而非客户端自报。
- 检查房主权限校验返回的错误码。
- 检查会话接管、踢出、关闭房间使用的关闭码。

### 结果
通过

### 证据
- 会话绑定（一次性建立）：`packages/server/src/gateway/ws.ts:373-396` — `#bindPlayer` 在 create/join/resume 成功后把 `state.roomId` / `state.playerId` 写入连接状态。
- 后续命令的鉴权检查：
  - `ws.ts:562-566` — `leave_room`：`roomId === null || playerId === null` → `ACTION_NOT_ALLOWED`
  - `ws.ts:602-605` — `room_command`：同上检查
  - `ws.ts:696-700` — `game_action`：同上检查
  - `ws.ts:772-776` — `chat_send`：同上检查
  - `ws.ts:811-815` — `resync`：检查 `roomId === null` → `ACTION_NOT_ALLOWED`
- Actor 来源由服务端从连接状态推导，不接受客户端自报 playerId：
  - `ws.ts:469-475` join 用 `actorScope: conn:${connectionId}`（绑定前还没有 playerId）
  - `ws.ts:518` resume 用 `actorScope: player:${payload.data.playerId}`，但 playerId 必须配合有效 resumeToken 才能落库（`resumeRoom.ts:56` 校验 `resume_token_hash`）
  - `ws.ts:570, 609, 704, 787` 后续命令统一用 `actorScope: player:${state.playerId}`，playerId 来自服务端绑定结果
- resumeToken 校验：`packages/server/src/core/commands/resumeRoom.ts:56` — `member.resume_token_hash !== hashResumeToken(payload.resumeToken)` 抛 `INVALID_RESUME_TOKEN`。token 仅在校验时使用，后续命令不再要求重传（WS 连接本身即为会话凭证，符合 SPEC §9.5 设计）。
- 越权操作错误码：
  - `packages/server/src/core/commands/roomCommand.ts:73-75` — 非房主执行 `room_command` 抛 `NOT_AUTHORIZED`
  - `packages/shared/src/protocol/errors.ts:44` — `NOT_AUTHORIZED: userMessage: '没有权限执行此操作', recoverable: false`
- 关闭码：
  - `packages/server/src/gateway/ws.ts:82` `WS_CLOSE_KICKED = 4001`，使用于 `ws.ts:650` `kickedSocket.close(WS_CLOSE_KICKED, 'kicked')`
  - `ws.ts:83` `WS_CLOSE_SESSION_REPLACED = 4002`，使用于 `ws.ts:385` `old.close(WS_CLOSE_SESSION_REPLACED, 'session replaced')`
  - `ws.ts:84` `WS_CLOSE_ROOM_CLOSED = 4003`，使用于 `ws.ts:682` `sub.close(WS_CLOSE_ROOM_CLOSED, 'room closed')`
- 被踢者 token 作废：`packages/server/src/core/commands/roomCommand.ts:97-101` — `SET ... resume_token_hash = 'revoked'`，被踢后无法用旧 token 恢复。

### 修复项
无

---

## 6. 限流

### 检查方法
- 检查 `rateLimit.ts` 是否定义聊天、加入、消息总量的限流规则。
- 检查 `ws.ts` 是否在对应入口处实际调用限流器。
- 审计时检查 `http.ts` 设置端点是否执行当时的 1 KiB body 上限；当前统一上限为 16 KiB。

### 结果
通过

### 证据
- `packages/server/src/gateway/rateLimit.ts:13-22` — `DEFAULT_RULES`：
  - `chat: 5 / 10 s / 玩家`
  - `gameAction: 20 / 1 s / 玩家`（规则已定义，参见备注）
  - `joinAttempt: 10 / 60 s / IP`
  - `messagesPerConnection: 40 / 1 s`（防洪泛硬限）
- `packages/server/src/gateway/rateLimit.ts:29-49` — `RateLimiter.tryAcquire` 固定窗口实现；超限返回 `{ ok: false, retryAfterMs }`。
- `packages/server/src/gateway/ws.ts:120-122` — 实例化三个限流器：`#messageLimiter`、`#chatLimiter`、`#joinLimiter`。
- `packages/server/src/gateway/ws.ts:275-279` — 每条消息入口先 `#messageLimiter.tryAcquire(state.connectionId)`，超限返回 `RATE_LIMITED`。
- `packages/server/src/gateway/ws.ts:451-455` — `#handleJoinRoom` 调用 `#joinLimiter.tryAcquire(state.ip)`，超限返回 `RATE_LIMITED` + `retryAfterMs`。
- `packages/server/src/gateway/ws.ts:500-504` — `#handleResumeRoom` 同样调用 `#joinLimiter`（密码尝试与加入同享配额，防止密码爆破）。
- `packages/server/src/gateway/ws.ts:778-782` — `#handleChatSend` 调用 `#chatLimiter.tryAcquire(${roomId}/${playerId})`，超限返回 `RATE_LIMITED` + `retryAfterMs`。
- 历史证据：`packages/server/src/gateway/http.ts:54` 当时为 `MAX_BODY_BYTES = 1024`（1 KiB）；当前实现与验收口径为 `16 * 1024`（16 KiB）。
- `packages/server/src/gateway/http.ts:77-83` — `readJsonBody` 在累积字节超过上限时置 `tooLarge`，最终 reject `BODY_TOO_LARGE`，对应 HTTP 413（line 215-216）。
- `ws.ts` 还设置了 WS 层硬上限：`packages/server/src/gateway/ws.ts:130` `maxPayload: MAX_MESSAGE_BYTES`（来自 `envelope.ts:60`，32 KiB）。

### 修复项
无

---

## 7. SQL 注入

### 检查方法
- 全局搜索 `db.exec(` 检查是否有字符串拼接。
- 全局搜索 `db.prepare(` 后是否出现字符串 `+` 拼接。
- 抽查所有 `db.prepare(...).run(...)` 调用确认参数化。
- 检查 SQL 字符串中是否有 `${...}` 模板插值引入用户输入。

### 结果
通过

### 证据
- `db.exec(` 共 9 处，全部为静态 SQL：
  - `packages/server/src/persistence/migrator.ts:9` — `CREATE TABLE IF NOT EXISTS schema_migrations ...`（字面量）
  - `packages/server/src/persistence/migrator.ts:32` — `db.exec(m.up)`，`m.up` 来自 `MIGRATIONS` 静态数组（`migrations.ts:12`），不含用户输入
  - `packages/server/src/persistence/db.ts:21-24, 33, 36, 39` — PRAGMA 与 `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`（字面量）
- `db.prepare(` 共 68 处，全部使用占位符 `?`：
  - 例：`packages/server/src/core/executor.ts:67-70` `SELECT ... WHERE room_id = ? AND actor_scope = ? AND request_id = ?` 后 `.get(opts.roomId, opts.actorScope, opts.requestId)`
  - 例：`packages/server/src/core/commands/joinRoom.ts:60-63` `SELECT player_id, nickname, seat_role, seat FROM room_members WHERE room_id = ? AND connection_status NOT IN (...)` 后 `.all(roomId)`
- 模板插值检查：
  - `packages/server/src/core/snapshot.ts:56` `const ACTIVE_MEMBER_STATUSES = "('CONNECTED', 'DISCONNECTED_RESERVED')";` 是常量字面量，非用户输入
  - 该常量在 `snapshot.ts:70, 72` 通过 `${ACTIVE_MEMBER_STATUSES}` 插值进入 SQL 字符串，但因其来源为代码内常量，不存在注入风险
- 全局搜索 `db.prepare([^)]*\+`（prepare 后接 `+` 拼接）与 `db.exec([^)]*\+`：均无匹配。
- 全局搜索 `db\.prepare\(\s*[`'"]\s*SELECT.*\$\{`（SELECT 语句中含模板插值）：无匹配。

### 修复项
无

---

## 8. XSS

### 检查方法
- 在 `packages/client/src/` 下搜索 `dangerouslySetInnerHTML`，应当为零。
- 确认 React 默认转义未被绕过（无 `innerHTML` 直接赋值、无 `eval` / `Function` 构造）。

### 结果
通过

### 证据
- 全局搜索 `dangerouslySetInnerHTML`（`packages/client/src/`）：无匹配，未发现绕过 React 默认转义的写法。
- 客户端消息处理路径：服务端发送的 `chat_batch` 文本经 React 组件以普通子节点形式渲染（如 `<div>{message.text}</div>`），React 默认对 `{}` 表达式做 HTML 转义。
- 服务端对聊天文本入库前还做了一层规范化：`packages/shared/src/protocol/messages.ts:156-166` `chatTextSchema` 使用 NFC 规范化与长度限制；`packages/server/src/core/commands/chat.ts`（经由 `applyChatSend`）按纯文本存储，不解析 HTML。

### 修复项
无

---

## 9. 目录穿越

### 检查方法
- 检查 `http.ts` 静态文件托管逻辑是否在拼接路径后做 `normalize` 并验证结果仍位于 `staticRoot` 之内。

### 结果
通过

### 证据
- `packages/server/src/gateway/http.ts:6` — 引入 `normalize, resolve, sep` 等 path 工具。
- `packages/server/src/gateway/http.ts:155` — `const staticRoot = deps.staticDir ? resolve(deps.staticDir) : null;`（先解析为绝对路径）。
- `packages/server/src/gateway/http.ts:255-275` — 静态托管分支：
  - line 256：`const rel = url === '/' ? 'index.html' : decodeURIComponent(url.slice(1));`
  - line 257：`const candidate = normalize(join(staticRoot, rel));`
  - line 258：`if (candidate.startsWith(staticRoot + sep) || candidate === join(staticRoot, 'index.html'))` — 必须落在 `staticRoot` 之内或正好是 `index.html`，否则不返回任何文件
  - line 259-262：仅当 `candidate` 存在且为文件时使用，否则回退到 SPA `index.html`
  - line 263-274：再次校验目标文件存在且为文件，才以流式响应输出
- `decodeURIComponent` 后再 `normalize` + `startsWith` 校验，可抵御 `%2e%2e%2f` 等编码绕过。

### 修复项
无

---

## 10. 错误信息泄漏

### 检查方法
- 检查 HTTP 500 错误响应是否返回堆栈或内部 SQL。
- 检查 WS 未捕获异常是否将 `err.stack` / `err.message` 直接发给客户端。
- 检查错误码表是否仅含面向用户的简短文案。

### 结果
通过

### 证据
- `packages/server/src/gateway/http.ts:210-224` — 设置端点的 try/catch：
  - `BODY_TOO_LARGE` → 413 `{ error: 'BODY_TOO_LARGE', message: '请求体过大' }`
  - `INVALID_JSON` → 400 `{ error: 'INVALID_JSON', message: '请求体不是合法 JSON' }`
  - `SettingsError` → 400 `{ error: 'INVALID_SETTINGS', message }`（message 为 SettingsError 抛出的简短文案）
  - 其他未知错误 → 500 `{ error: 'INTERNAL_ERROR', message: '设置写入失败' }`（**通用文案，未返回 `err.message` 或 stack**）
- `packages/server/src/gateway/ws.ts:338-357` — WS 命令统一异常处理：
  - `CommandError` → 仅发给客户端 `err.code` + `err.message`（模块文案，面向用户）
  - 其他未知异常 → 仅记 `log.error('command_failed', { type, requestId, message })`（仅服务端日志），发给客户端的只有 `'INTERNAL_ERROR'`，无 message 字段
- `packages/shared/src/protocol/errors.ts:36-54` — `ERROR_META` 全部为面向用户短文案（"服务端开小差了，请重试"等），并标注 `recoverable`；注释明确"生产环境不得返回堆栈或内部 SQL"。
- `packages/server/src/index.ts:57` — 启动失败仅 `console.error('启动失败：', (err as Error).message);`，无堆栈输出（也不向远端暴露）。
- 全局搜索 `console.log|error|warn|debug`：仅 `logger.ts:49`（默认 sink）与 `index.ts` 中的启动信息打印，未在请求处理路径中直接 console 输出错误对象。

### 修复项
无

---

## P0 缺陷汇总

| # | 描述 | 位置 | 修复状态 |
|---|------|------|---------|
| （无） | — | — | — |

无 P0 缺陷。

## 通过项汇总

1. 输入校验 — 通过
2. CORS 与 Origin 校验 — 通过
3. 密码哈希 — 通过
4. 日志脱敏 — 通过
5. WS 鉴权 — 通过
6. 限流 — 通过
7. SQL 注入 — 通过
8. XSS — 通过
9. 目录穿越 — 通过
10. 错误信息泄漏 — 通过

## 备注

以下为非 P0 的观察与改进建议，不阻塞 M5 发布：

### B-1：`gameAction` 限流规则已定义但未实例化

- `packages/server/src/gateway/rateLimit.ts:16-17` 定义了 `gameAction: { windowMs: 1_000, max: 20 }`，但 `packages/server/src/gateway/ws.ts:120-122` 仅实例化了 `#messageLimiter`、`#chatLimiter`、`#joinLimiter`，未对 `game_action` 单独限流。
- 当前实际防护：`#messageLimiter`（40 条/秒/连接）对单连接洪水有效；游戏模块的 `parseAction` + `applySessionAction` 会拒绝非法动作。一个恶意客户端最多每秒触发 40 次 reduce 尝试，每次都被事务回滚。
- 建议：若需更精细的每玩家游戏动作限流，可在 `#handleGameAction` 入口加 `#gameActionLimiter.tryAcquire(${roomId}/${playerId})`，规则复用 `DEFAULT_RULES.gameAction`。属优化项，非安全漏洞。

### B-2：日志脱敏键 `'word'` 可能误伤非敏感字段

- `packages/server/src/boot/logger.ts:16` 将 `'word'` 加入 `SENSITIVE_KEY_PARTS`，意图覆盖 `civilianWord` / `undercoverWord`。
- 副作用：任何键名包含 `word` 子串的字段（如 `lastWord`、`wordCount`）都会被替换为 `[REDACTED]`，可能掩盖调试信息。
- 评估：偏保守的脱敏策略，安全侧无负面影响，仅调试时需注意。无需修复。

### 其他观察

- `packages/server/src/core/game/llmClient.ts:110` — `Authorization: Bearer ${apiKey}` 通过 HTTPS 请求头发送，仅当 `apiKey` 非空时设置；本地默认走 HTTP（用户自配端点），上云前需替换为 HTTPS（SPEC §13.5 已要求）。
- `packages/server/src/core/commands/resumeRoom.ts:44-58` — 成员不存在、被踢、token 不符统一返回 `INVALID_RESUME_TOKEN`，不泄露区分信息，符合 SEC 设计。
- `packages/server/src/core/commands/roomCommand.ts:97-101` — 被踢者 `resume_token_hash` 设为 `'revoked'`，防止被踢后用旧 token 重新加入。

---

# 复审（2026-08-09）

**审计日期**：2026-08-09
**审计范围**：D8 工程加固期间对当前工作树的 §14.1 完整安全复审
**审计依据**：SPEC §14.1 安全检查清单（tasks.md Task 3/4/5）
**审计方式**：只读取证（Grep/Read），证据引用形如 `file:line`；新增/变更路径为审计重点

## 复审结论

| 项 | 结果 | P0 数 |
|---|------|------|
| 1. 输入校验 | 通过 | 0 |
| 2. CORS 与 Origin 校验 | 通过 | 0 |
| 3. 密码哈希 | 通过 | 0 |
| 4. 日志脱敏 | 通过 | 0 |
| 5. WS 鉴权 | 通过 | 0 |
| 6. 限流 | 通过 | 0 |
| 7. SQL 注入 | 通过 | 0 |
| 8. XSS | 通过 | 0 |
| 9. 目录穿越 | 通过 | 0 |
| 10. 错误信息泄漏 | 通过 | 0 |

**复审结论**：2026-08-09 当前工作树未发现 P0 缺陷，10 项全部通过。与 2026-07-29 相比，新增面（LLM 设置面板、模型目录代理、连接诊断、安全上游请求器）均得到同等或更严格的防护；历史观察 B-1 已确认解决。

## 与上次审计相比的变更面与逐项核验

### 1. 输入校验 — 通过

- `http.ts:69` `MAX_BODY_BYTES = 16 * 1024`：设置写入/模型目录/连接诊断共用 16 KiB 上限（1 KiB 历史证据已失效）；`readJsonBody` 超限 reject `BODY_TOO_LARGE` → 413。
- 新增上游 URL 规范化 `core/llmBaseUrl.ts`：仅放行 `http:`/`https:`，拒绝携带凭据、query 与 hash；`normalizeLlmBaseUrl` 在设置写入与模型目录输入归一化路径中均被调用。
- `core/llmModelCatalog.ts:46-64` `normalizeInput`：provider 枚举、baseUrl 非空且可解析、apiKey 类型、timeoutMs 1–120000 整数。
- `core/settings.ts:127-131` `parseProfilesJson(strict)`：profilesJson 必须为合法 JSON 数组，非法即 `SettingsError`。
- 原有 `messages.ts` zod `.strict()`、`config.ts` 范围校验保持（见历史审计 §1）。

### 2. CORS 与 Origin 校验 — 通过

- `http.ts:228` `setSecurityHeaders`：`X-Content-Type-Options: nosniff`、CSP `default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:`、`Referrer-Policy: no-referrer`；每个响应先调用。
- `http.ts:151-171` `authorizeSettingsWrite`：Origin 不在允许集 → 403；设 `ADMIN_TOKEN` 则必须带 `x-admin-token`；未设则仅本机（`isLocalAddress`）可写。
- `ws.ts` `isOriginAllowed`/`verifyClient` 未变（见历史审计 §2）。

### 3. 密码哈希 — 通过

- `core/ids.ts` scrypt（N=16384, r=8, p=1, 16 字节盐）+ `timingSafeEqual`；公开摘要仅暴露布尔 `requires_password`（见历史审计 §3，无变更）。

### 4. 日志脱敏 — 通过

- `boot/logger.ts:11` `SENSITIVE_KEY_PARTS` 含 `password/token/secret/word/snapshot` 等；递归 `redact`（深度 6）。
- `core/llmConnectionTest.ts`：无任何 `logger.*` 调用携带 `apiKey`；测试断言响应不含 `PRIVATE_REPLY` 与草稿密钥。
- `core/llmModelCatalog.ts`：错误映射为通用用户文案，不含上游响应体。
- 历史观察 **B-2 维持原决定**：`'word'` 键过宽属偏保守脱敏（安全侧无负面影响），不修改以避免削弱脱敏强度。

### 5. WS 鉴权 — 通过

- `#bindPlayer` + `actorScope` 由服务端连接状态推导，不接受客户端自报（见历史审计 §5，无变更）。
- 计划新增的只读 `room_status` 心跳查询将走既有绑定检查与 `#messageLimiter`（见 D8 心跳计划）。

### 6. 限流 — 通过（含本轮加固）

- **历史观察 B-1 已解决**：`ws.ts:138` `#gameActionLimiter` 已实例化，`ws.ts:818` 在 `#handleGameAction` 按 `${roomId}/${playerId}` 限流（D4/D5 期间落实）。
- 本轮新增 HTTP 写接口限流（SPEC §9.5）：`rateLimit.ts` `DEFAULT_RULES.settingsWrite = { 60_000ms, max: 20 }`；`http.ts:240` 每服务器实例一个 `RateLimiter`，`http.ts:281/366/471` 分别在 `PUT /api/settings/llm`、`POST /api/settings/llm/test`、`POST /api/settings/llm/models` 入口按每 IP 限流，超限 429 + `retryAfterMs`；`/health/live`、`/health/ready` 与读接口不受限。`gatewaySettings.test.ts` 新增 2 用例，32/32 通过。
- 原有 chat/join/message 限流保持（见历史审计 §6）。

### 7. SQL 注入 — 通过

- `db.exec(` 11 处全部为静态字面量（PRAGMA/事务/迁移）；`db.prepare(` 91 处全部参数化 `?`。
- 模板插值仅 `ACTIVE_MEMBER_STATUSES` 等代码内常量（见历史审计 §7 方法复核）。

### 8. XSS — 通过

- `packages/client/src` 全局搜索 `dangerouslySetInnerHTML`：0 匹配（含新增游戏页面目录）。
- 聊天文本经 `chatTextSchema` NFC 规范化、按纯文本存储渲染（见历史审计 §8）。

### 9. 目录穿越 — 通过

- `http.ts:527` `candidate.startsWith(staticRoot + sep)`：`resolve(staticRoot)` → `normalize(join(...))` → 前缀校验；`decodeURIComponent` 后再校验可防编码绕过（见历史审计 §9，逻辑未变）。

### 10. 错误信息泄漏 — 通过

- `http.ts` 各端点 catch：`BODY_TOO_LARGE`/`INVALID_JSON`/`SettingsError` → 映射短文案；未知错误 → `INTERNAL_ERROR` 通用文案，不回传 `err.message`/stack。
- 新增端点错误映射：`LlmConnectionTestError`/`LlmModelCatalogError` → 枚举码 + 通用文案；测试断言上游错误体 `PRIVATE_UPSTREAM_ERROR` 与密钥不出现在响应中。
- `ws.ts`：`CommandError` → code+message；未知异常 → 仅 `INTERNAL_ERROR`（见历史审计 §10）。
- **SSRF 面复核（新增）**：`core/safeUpstream.ts` 统一请求器——先 DNS 解析全部地址，逐一按 IP 阻断环回/私网/保留段（默认 `allowPrivateNetwork=false`），分页强制同源（`llmModelCatalog.ts:108-109`），`redirect: 'manual'`，响应 256 KiB 上限，支持 abort 传播。模型目录与连接诊断均走该路径。

## P0 缺陷汇总（2026-08-09 复审）

| # | 描述 | 位置 | 修复状态 |
|---|------|------|---------|
| （无） | — | — | — |

无 P0 缺陷。

## 本轮修复/加固记录（随复审落地）

1. HTTP 设置写接口每 IP 限流（1c，SPEC §9.5）：`rateLimit.ts` + `http.ts` + 2 新测试，32/32 绿。
2. 历史观察 B-1 确认已解决（`#gameActionLimiter` 已在 ws.ts 实例化并生效），本轮无需再修。
