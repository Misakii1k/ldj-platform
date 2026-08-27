import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelRequestBody,
  modelCatalogErrorMessage,
  createConfigFingerprint,
  diagnosticErrorMessage,
  markDiagnosticStale,
  normalizeBaseUrl,
  thinkingDepthDescription,
  type AiDiagnosticErrorCode,
  type AiDiagnosticState,
  type AiSettingsForm,
} from '../src/app/ai-settings/aiSettingsState.ts';

const form: AiSettingsForm = {
  provider: 'openai',
  baseUrl: ' https://api.example.com/v1/// ',
  apiKey: '',
  clearApiKey: false,
  model: 'model-a',
  thinkingDepth: 'off',
  timeoutMs: 20000,
};

test('ai settings state：模型目录请求不携带思考深度', () => {
  assert.deepEqual(buildModelRequestBody(form), {
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
  });
  assert.deepEqual(buildModelRequestBody({ ...form, thinkingDepth: 'high', apiKey: ' secret ' }), {
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'secret',
  });
});

test('ai settings state：模型目录结构化错误使用安全提示', () => {
  assert.match(modelCatalogErrorMessage('MODEL_CATALOG_NOT_FOUND'), /目录|手动输入/);
  assert.match(modelCatalogErrorMessage('AUTH_FAILED'), /密钥|权限/);
  assert.equal(modelCatalogErrorMessage({ message: 'secret upstream body' }), '获取模型目录失败，请检查配置后重试');
});

test('ai settings state：Max 说明随 provider 变化', () => {
  assert.match(thinkingDepthDescription('openai'), /reasoning_effort=max/);
  assert.match(thinkingDepthDescription('anthropic'), /8192/);
});

test('ai settings state：规范化 Base URL 的空白和末尾斜杠', () => {
  assert.equal(normalizeBaseUrl(' https://api.example.com/v1/// '), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('https://api.example.com/'), 'https://api.example.com');
  assert.equal(normalizeBaseUrl('   '), '');
});

test('ai settings state：省略协议头时补全 https', () => {
  assert.equal(normalizeBaseUrl('api.example.com/v1'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl(' api.anthropic.com '), 'https://api.anthropic.com');
});

test('ai settings state：关键字段指纹对等价表单保持稳定', () => {
  const first = createConfigFingerprint(form);
  const equivalent = createConfigFingerprint({
    ...form,
    baseUrl: 'https://api.example.com/v1',
  });
  assert.equal(first, equivalent);
});

test('ai settings state：关键字段变化会改变指纹', () => {
  const initial = createConfigFingerprint(form);
  const variants: AiSettingsForm[] = [
    { ...form, provider: 'anthropic' },
    { ...form, baseUrl: 'https://api.example.com/v2' },
    { ...form, model: 'model-b' },
    { ...form, thinkingDepth: 'high' },
    { ...form, timeoutMs: 30000 },
    { ...form, apiKey: 'new-secret' },
    { ...form, clearApiKey: true },
  ];
  for (const variant of variants) {
    assert.notEqual(createConfigFingerprint(variant), initial);
  }
  assert.notEqual(
    createConfigFingerprint({ ...form, thinkingDepth: 'max' }),
    createConfigFingerprint(form),
  );
});

test('ai settings state：指纹只记录新密钥输入状态，不包含或区分原文', () => {
  const first = createConfigFingerprint({ ...form, apiKey: 'secret-one' });
  const second = createConfigFingerprint({ ...form, apiKey: 'secret-two' });
  assert.equal(first, second);
  assert.equal(first.includes('secret-one'), false);
  assert.equal(second.includes('secret-two'), false);
});

test('ai settings state：诊断关键配置变化后转为 stale', () => {
  const fingerprint = createConfigFingerprint(form);
  const states: AiDiagnosticState[] = [
    {
      status: 'success',
      fingerprint,
      provider: 'openai',
      model: 'model-a',
      elapsedMs: 120,
      usedSavedApiKey: true,
      message: '模型响应正常',
    },
    {
      status: 'error',
      fingerprint,
      code: 'AUTH_FAILED',
      message: '认证失败',
    },
  ];
  const changedFingerprint = createConfigFingerprint({ ...form, model: 'model-b' });
  for (const state of states) {
    const stale = markDiagnosticStale(state, changedFingerprint);
    assert.equal(stale.status, 'stale');
    if (stale.status === 'stale') assert.deepEqual(stale.previous, state);
  }
});

test('ai settings state：测试期间配置变化会取消测试状态', () => {
  const fingerprint = createConfigFingerprint(form);
  const changedFingerprint = createConfigFingerprint({ ...form, model: 'model-b' });
  assert.deepEqual(
    markDiagnosticStale({ status: 'testing', fingerprint }, changedFingerprint),
    { status: 'idle' },
  );
});

test('ai settings state：诊断关键配置未变化时保持原状态', () => {
  const fingerprint = createConfigFingerprint(form);
  const state: AiDiagnosticState = {
    status: 'success',
    fingerprint,
    provider: 'openai',
    model: 'model-a',
    elapsedMs: 120,
    usedSavedApiKey: false,
    message: '模型响应正常',
  };
  assert.equal(markDiagnosticStale(state, fingerprint), state);
  const idle: AiDiagnosticState = { status: 'idle' };
  assert.equal(markDiagnosticStale(idle, fingerprint), idle);
});

test('ai settings state：七类诊断错误均提供明确建议', () => {
  const codes: AiDiagnosticErrorCode[] = [
    'INVALID_CONFIG',
    'AUTH_FAILED',
    'MODEL_NOT_FOUND',
    'RATE_LIMITED',
    'UPSTREAM_TIMEOUT',
    'UPSTREAM_UNAVAILABLE',
    'INVALID_RESPONSE',
  ];
  for (const code of codes) {
    const message = diagnosticErrorMessage(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length >= 8);
  }
  assert.match(diagnosticErrorMessage('AUTH_FAILED'), /密钥|权限/);
  assert.match(diagnosticErrorMessage('MODEL_NOT_FOUND'), /模型/);
  assert.match(diagnosticErrorMessage('RATE_LIMITED'), /稍后|频繁/);
});

test('ai settings state：非法诊断错误响应回退为安全提示', () => {
  assert.equal(diagnosticErrorMessage('UNKNOWN'), '连接测试失败，请检查配置后重试');
  assert.equal(diagnosticErrorMessage(null), '连接测试失败，请检查配置后重试');
  assert.equal(diagnosticErrorMessage({ message: 'secret upstream body' }), '连接测试失败，请检查配置后重试');
});
