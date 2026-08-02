/**
 * HTTP 网关 /api/settings/llm 端点测试。
 *
 * 覆盖 GET（视图脱敏、HEAD 无 body）与 PUT（鉴权、body 校验、即时生效）全分支。
 * 走真实 HTTP 服务（绑定随机端口），用 createApp 装配以便测 WS welcome 热生效。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    publicBaseUrl: null,
    logLevel: 'error',
    allowedOrigins: [],
    allowPrivateLlmUpstream: false,
    llm: { provider: 'openai', baseUrl: null, apiKey: null, model: 'test-model', thinkingDepth: 'off', timeoutMs: 5000 },
    adminToken: null,
    ...overrides,
  };
}

async function startApp(overrides: Partial<ServerConfig> = {}): Promise<App> {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(makeConfig(overrides), logger);
  await app.listen();
  return app;
}

interface HttpResponse {
  status: number | undefined;
  body: unknown;
  headers: http.IncomingHttpHeaders;
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: string | object,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  const bodyStr =
    body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = http.request(
      {
        method,
        host: '127.0.0.1',
        port,
        path,
        headers: {
          'content-type': 'application/json',
          ...(bodyStr !== undefined
            ? { 'content-length': Buffer.byteLength(bodyStr).toString() }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = null;
          if (raw !== '') {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = raw;
            }
          }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/** 读 WS welcome 帧（第一条消息） */
function readWelcome(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 welcome 超时')), 4000);
    socket.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse((raw as Buffer).toString()) as Record<string, unknown>);
    });
    socket.once('error', reject);
  });
}

// ==================== GET /api/settings/llm ====================

test('GET /api/settings/llm 返回 200 且体不含 apiKey 字段（只含脱敏视图）', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'GET', '/api/settings/llm');
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown>;
    assert.equal('apiKey' in body, false, '视图不应包含 apiKey 字段');
    assert.ok('baseUrl' in body, '应包含 baseUrl');
    assert.ok('model' in body, '应包含 model');
    assert.ok('timeoutMs' in body, '应包含 timeoutMs');
    assert.ok('hasApiKey' in body, '应包含 hasApiKey');
    assert.ok('fromEnv' in body, '应包含 fromEnv');
  } finally {
    await app.shutdown();
  }
});

test('HEAD /api/settings/llm 返回 200 且无 body', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'HEAD', '/api/settings/llm');
    assert.equal(res.status, 200);
    assert.equal(res.body, null, 'HEAD 不应有 body');
  } finally {
    await app.shutdown();
  }
});

test('模型目录代理会复用已保存的 API Key', async () => {
  let authorization: string | undefined;
  const upstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'remote-model' }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => resolve());
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKey: 'saved-key',
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/models', {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    });
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown>;
    assert.deepEqual(body.models, ['remote-model']);
    assert.equal(body.source, 'remote');
    assert.equal(authorization, 'Bearer saved-key');
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('模型目录代理更换 baseUrl 时不复用已保存的 API Key', async () => {
  let authorization: string | undefined;
  const savedUpstream = http.createServer((_req, res) => res.end());
  const draftUpstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'remote-model' }] }));
  });
  for (const server of [savedUpstream, draftUpstream]) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  }
  const savedPort = (savedUpstream.address() as { port: number }).port;
  const draftPort = (draftUpstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${savedPort}/v1`,
      apiKey: 'saved-key',
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/models', {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${draftPort}/v1`,
    });
    assert.equal(res.status, 200);
    assert.equal(authorization, undefined);
  } finally {
    await app.shutdown();
    await Promise.all([savedUpstream, draftUpstream].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  }
});

