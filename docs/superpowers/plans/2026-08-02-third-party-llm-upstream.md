# 第三方大模型上游连接修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让第三方 OpenAI 兼容与 Anthropic API 的模型发现、连接测试和真实对局调用形成可靠闭环，并新增原生 `max` 思考深度。

**Architecture:** 新增无状态协议适配模块，集中管理端点、鉴权、推理请求、思考参数、文本响应和模型目录解析；扩展安全上游模块，使诊断、目录和对局共享地址策略、手动重定向、取消与响应限制。设置层负责旧 `8192` 到 `max` 的兼容，HTTP 层只编排输入、密钥复用和稳定错误响应。

**Tech Stack:** TypeScript 5.9、Node.js 24、原生 Fetch API、node:test、React 19、SQLite、现有 npm workspaces

---

## 文件结构

- Create: `packages/server/src/core/llmProtocol.ts` — 两种协议的端点、请求体、鉴权、正文提取和目录解析。
- Create: `packages/server/src/core/llmModelCatalog.ts` — 模型目录请求、分页、上限和稳定错误分类。
- Create: `packages/server/tests/llmProtocol.test.ts` — 协议适配器纯单元测试。
- Create: `packages/server/tests/llmModelCatalog.test.ts` — 真实目录、过滤、分页和失败测试。
- Create: `packages/server/tests/llmClient.test.ts` — 真实对局 LLM 客户端直接测试。
- Modify: `packages/shared/src/domain/settings.ts` — 将旧 `8192` 选项替换为 `max`。
- Modify: `packages/server/src/config.ts` — 严格解析 provider、思考深度和私网上游开关。
- Modify: `packages/server/src/core/settings.ts` — 规范化旧深度值并兼容旧预设和数据库。
- Modify: `packages/server/src/core/safeUpstream.ts` — 显式控制 loopback/private 地址并提供受限 JSON 请求。
- Modify: `packages/server/src/core/llmConnectionTest.ts` — 复用协议适配器和安全请求。
- Modify: `packages/server/src/core/game/llmClient.ts` — 复用协议适配器和安全请求，不再直接无限制 fetch。
- Modify: `packages/server/src/gateway/http.ts` — 用模型目录服务替换内联代理和 fallback 列表。
- Modify: `packages/server/src/app.ts` — 向诊断、目录和对局传递地址策略。
- Modify: `packages/server/tests/boot.test.ts` — 环境变量严格校验与私网开关测试。
- Modify: `packages/server/tests/settings.test.ts` — `max` 保存与旧 `8192` 迁移测试。
- Modify: `packages/server/tests/llmConnectionTest.test.ts` — `max` 和显式私网策略测试。
- Modify: `packages/server/tests/gatewaySettings.test.ts` — 模型目录真实结果、结构化失败和无 fallback 测试。
- Modify: `packages/client/src/app/ai-settings/aiSettingsState.ts` — 精简目录请求并增加目录错误文案。
- Modify: `packages/client/src/app/ai-settings/AiEngineSettings.tsx` — 处理结构化目录失败并展示 `max` 说明。
- Modify: `packages/client/tests/aiSettingsState.test.ts` — 目录请求、错误和 `max` 指纹测试。

## Task 1：建立安全分支与基线

**Files:**
- Inspect: `d:\项目`

- [ ] **Step 1: 创建承载当前未提交工作区的修复分支**

Run: `git switch -c fix/third-party-llm-upstream`

Expected: 输出切换到新分支；现有未提交文件保持原样。

- [ ] **Step 2: 记录本次相关文件的基线状态**

Run: `git status --short -- packages/shared/src/domain/settings.ts packages/server/src/config.ts packages/server/src/core packages/server/src/gateway/http.ts packages/server/src/app.ts packages/server/tests packages/client/src/app/ai-settings packages/client/tests/aiSettingsState.test.ts`

Expected: 仅用于确认已有修改，不能执行 reset、checkout、clean 或 stash。

- [ ] **Step 3: 运行相关测试基线**

Run: `npx tsx --test packages/server/tests/settings.test.ts packages/server/tests/llmConnectionTest.test.ts packages/server/tests/gatewaySettings.test.ts packages/client/tests/aiSettingsState.test.ts`

Expected: 记录现有 PASS/FAIL；若基线失败，先确认失败是否已存在，不能把既有失败误归因于本次实现。

## Task 2：升级共享思考深度契约

**Files:**
- Modify: `packages/shared/src/domain/settings.ts:4-12`
- Modify: `packages/server/tests/settings.test.ts`
- Modify: `packages/client/tests/aiSettingsState.test.ts`

