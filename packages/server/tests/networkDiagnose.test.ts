import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import { detectLanAddresses, buildEntryUrls } from '../src/boot/lan.ts';
import type { ServerConfig } from '../src/config.ts';

function testConfig(): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    publicBaseUrl: null,
    logLevel: 'error',
    allowedOrigins: ['http://allowed.example'],
    allowPrivateLlmUpstream: false,
    llm: { provider: 'openai', baseUrl: null, apiKey: null, model: 'test-model', thinkingDepth: 'off', timeoutMs: 5000 },
    adminToken: null,
  };
}

async function startApp(): Promise<App> {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(testConfig(), logger);
  await app.listen();
  return app;
}

test('网络探测：detectLanAddresses 能分类网卡类型', () => {
  const addrs = detectLanAddresses();
  assert.ok(Array.isArray(addrs));
  for (const a of addrs) {
    assert.ok(a.interfaceName);
    assert.ok(a.address);
    assert.ok(['hotspot', 'wifi', 'ethernet', 'other'].includes(a.type));
  }
});

test('网络探测：buildEntryUrls 包含 primaryType 与 qrTarget', () => {
  const urls = buildEntryUrls(8080, null);
  assert.ok(urls.local.includes(':8080'));
  assert.ok(['hotspot', 'wifi', 'local_only'].includes(urls.primaryType));
  assert.ok(urls.qrTarget);
});

test('HTTP 端点：/api/network/ping 返回 200 与 CORS 头', async () => {
  const app = await startApp();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port()}/api/network/ping`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const data = await res.json() as { status: string; timestamp: number };
    assert.equal(data.status, 'ok');
    assert.ok(typeof data.timestamp === 'number');
  } finally {
    await app.shutdown();
  }
});

test('HTTP 端点：/api/network/status 返回网络状态与连接数统计', async () => {
  const app = await startApp();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port()}/api/network/status`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const data = await res.json() as {
      local: string;
      lan: string[];
      qrTarget: string;
      primaryType: string;
      onlineClientCount: number;
    };
    assert.ok(data.local.includes(String(app.port())));
    assert.ok(['hotspot', 'wifi', 'local_only'].includes(data.primaryType));
    assert.equal(data.onlineClientCount, 0);
  } finally {
    await app.shutdown();
  }
});