test('模型目录代理拒绝重定向且限制上游响应大小', async () => {
  let targetAuthorization: string | undefined;
  const target = http.createServer((req, res) => {
    targetAuthorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'redirected-model' }] }));
  });
  await new Promise<void>((resolve, reject) => {
    target.once('error', reject);
    target.listen(0, '127.0.0.1', resolve);
  });
  const targetPort = (target.address() as { port: number }).port;
  let oversized = false;
  const upstream = http.createServer((_req, res) => {
    if (oversized) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'x'.repeat(1024 * 1024) }] }));
      return;
    }
    res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/v1/models` });
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKey: 'saved-key',
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    const redirected = await request(app.port(), 'POST', '/api/settings/llm/models', {});
    assert.equal(redirected.status, 502);
    assert.equal((redirected.body as Record<string, unknown>).error, 'INVALID_RESPONSE');
    assert.equal('models' in (redirected.body as Record<string, unknown>), false);
    assert.equal(targetAuthorization, undefined);
    oversized = true;
    const tooLarge = await request(app.port(), 'POST', '/api/settings/llm/models', {});
    assert.equal(tooLarge.status, 502);
    assert.equal((tooLarge.body as Record<string, unknown>).error, 'INVALID_RESPONSE');
    assert.equal('models' in (tooLarge.body as Record<string, unknown>), false);
  } finally {
    await app.shutdown();
    await Promise.all([upstream, target].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  }
});

test('模型目录代理返回结构化上游错误且不返回 fallback 模型', async () => {
  let status = 401;
  const upstream = http.createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKey: null,
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    const cases = [
      [401, 'AUTH_FAILED'],
      [404, 'MODEL_CATALOG_NOT_FOUND'],
      [429, 'RATE_LIMITED'],
    ] as const;
    for (const [nextStatus, code] of cases) {
      status = nextStatus;
      const response = await request(app.port(), 'POST', '/api/settings/llm/models', {});
      assert.equal(response.status, 502);
      assert.equal((response.body as Record<string, unknown>).error, code);
      assert.equal('models' in (response.body as Record<string, unknown>), false);
    }
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('模型目录代理沿用设置写入接口的管理员鉴权', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'remote-model' }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => resolve());
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    adminToken: 'secret',
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKey: null,
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    const denied = await request(app.port(), 'POST', '/api/settings/llm/models', {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    });
    assert.equal(denied.status, 403);

    const allowed = await request(
      app.port(),
      'POST',
      '/api/settings/llm/models',
      { provider: 'openai', baseUrl: `http://127.0.0.1:${upstreamPort}/v1` },
      { 'x-admin-token': 'secret' },
    );
    assert.equal(allowed.status, 200);
    assert.equal((allowed.body as Record<string, unknown>).source, 'remote');
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

// ==================== PUT /api/settings/llm ====================

test('设置写入、模型与诊断接口拒绝跨源 Origin', async () => {
  const app = await startApp();
  try {
    const cases = [
      ['PUT', '/api/settings/llm'],
      ['POST', '/api/settings/llm/models'],
      ['POST', '/api/settings/llm/test'],
    ] as const;
    for (const [method, path] of cases) {
      const res = await request(app.port(), method, path, {}, { origin: 'http://evil.example' });
      assert.equal(res.status, 403, path);
      assert.equal((res.body as Record<string, unknown>).error, 'FORBIDDEN');
    }
  } finally {
    await app.shutdown();
  }
});

test('设置写入、模型与诊断接口拒绝非 application/json 请求', async () => {
  const app = await startApp();
  try {
    const cases = [
      ['PUT', '/api/settings/llm'],
      ['POST', '/api/settings/llm/models'],
      ['POST', '/api/settings/llm/test'],
    ] as const;
    for (const [method, path] of cases) {
      const res = await request(app.port(), method, path, '{}', { 'content-type': 'text/plain' });
      assert.equal(res.status, 415, path);
      assert.equal((res.body as Record<string, unknown>).error, 'UNSUPPORTED_MEDIA_TYPE');
    }
  } finally {
    await app.shutdown();
  }
});

test('设置写入、模型与诊断接口接受同源 Origin 和带参数的 application/json', async () => {
  const app = await startApp();
  try {
    const origin = `http://127.0.0.1:${app.port()}`;
    const write = await request(app.port(), 'PUT', '/api/settings/llm', {}, { origin, 'content-type': 'application/json; charset=utf-8' });
    assert.equal(write.status, 200);
    const models = await request(app.port(), 'POST', '/api/settings/llm/models', {}, { origin, 'content-type': 'application/json; charset=utf-8' });
    assert.equal(models.status, 400);
    assert.equal((models.body as Record<string, unknown>).error, 'INVALID_SETTINGS');
    const diagnostic = await request(app.port(), 'POST', '/api/settings/llm/test', {}, { origin, 'content-type': 'application/json; charset=utf-8' });
    assert.equal(diagnostic.status, 400);
    assert.equal((diagnostic.body as Record<string, unknown>).error, 'INVALID_CONFIG');
  } finally {
    await app.shutdown();
  }
});

