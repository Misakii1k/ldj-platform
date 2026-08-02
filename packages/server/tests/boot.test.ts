import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, redact } from '../src/boot/logger.ts';
import { RateLimiter } from '../src/gateway/rateLimit.ts';
import { isOriginAllowed } from '../src/gateway/ws.ts';
import { loadConfig } from '../src/config.ts';

test('loadConfig 接受 max 并拒绝非法 LLM 配置', () => {
  assert.equal(loadConfig({ LLM_THINKING_DEPTH: 'max' }).llm.thinkingDepth, 'max');
  assert.equal(loadConfig({ LLM_THINKING_DEPTH: '8192' }).llm.thinkingDepth, 'max');
  assert.throws(() => loadConfig({ LLM_THINKING_DEPTH: 'deep' }), /思考深度/);
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'other' }), /服务商/);
});

test('loadConfig 规范化 Base URL 并拒绝凭据、query 和 hash', () => {
  assert.equal(loadConfig({ LLM_BASE_URL: ' https://api.example.com/proxy/v1/// ' }).llm.baseUrl, 'https://api.example.com/proxy/v1');
  for (const baseUrl of [
    'https://user:pass@api.example.com/v1',
    'https://api.example.com/v1?token=secret',
    'https://api.example.com/v1#fragment',
  ]) {
    assert.throws(() => loadConfig({ LLM_BASE_URL: baseUrl }), /Base URL/);
  }
});

test('loadConfig 严格解析私网上游开关', () => {
  assert.equal(loadConfig({}).allowPrivateLlmUpstream, false);
  assert.equal(loadConfig({ LLM_ALLOW_PRIVATE_NETWORK: 'true' }).allowPrivateLlmUpstream, true);
  assert.equal(loadConfig({ LLM_ALLOW_PRIVATE_NETWORK: 'false' }).allowPrivateLlmUpstream, false);
  assert.throws(() => loadConfig({ LLM_ALLOW_PRIVATE_NETWORK: '1' }), /私网上游/);
  assert.throws(() => loadConfig({ LLM_ALLOW_PRIVATE_NETWORK: 'TRUE' }), /私网上游/);
  assert.throws(() => loadConfig({ LLM_ALLOW_PRIVATE_NETWORK: '' }), /私网上游/);
});

test('redact：敏感键脱敏（SEC-009）', () => {
  const input = {
    password: 'p@ss',
    resumeToken: 'tok',
    civilianWord: '苹果',
    undercoverWord: '梨',
    seed: 'abc',
    snapshotJson: '{...}',
    nested: { roomPassword: 'x', ok: 'visible' },
    requestId: 'req-1',
  };
  const out = redact(input) as Record<string, unknown>;
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.resumeToken, '[REDACTED]');
  assert.equal(out.civilianWord, '[REDACTED]');
  assert.equal(out.undercoverWord, '[REDACTED]');
  assert.equal(out.seed, '[REDACTED]');
  assert.equal(out.snapshotJson, '[REDACTED]');
  assert.equal((out.nested as Record<string, unknown>).roomPassword, '[REDACTED]');
  assert.equal((out.nested as Record<string, unknown>).ok, 'visible');
  assert.equal(out.requestId, 'req-1');
});

test('createLogger：JSON 结构、级别过滤、child 绑定', () => {
  const lines: string[] = [];
  const logger = createLogger('info', { app: 'test' }, (l) => lines.push(l));

  logger.debug('should_be_filtered');
  logger.info('hello', { roomId: 'r1', password: 'leak' });
  const child = logger.child({ connectionId: 'c1' });
  child.warn('child_event');

  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]!);
  assert.equal(first.event, 'hello');
  assert.equal(first.app, 'test');
  assert.equal(first.roomId, 'r1');
  assert.equal(first.password, '[REDACTED]');
  const second = JSON.parse(lines[1]!);
  assert.equal(second.connectionId, 'c1');
  assert.equal(second.level, 'warn');
});

test('RateLimiter：窗口内限额与恢复', () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
  const t0 = 100_000;
  assert.equal(limiter.tryAcquire('k', t0).ok, true);
  assert.equal(limiter.tryAcquire('k', t0 + 10).ok, true);
  assert.equal(limiter.tryAcquire('k', t0 + 20).ok, true);

  const rejected = limiter.tryAcquire('k', t0 + 30);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.ok(rejected.retryAfterMs > 0 && rejected.retryAfterMs <= 1000);
  }

  // 其他 key 不受影响
  assert.equal(limiter.tryAcquire('other', t0 + 30).ok, true);
  // 窗口滚动后恢复
  assert.equal(limiter.tryAcquire('k', t0 + 1000).ok, true);
});

test('isOriginAllowed：同源放行、跨源拒绝、白名单例外', () => {
  // 浏览器同源（Origin host == Host header）
  assert.equal(isOriginAllowed('http://192.168.1.5:8080', '192.168.1.5:8080', []), true);
  // 跨源拒绝
  assert.equal(isOriginAllowed('http://evil.example', '192.168.1.5:8080', []), false);
  // 显式白名单（开发模式）
  assert.equal(
    isOriginAllowed('http://localhost:5173', '192.168.1.5:8080', ['http://localhost:5173']),
    true,
  );
  // 非浏览器客户端（无 Origin）放行
  assert.equal(isOriginAllowed(undefined, '192.168.1.5:8080', []), true);
  // 垃圾 Origin 拒绝
  assert.equal(isOriginAllowed('not-a-url', '192.168.1.5:8080', []), false);
});