- [ ] **Step 1: 写入 `max` 契约失败测试**

在设置测试中加入保存 `max` 后返回 `max` 的断言，并在客户端状态测试中加入 `max` 会改变诊断指纹的断言：

```ts
test('思考深度支持 max', () => {
  const db = freshDb();
  const result = updateLlmSettings(db, { thinkingDepth: 'max' }, envFallback);
  assert.equal(result.thinkingDepth, 'max');
  db.close();
});
```

```ts
assert.notEqual(
  createConfigFingerprint({ ...form, thinkingDepth: 'max' }),
  createConfigFingerprint(form),
);
```

- [ ] **Step 2: 运行测试确认类型或行为失败**

Run: `npx tsx --test packages/server/tests/settings.test.ts packages/client/tests/aiSettingsState.test.ts`

Expected: FAIL，原因是 `ThinkingDepth` 尚不接受 `max`。

- [ ] **Step 3: 将共享选项替换为原生 max**

将最后一个选项改为：

```ts
{ value: 'max', label: '最大深度 (Max / Anthropic 8192 tokens)' },
```

- [ ] **Step 4: 运行共享、设置和客户端状态测试**

Run: `npx tsx --test packages/shared/tests/*.test.ts packages/server/tests/settings.test.ts packages/client/tests/aiSettingsState.test.ts`

Expected: PASS。

## Task 3：兼容旧 `8192` 并严格校验环境变量

**Files:**
- Modify: `packages/server/src/config.ts:46-82`
- Modify: `packages/server/src/core/settings.ts:55-61,63-114,165-190,257-262`
- Modify: `packages/server/tests/boot.test.ts`
- Modify: `packages/server/tests/settings.test.ts`

- [ ] **Step 1: 写入环境变量和旧值兼容失败测试**

在 `boot.test.ts` 导入 `loadConfig` 并加入：

```ts
test('loadConfig 接受 max 并拒绝非法 LLM 配置', () => {
  assert.equal(loadConfig({ LLM_THINKING_DEPTH: 'max' }).llm.thinkingDepth, 'max');
  assert.equal(loadConfig({ LLM_THINKING_DEPTH: '8192' }).llm.thinkingDepth, 'max');
  assert.throws(() => loadConfig({ LLM_THINKING_DEPTH: 'deep' }), /思考深度/);
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'other' }), /服务商/);
});
```