test('PUT 本机无口令：成功 200，返回脱敏视图', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'PUT', '/api/settings/llm', {
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen',
      timeoutMs: 30000,
    });
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown>;
    assert.equal('apiKey' in body, false, '返回视图不应含 apiKey');
    assert.equal(body.baseUrl, 'http://127.0.0.1:11434/v1');
    assert.equal(body.model, 'qwen');
    assert.equal(body.timeoutMs, 30000);
  } finally {
    await app.shutdown();
  }
});

test('PUT 更换连接且未提交新密钥时清除服务端旧密钥', async () => {
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: 'https://old.example/v1',
      apiKey: null,
      model: 'test-model',
      thinkingDepth: 'off',
      timeoutMs: 5000,
    },
  });
  try {
    await request(app.port(), 'PUT', '/api/settings/llm', { apiKey: 'old-key' });
    const res = await request(app.port(), 'PUT', '/api/settings/llm', {
      provider: 'anthropic',
      baseUrl: 'https://new.example/v1',
    });
    assert.equal(res.status, 200);
    assert.equal((res.body as Record<string, unknown>).hasApiKey, false);
  } finally {
    await app.shutdown();
  }
});

test('PUT 拒绝携带凭据、query 或 hash 的 Base URL', async () => {
  const app = await startApp();
  try {
    for (const baseUrl of [
      'https://user:pass@api.example.com/v1',
      'https://api.example.com/v1?token=secret',
      'https://api.example.com/v1#fragment',
    ]) {
      const res = await request(app.port(), 'PUT', '/api/settings/llm', { baseUrl });
      assert.equal(res.status, 400, baseUrl);
      assert.equal((res.body as Record<string, unknown>).error, 'INVALID_SETTINGS');
    }
  } finally {
    await app.shutdown();
  }
});

test('PUT 改完后即时生效：新 WS 连接的 welcome.llmAvailable 反映新配置', async () => {
  // 默认 baseUrl=null → llm 未启用
  const app = await startApp();
  try {
    // 起初：welcome.llmAvailable = false
    {
      const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
      const welcome = await readWelcome(socket);
      const payload = welcome.payload as Record<string, unknown>;
      assert.equal(payload.llmAvailable, false, '未配置 baseUrl 时 llmAvailable 应为 false');
      socket.close();
    }

    // PUT 修改 baseUrl
    const res = await request(app.port(), 'PUT', '/api/settings/llm', {
      baseUrl: 'http://127.0.0.1:9999/v1',
    });
    assert.equal(res.status, 200);

    // 新 WS 连接：welcome.llmAvailable = true（LlmProvider 热生效）
    {
      const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
      const welcome = await readWelcome(socket);
      const payload = welcome.payload as Record<string, unknown>;
      assert.equal(payload.llmAvailable, true, '改完 baseUrl 后新连接应看到 llmAvailable=true');
      socket.close();
    }
  } finally {
    await app.shutdown();
  }
});

test('PUT 设了 ADMIN_TOKEN + 未带口令 → 403 + FORBIDDEN（同时覆盖非本机场景）', async () => {
  // 设 ADMIN_TOKEN 后，无论本机/远端，没带口令就拒绝；
  // 这等价于"非本机 + 未设 ADMIN_TOKEN → 403"的远端场景（远端 IP 难以模拟）。
  const app = await startApp({ adminToken: 'secret' });
  try {
    const res = await request(app.port(), 'PUT', '/api/settings/llm', {
      baseUrl: 'http://127.0.0.1:11434/v1',
    });
    assert.equal(res.status, 403);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'FORBIDDEN');
  } finally {
    await app.shutdown();
  }
});

