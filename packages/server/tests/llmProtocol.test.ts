import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInferenceRequest,
  buildInferenceUrl,
  buildModelsHeaders,
  buildModelsUrl,
  extractText,
  parseModelPage,
  type LlmInferenceRequestInput,
} from '../src/core/llmProtocol.ts';

const inferenceInput = (
  provider: LlmInferenceRequestInput['provider'],
  thinkingDepth: LlmInferenceRequestInput['thinkingDepth'],
): LlmInferenceRequestInput => ({
  provider,
  model: 'model-1',
  apiKey: 'secret-key',
  thinkingDepth,
  system: 'System prompt',
  user: 'User prompt',
  maxOutputTokens: 300,
  temperature: 0.2,
});

test('协议端点规范化且不重复追加路径', () => {
  assert.equal(buildInferenceUrl('https://api.example.com/v1', 'openai'), 'https://api.example.com/v1/chat/completions');
  assert.equal(buildInferenceUrl('https://api.example.com/v1/chat/completions', 'openai'), 'https://api.example.com/v1/chat/completions');
  assert.equal(buildInferenceUrl('https://api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages');
  assert.equal(buildInferenceUrl('https://api.anthropic.com/v1/messages', 'anthropic'), 'https://api.anthropic.com/v1/messages');
  assert.equal(buildModelsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/models');
  assert.equal(buildModelsUrl('https://api.example.com/v1/models'), 'https://api.example.com/v1/models');
  assert.equal(buildInferenceUrl('https://api.example.com/proxy/v1/', 'openai'), 'https://api.example.com/proxy/v1/chat/completions');
  assert.equal(buildModelsUrl('https://api.example.com/proxy/v1/'), 'https://api.example.com/proxy/v1/models');
});

test('协议端点拒绝携带凭据、query 或 hash 的 Base URL', () => {
  for (const baseUrl of [
    'https://user:pass@api.example.com/v1',
    'https://api.example.com/v1?token=secret',
    'https://api.example.com/v1#fragment',
  ]) {
    assert.throws(() => buildInferenceUrl(baseUrl, 'openai'));
    assert.throws(() => buildModelsUrl(baseUrl));
  }
});

test('Base URL 支持省略协议头，且非 v1 版本路径不重复插入 /v1', () => {
  assert.equal(buildInferenceUrl('api.example.com/v1', 'openai'), 'https://api.example.com/v1/chat/completions');
  assert.equal(buildInferenceUrl('api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages');
  assert.equal(buildModelsUrl('api.example.com/v1'), 'https://api.example.com/v1/models');
  assert.equal(
    buildInferenceUrl('https://open.bigmodel.cn/api/paas/v4', 'openai'),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  );
  assert.equal(buildModelsUrl('https://open.bigmodel.cn/api/paas/v4'), 'https://open.bigmodel.cn/api/paas/v4/models');
  assert.equal(buildInferenceUrl('http://127.0.0.1:11434', 'openai'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.throws(() => buildInferenceUrl('api.example.com/v1?token=secret', 'openai'));
});

test('OpenAI reasoning 请求省略 temperature 并原样发送思考深度', () => {
  const request = buildInferenceRequest(inferenceInput('openai', 'max'));
  assert.deepEqual(request.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-key',
  });
  assert.deepEqual(request.body.messages, [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'User prompt' },
  ]);
  assert.equal(request.body.model, 'model-1');
  assert.equal(request.body.max_tokens, 300);
  assert.equal('temperature' in request.body, false);
  assert.equal(request.body.reasoning_effort, 'max');
});

test('Anthropic 请求使用原生鉴权、system 和 thinking 字段', () => {
  const request = buildInferenceRequest(inferenceInput('anthropic', 'max'));
  assert.deepEqual(request.headers, {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': 'secret-key',
  });
  assert.equal(request.body.system, 'System prompt');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'User prompt' }]);
  assert.deepEqual(request.body.thinking, { type: 'enabled', budget_tokens: 8192 });
  assert.equal(request.body.max_tokens, 8492);
  assert.equal('temperature' in request.body, false);
});

test('Anthropic 仅在关闭 thinking 时发送 temperature', () => {
  const request = buildInferenceRequest(inferenceInput('anthropic', 'off'));
  assert.equal(request.body.temperature, 0.2);
  assert.equal('thinking' in request.body, false);
});

test('关闭思考且无密钥时省略可选协议字段', () => {
  const openai = buildInferenceRequest({ ...inferenceInput('openai', 'off'), apiKey: null, system: undefined, temperature: undefined });
  const anthropic = buildInferenceRequest({ ...inferenceInput('anthropic', 'off'), apiKey: null, system: undefined, temperature: undefined });
  assert.equal('authorization' in openai.headers, false);
  assert.equal('reasoning_effort' in openai.body, false);
  assert.equal('x-api-key' in anthropic.headers, false);
  assert.equal('thinking' in anthropic.body, false);
  assert.equal('system' in anthropic.body, false);
  assert.equal(anthropic.body.max_tokens, 300);
});

test('模型目录鉴权与推理协议一致', () => {
  assert.deepEqual(buildModelsHeaders('openai', 'openai-key'), { authorization: 'Bearer openai-key' });
  assert.deepEqual(buildModelsHeaders('anthropic', 'anthropic-key'), {
    'anthropic-version': '2023-06-01',
    'x-api-key': 'anthropic-key',
  });
  assert.deepEqual(buildModelsHeaders('openai', null), {});
});

test('提取 OpenAI 与 Anthropic 文本并拒绝空正文', () => {
  assert.equal(extractText('openai', { choices: [{ message: { content: ' OK ' } }] }), 'OK');
  assert.equal(extractText('anthropic', { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: ' OK ' }] }), 'OK');
  assert.equal(extractText('openai', { choices: [{ message: { content: '   ' } }] }), null);
  assert.equal(extractText('anthropic', { content: [{ type: 'text', text: '' }] }), null);
  assert.equal(extractText('openai', null), null);
});

test('模型页过滤非法 ID、稳定去重并解析标准下一页', () => {
  const page = parseModelPage({
    data: [
      { id: ' model-a ' },
      { id: 'model-a' },
      { id: '' },
      { id: 'x'.repeat(129) },
      { id: 1 },
      { id: 'model-b' },
    ],
    next: ' https://api.example.com/v1/models?after=model-b ',
  });
  assert.deepEqual(page, {
    ids: ['model-a', 'model-b'],
    nextUrl: 'https://api.example.com/v1/models?after=model-b',
  });
  assert.equal(parseModelPage({ data: [], next_page: '/v1/models?page=2' }).nextUrl, '/v1/models?page=2');
});

test('Anthropic 模型页从 last_id 和 has_more 生成下一页指示', () => {
  assert.deepEqual(parseModelPage({
    data: [{ id: 'claude-a' }],
    has_more: true,
    last_id: 'claude-a',
  }), {
    ids: ['claude-a'],
    nextUrl: '?after_id=claude-a',
  });
  assert.equal(parseModelPage({ data: [{ id: 'claude-a' }], has_more: false, last_id: 'claude-a' }).nextUrl, null);
  assert.deepEqual(parseModelPage(null), { ids: [], nextUrl: null });
});