在 `settings.test.ts` 直接写入旧数据库值与旧预设 JSON，并断言对外解析为 `max`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test packages/server/tests/boot.test.ts packages/server/tests/settings.test.ts`

Expected: FAIL，旧值未迁移且环境变量仍使用类型断言。

- [ ] **Step 3: 实现统一深度规范化**

在设置层增加并复用：

```ts
export function normalizeThinkingDepth(value: unknown): ThinkingDepth | null {
  if (value === '8192') return 'max';
  return THINKING_DEPTH_OPTIONS.some((option) => option.value === value)
    ? value as ThinkingDepth
    : null;
}
```

数据库读取、预设解析和设置写入都调用该函数；旧预设读取后对外返回 `max`。

- [ ] **Step 4: 严格解析启动配置**

在 `loadConfig` 中只接受 `openai | anthropic`，并使用 `normalizeThinkingDepth` 解析 `LLM_THINKING_DEPTH`；非法值抛出中文配置错误，不再静默改成 OpenAI 或使用类型断言。

- [ ] **Step 5: 运行配置与设置测试**

Run: `npx tsx --test packages/server/tests/boot.test.ts packages/server/tests/settings.test.ts`

Expected: PASS。

## Task 4：建立协议适配器

**Files:**
- Create: `packages/server/src/core/llmProtocol.ts`
- Create: `packages/server/tests/llmProtocol.test.ts`

- [ ] **Step 1: 写入端点、鉴权、思考映射和响应解析测试**

测试必须覆盖：

```ts
assert.equal(buildInferenceUrl('https://api.example.com/v1', 'openai'), 'https://api.example.com/v1/chat/completions');
assert.equal(buildInferenceUrl('https://api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages');
assert.equal(buildModelsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/models');
assert.equal(buildModelsUrl('https://api.example.com/v1/models'), 'https://api.example.com/v1/models');
assert.equal(buildInferenceRequest(openAiMaxInput).body.reasoning_effort, 'max');
assert.deepEqual(buildInferenceRequest(anthropicMaxInput).body.thinking, { type: 'enabled', budget_tokens: 8192 });
assert.equal(buildInferenceRequest(anthropicMaxInput).body.max_tokens, 8492);
assert.equal(extractText('openai', openAiBody), 'OK');
assert.equal(extractText('anthropic', anthropicBody), 'OK');
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `npx tsx --test packages/server/tests/llmProtocol.test.ts`

Expected: FAIL，无法导入 `llmProtocol.ts`。

- [ ] **Step 3: 实现无状态协议适配器**

导出以下稳定接口：

```ts
export interface LlmInferenceRequestInput {
  provider: LlmProviderType;
  model: string;
  apiKey: string | null;
  thinkingDepth: ThinkingDepth;
  system?: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}

export function buildInferenceUrl(baseUrl: string, provider: LlmProviderType): string;
export function buildModelsUrl(baseUrl: string): string;
export function buildInferenceRequest(input: LlmInferenceRequestInput): { headers: Record<string, string>; body: Record<string, unknown> };
export function buildModelsHeaders(provider: LlmProviderType, apiKey: string | null): Record<string, string>;
export function extractText(provider: LlmProviderType, body: unknown): string | null;
export function parseModelPage(body: unknown): { ids: string[]; nextUrl: string | null };
```

`parseModelPage` 只接受 trim 后 1–128 字符的字符串 ID，去重并从标准 `next`、`next_page` 或 Anthropic `last_id/has_more` 信息生成下一页指示。

- [ ] **Step 4: 运行协议测试**

Run: `npx tsx --test packages/server/tests/llmProtocol.test.ts`

Expected: PASS。

## Task 5：统一安全上游地址策略

**Files:**
- Modify: `packages/server/src/core/safeUpstream.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/tests/llmConnectionTest.test.ts`
- Modify: `packages/server/tests/boot.test.ts`

- [ ] **Step 1: 写入显式地址策略失败测试**

测试默认允许 loopback、默认拒绝 RFC1918 私网、开启 `allowPrivateNetwork` 后允许私网，但始终拒绝云元数据和未指定地址：

```ts
await assert.doesNotReject(() => validateUpstreamUrl('http://127.0.0.1:11434/v1'));
await assert.rejects(() => validateUpstreamUrl('http://192.168.1.20:11434/v1'));
await assert.doesNotReject(() => validateUpstreamUrl('http://192.168.1.20:11434/v1', { allowPrivateNetwork: true }));
await assert.rejects(() => validateUpstreamUrl('http://169.254.169.254/latest/meta-data', { allowPrivateNetwork: true }));
```

- [ ] **Step 2: 运行测试确认签名或行为失败**

Run: `npx tsx --test packages/server/tests/llmConnectionTest.test.ts packages/server/tests/boot.test.ts`

Expected: FAIL，尚无显式私网策略。

- [ ] **Step 3: 实现安全策略与配置项**

增加：

```ts
export interface UpstreamAddressPolicy {
  allowPrivateNetwork?: boolean;
}
```

`validateUpstreamUrl(value, policy)` 始终拒绝 unspecified、link-local、multicast、保留地址和 URL 凭据；loopback 用于本机模型并保持允许；RFC1918/ULA 仅在 `allowPrivateNetwork` 时允许。

在 `ServerConfig` 增加 `allowPrivateLlmUpstream: boolean`，从 `LLM_ALLOW_PRIVATE_NETWORK=true|false` 严格解析，默认 `false`。

- [ ] **Step 4: 运行安全与配置测试**

Run: `npx tsx --test packages/server/tests/boot.test.ts packages/server/tests/llmConnectionTest.test.ts`

Expected: PASS。

## Task 6：让连接诊断复用协议适配器

**Files:**
- Modify: `packages/server/src/core/llmConnectionTest.ts`
- Modify: `packages/server/tests/llmConnectionTest.test.ts`

- [ ] **Step 1: 扩展连接诊断失败测试**

加入 OpenAI `max` 原样发送和 Anthropic `max` 映射 8192 的断言；加入可选地址策略参数：

```ts
await testLlmConnection(input, undefined, { allowPrivateNetwork: true });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test packages/server/tests/llmConnectionTest.test.ts`

Expected: FAIL，现有实现会把旧极高档降级或无法接收策略。

- [ ] **Step 3: 改造连接诊断**

使用 `buildInferenceUrl`、`buildInferenceRequest` 和 `extractText`；保留稳定错误类型与响应脱敏。函数签名调整为：

```ts
export async function testLlmConnection(
  rawInput: LlmConnectionTestInput,
  requestSignal?: AbortSignal,
  addressPolicy?: UpstreamAddressPolicy,
): Promise<LlmConnectionTestSuccess>;
```

请求继续使用 `redirect: 'manual'` 与 `readLimitedJson`。

- [ ] **Step 4: 运行连接诊断测试**

Run: `npx tsx --test packages/server/tests/llmConnectionTest.test.ts`

Expected: PASS。

## Task 7：实现真实模型目录服务

**Files:**
- Create: `packages/server/src/core/llmModelCatalog.ts`
- Create: `packages/server/tests/llmModelCatalog.test.ts`

- [ ] **Step 1: 写入目录服务失败测试**

覆盖 OpenAI 与 Anthropic 鉴权、ID 过滤去重、分页、最多 5 页、最多 500 个模型、重定向、401/403、404、429、超时、非法 JSON 和超大响应。稳定返回或抛出：

```ts
export type LlmModelCatalogErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'MODEL_CATALOG_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE';
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `npx tsx --test packages/server/tests/llmModelCatalog.test.ts`

Expected: FAIL，无法导入目录服务。

- [ ] **Step 3: 实现目录服务**

导出：

```ts
export interface LlmModelCatalogInput {
  provider: LlmProviderType;
  baseUrl: string;
  apiKey: string | null;
  timeoutMs?: number;
}

export async function fetchLlmModels(
  input: LlmModelCatalogInput,
  requestSignal?: AbortSignal,
  addressPolicy?: UpstreamAddressPolicy,
): Promise<string[]>;
```

每一页都重新执行 URL 校验，禁止重定向，使用受限 JSON 读取；结果去重并保留上游顺序。任何失败都抛稳定错误，不生成 fallback 模型。

- [ ] **Step 4: 运行目录服务测试**

Run: `npx tsx --test packages/server/tests/llmModelCatalog.test.ts`

Expected: PASS。

## Task 8：替换 HTTP 模型目录代理

**Files:**
- Modify: `packages/server/src/gateway/http.ts:8-17,326-488`
- Modify: `packages/server/src/app.ts:86-110`
- Modify: `packages/server/tests/gatewaySettings.test.ts:133-301`

- [ ] **Step 1: 将网关测试改为真实结果语义**

将原 `source: fallback` 断言替换为结构化失败断言：重定向和超大响应返回 502、`error: INVALID_RESPONSE`，且响应不包含 `models`。增加 401、404、429 测试，并断言分别为 `AUTH_FAILED`、`MODEL_CATALOG_NOT_FOUND`、`RATE_LIMITED`。

- [ ] **Step 2: 运行网关测试确认失败**

Run: `npx tsx --test packages/server/tests/gatewaySettings.test.ts`

Expected: FAIL，当前网关仍返回 200 和内置建议。

- [ ] **Step 3: 用目录服务替换内联实现**

删除两份 provider 分支和硬编码模型列表；保留管理员鉴权、同源保护和密钥复用规则。成功响应仅为：

```ts
sendJson(res, 200, { models, source: 'remote' });
```

失败响应使用目录错误码，`INVALID_CONFIG` 返回 400，其余返回 502。

- [ ] **Step 4: 从 App 传入地址策略**

在 `HttpDeps` 增加 `allowPrivateLlmUpstream?: boolean`，`createApp` 传入 `config.allowPrivateLlmUpstream`；连接测试和目录服务都使用同一策略。

- [ ] **Step 5: 运行网关和连接测试**

Run: `npx tsx --test packages/server/tests/gatewaySettings.test.ts packages/server/tests/llmConnectionTest.test.ts packages/server/tests/llmModelCatalog.test.ts`

Expected: PASS。

## Task 9：加固真实对局 LLM 客户端

**Files:**
- Modify: `packages/server/src/core/game/llmClient.ts`
- Modify: `packages/server/src/core/game/llmProvider.ts`
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/tests/llmClient.test.ts`

- [ ] **Step 1: 写入真实客户端失败测试**

使用本地受控 HTTP 服务覆盖：OpenAI 合法候选、Anthropic 合法候选、OpenAI `max`、Anthropic `max`、重定向不携带密钥、超大响应、非法 JSON、空正文、非法候选 ID 和超时返回 `null`。

核心成功断言：

```ts
const result = await client.decide(prompt, meta);
assert.equal(result?.option.id, '2');
assert.equal(result?.reason, '更稳妥');
```

- [ ] **Step 2: 运行测试确认安全场景失败**

Run: `npx tsx --test packages/server/tests/llmClient.test.ts`

Expected: FAIL，当前客户端自动跟随重定向且无限制读取 JSON。

- [ ] **Step 3: 改造真实客户端**

构造函数接收 `UpstreamAddressPolicy`；使用协议适配器构造请求与提取正文，使用 `validateUpstreamUrl`、`redirect: 'manual'` 和 `readLimitedJson`。异常日志不再写入原始 `Error.message`，只记录稳定事件与业务元数据。

- [ ] **Step 4: 把策略传入热更新 Provider**

`LlmProvider` 在创建和更新客户端时保留同一地址策略；`createApp` 使用 `config.allowPrivateLlmUpstream` 构造 provider。

- [ ] **Step 5: 运行客户端、机器人和对局测试**

Run: `npx tsx --test packages/server/tests/llmClient.test.ts packages/server/tests/botRunner.test.ts packages/server/tests/gameSession.test.ts`

Expected: PASS，LLM 失败时规则策略测试仍通过。

## Task 10：更新客户端目录与 Max 体验

**Files:**
- Modify: `packages/client/src/app/ai-settings/aiSettingsState.ts:13-20,46-69`
- Modify: `packages/client/src/app/ai-settings/AiEngineSettings.tsx:151-177,275-283`
- Modify: `packages/client/tests/aiSettingsState.test.ts:24-36,129-153`

- [ ] **Step 1: 修改客户端状态失败测试**

目录请求只包含 provider、规范化 Base URL 和可选 API Key：

```ts
assert.deepEqual(buildModelRequestBody(form), {
  provider: 'openai',
  baseUrl: 'https://api.example.com/v1',
});
```

增加 `MODEL_CATALOG_NOT_FOUND` 错误提示测试，并确认 `max` 参与指纹。

- [ ] **Step 2: 运行客户端状态测试确认失败**

Run: `npx tsx --test packages/client/tests/aiSettingsState.test.ts`

Expected: FAIL，当前请求仍携带 `thinkingDepth`。

- [ ] **Step 3: 精简目录请求并扩展错误文案**

从 `buildModelRequestBody` 删除 `thinkingDepth`；加入模型目录端点不存在的安全提示。目录错误继续使用服务端稳定 `error` 字段，不展示上游正文。

- [ ] **Step 4: 更新设置组件行为**

`fetchModels` 只在成功时 `setModels`；失败时保留当前模型文本和已有目录状态，显示结构化错误。思考深度字段下增加随 provider 变化的说明：OpenAI 为原生 `reasoning_effort=max`，Anthropic 为 8192-token budget。

- [ ] **Step 5: 运行客户端测试与构建**

Run: `npx tsx --test packages/client/tests/aiSettingsState.test.ts && npm run build -w @ldj/client`

Expected: 测试 PASS，Vite build 成功。

## Task 11：全量验证与浏览器冒烟

**Files:**
- Verify: all modified files

- [ ] **Step 1: 运行相关测试第一轮**

Run: `npx tsx --test packages/server/tests/boot.test.ts packages/server/tests/settings.test.ts packages/server/tests/llmProtocol.test.ts packages/server/tests/llmConnectionTest.test.ts packages/server/tests/llmModelCatalog.test.ts packages/server/tests/llmClient.test.ts packages/server/tests/gatewaySettings.test.ts packages/server/tests/botRunner.test.ts packages/client/tests/aiSettingsState.test.ts`

Expected: 全部 PASS。

- [ ] **Step 2: 运行项目级静态验证**

Run: `npm run typecheck && npm run lint`

Expected: TypeScript 与 ESLint 均成功。

- [ ] **Step 3: 运行项目全量测试**

Run: `npm test`

Expected: 全部测试 PASS；若存在基线已知失败，必须列出与 Task 1 基线的对比证据。

- [ ] **Step 4: 启动开发服务并验证设置页**

Run: `npm run dev:server`

Expected: 服务监听成功；使用浏览器打开设置页，确认模型目录失败不出现 fallback ID、手动输入仍可用、思考深度包含 Max 且说明随 provider 变化。

- [ ] **Step 5: 执行受控第三方闭环冒烟**

使用不含真实密钥的本地受控 OpenAI 与 Anthropic 测试服务，依次验证模型目录、连接测试和一次 AI 玩家决策请求；确认请求中的模型 ID 来自上游目录，OpenAI `max` 原样发送，Anthropic `max` 为 8192。

- [ ] **Step 6: 复查变更边界**

Run: `git diff -- packages/shared/src/domain/settings.ts packages/server/src/config.ts packages/server/src/core packages/server/src/gateway/http.ts packages/server/src/app.ts packages/server/tests packages/client/src/app/ai-settings packages/client/tests/aiSettingsState.test.ts docs/superpowers`

Expected: 只包含本计划相关改动；不执行提交，等待用户明确要求后再提交。