test('PUT 设了 ADMIN_TOKEN + 错带口令 → 403 + FORBIDDEN', async () => {
  const app = await startApp({ adminToken: 'secret' });
  try {
    const res = await request(
      app.port(),
      'PUT',
      '/api/settings/llm',
      { baseUrl: 'http://127.0.0.1:11434/v1' },
      { 'x-admin-token': 'wrong' },
    );
    assert.equal(res.status, 403);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'FORBIDDEN');
  } finally {
    await app.shutdown();
  }
});

test('PUT 设了 ADMIN_TOKEN + 正确带口令 → 200', async () => {
  const app = await startApp({ adminToken: 'secret' });
  try {
    const res = await request(
      app.port(),
      'PUT',
      '/api/settings/llm',
      { baseUrl: 'http://127.0.0.1:11434/v1' },
      { 'x-admin-token': 'secret' },
    );
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.baseUrl, 'http://127.0.0.1:11434/v1');
  } finally {
    await app.shutdown();
  }
});

test('PUT 坏 JSON → 400 + INVALID_JSON', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'PUT', '/api/settings/llm', 'not-json');
    assert.equal(res.status, 400);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'INVALID_JSON');
  } finally {
    await app.shutdown();
  }
});

test('PUT 超大 body（> 16 KiB）→ 413 + BODY_TOO_LARGE', async () => {
  const app = await startApp();
  try {
    const big = '{"x":"' + 'a'.repeat(20_000) + '"}';
    const res = await request(app.port(), 'PUT', '/api/settings/llm', big);
    assert.equal(res.status, 413);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'BODY_TOO_LARGE');
  } finally {
    await app.shutdown();
  }
});

test('PUT 未知键 → 400 + INVALID_SETTINGS', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'PUT', '/api/settings/llm', { unknownKey: 1 });
    assert.equal(res.status, 400);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'INVALID_SETTINGS');
  } finally {
    await app.shutdown();
  }
});

test('PUT 校验失败（非法 URL）→ 400 + INVALID_SETTINGS + 提示文案', async () => {
  const app = await startApp();
  try {
    const res = await request(app.port(), 'PUT', '/api/settings/llm', {
      baseUrl: 'not-a-url',
    });
    assert.equal(res.status, 400);
    const body = res.body as Record<string, unknown>;
    assert.equal(body.error, 'INVALID_SETTINGS');
    assert.ok(
      typeof body.message === 'string' && body.message.length > 0,
      '应包含提示文案',
    );
  } finally {
    await app.shutdown();
  }
});

test('POST /api/settings/llm/test 使用未保存配置并返回脱敏成功结果', async () => {
  let payload: Record<string, unknown> = {};
  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'PRIVATE_REPLY' } }] }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp();
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      model: 'draft-model',
      thinkingDepth: 'low',
      timeoutMs: 1000,
      apiKey: 'draft-key',
    });
    assert.equal(res.status, 200);
    assert.equal(payload.model, 'draft-model');
    assert.equal(payload.reasoning_effort, 'low');
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes('PRIVATE_REPLY'), false);
    assert.equal(serialized.includes('draft-key'), false);
    assert.deepEqual(Object.keys(res.body as Record<string, unknown>).sort(), ['elapsedMs', 'message', 'model', 'provider', 'status', 'usedSavedApiKey']);
    assert.equal((res.body as Record<string, unknown>).status, 'ok');
    assert.equal((res.body as Record<string, unknown>).usedSavedApiKey, false);
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('POST /api/settings/llm/test 沿用设置写入接口的管理员鉴权', async () => {
  const app = await startApp({ adminToken: 'secret' });
  try {
    const denied = await request(app.port(), 'POST', '/api/settings/llm/test', {});
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { error: 'FORBIDDEN', message: '管理口令不正确' });

    const allowed = await request(
      app.port(),
      'POST',
      '/api/settings/llm/test',
      { baseUrl: 'not-a-url' },
      { 'x-admin-token': 'secret' },
    );
    assert.equal(allowed.status, 400);
    assert.equal((allowed.body as Record<string, unknown>).error, 'INVALID_CONFIG');
  } finally {
    await app.shutdown();
  }
});

test('POST /api/settings/llm/test 未提供 apiKey 时复用已保存密钥', async () => {
  let authorization: string | undefined;
  const upstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'saved-key',
      model: 'saved-model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', {});
    assert.equal(res.status, 200);
    assert.equal(authorization, 'Bearer saved-key');
    assert.equal((res.body as Record<string, unknown>).status, 'ok');
    assert.equal((res.body as Record<string, unknown>).usedSavedApiKey, true);
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('POST /api/settings/llm/test 更换 provider 时不复用已保存密钥', async () => {
  let anthropicApiKey: string | undefined;
  const upstream = http.createServer((req, res) => {
    anthropicApiKey = req.headers['x-api-key'] as string | undefined;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'saved-key',
      model: 'saved-model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', { provider: 'anthropic' });
    assert.equal(res.status, 200);
    assert.equal(anthropicApiKey, undefined);
    assert.equal((res.body as Record<string, unknown>).usedSavedApiKey, false);
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('POST /api/settings/llm/test 更换 baseUrl 时不复用已保存密钥', async () => {
  let authorization: string | undefined;
  const savedUpstream = http.createServer((_req, res) => res.end());
  const draftUpstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  for (const server of [savedUpstream, draftUpstream]) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  }
  const savedPort = (savedUpstream.address() as { port: number }).port;
  const draftPort = (draftUpstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${savedPort}`,
      apiKey: 'saved-key',
      model: 'saved-model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', {
      baseUrl: `http://127.0.0.1:${draftPort}`,
    });
    assert.equal(res.status, 200);
    assert.equal(authorization, undefined);
    assert.equal((res.body as Record<string, unknown>).usedSavedApiKey, false);
  } finally {
    await app.shutdown();
    await Promise.all([savedUpstream, draftUpstream].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  }
});

test('POST /api/settings/llm/test 字符串 apiKey 替换已保存密钥', async () => {
  let authorization: string | undefined;
  const upstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'saved-key',
      model: 'saved-model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', { apiKey: 'replacement-key' });
    assert.equal(res.status, 200);
    assert.equal(authorization, 'Bearer replacement-key');
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('POST /api/settings/llm/test 显式 null apiKey 不使用已保存密钥', async () => {
  let authorization: string | undefined;
  const upstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp({
    llm: {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'saved-key',
      model: 'saved-model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    },
  });
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(authorization, undefined);
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('客户端断开设置代理请求后取消上游连接', async () => {
  for (const path of ['/api/settings/llm/test', '/api/settings/llm/models']) {
    let upstreamStartedResolve!: () => void;
    let upstreamClosedResolve!: () => void;
    const upstreamStarted = new Promise<void>((resolve) => { upstreamStartedResolve = resolve; });
    const upstreamClosed = new Promise<void>((resolve) => { upstreamClosedResolve = resolve; });
    const upstream = http.createServer((_req, res) => {
      upstreamStartedResolve();
      res.once('close', upstreamClosedResolve);
    });
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject);
      upstream.listen(0, '127.0.0.1', resolve);
    });
    const upstreamPort = (upstream.address() as { port: number }).port;
    const app = await startApp();
    try {
      const body = JSON.stringify({
        provider: 'openai',
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        model: 'model',
        thinkingDepth: 'off',
        timeoutMs: 5000,
      });
      const req = http.request({
        method: 'POST',
        host: '127.0.0.1',
        port: app.port(),
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      });
      req.on('error', () => {});
      req.end(body);
      await upstreamStarted;
      req.destroy();
      await Promise.race([
        upstreamClosed,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${path} 未取消上游连接`)), 500)),
      ]);
    } finally {
      await app.shutdown();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  }
});

test('POST /api/settings/llm/test 错误响应只包含 error 和 message', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'text/plain' });
    res.end('PRIVATE_UPSTREAM_ERROR');
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const app = await startApp();
  try {
    const res = await request(app.port(), 'POST', '/api/settings/llm/test', {
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'private-key',
      model: 'model',
      thinkingDepth: 'off',
      timeoutMs: 1000,
    });
    assert.equal(res.status, 502);
    assert.deepEqual(Object.keys(res.body as Record<string, unknown>).sort(), ['error', 'message']);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes('PRIVATE_UPSTREAM_ERROR'), false);
    assert.equal(serialized.includes('private-key'), false);
    assert.equal(serialized.includes('stack'), false);
  } finally {
    await app.shutdown();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
