import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  fetchLlmModels,
  LlmModelCatalogError,
  type LlmModelCatalogErrorCode,
} from '../src/core/llmModelCatalog.ts';

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as { port: number }).port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function expectCatalogError(
  promise: Promise<unknown>,
  code: LlmModelCatalogErrorCode,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof LlmModelCatalogError);
    assert.equal(error.code, code);
    return true;
  });
}

test('模型目录按协议鉴权并过滤、去重真实模型 ID', async () => {
  const requests: Array<{ url: string; authorization?: string; apiKey?: string; version?: string }> = [];
  const server = http.createServer((req, res) => {
    requests.push({
      url: req.url ?? '',
      authorization: req.headers.authorization,
      apiKey: req.headers['x-api-key'] as string | undefined,
      version: req.headers['anthropic-version'] as string | undefined,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: [
        { id: ' model-a ' },
        { id: 'model-a' },
        { id: 'model-b' },
        { id: '' },
        { id: 'x'.repeat(129) },
        { id: 123 },
      ],
    }));
  });
  const port = await listen(server);
  try {
    const openai = await fetchLlmModels({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'openai-key',
    });
    const anthropic = await fetchLlmModels({
      provider: 'anthropic',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'anthropic-key',
    });
    assert.deepEqual(openai, ['model-a', 'model-b']);
    assert.deepEqual(anthropic, ['model-a', 'model-b']);
    assert.equal(requests[0]?.url, '/v1/models');
    assert.equal(requests[0]?.authorization, 'Bearer openai-key');
    assert.equal(requests[1]?.url, '/v1/models');
    assert.equal(requests[1]?.apiKey, 'anthropic-key');
    assert.equal(requests[1]?.version, '2023-06-01');
  } finally {
    await close(server);
  }
});

test('模型目录跟随标准分页并保留首次出现顺序', async () => {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (paths.length === 1) {
      res.end(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }], next: '/v1/models?page=2' }));
    } else {
      res.end(JSON.stringify({ data: [{ id: 'b' }, { id: 'c' }] }));
    }
  });
  const port = await listen(server);
  try {
    const models = await fetchLlmModels({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: null,
    });
    assert.deepEqual(models, ['a', 'b', 'c']);
    assert.deepEqual(paths, ['/v1/models', '/v1/models?page=2']);
  } finally {
    await close(server);
  }
});

test('模型目录拒绝跨初始源分页且不向目标泄露密钥', async () => {
  let leakedAuthorization: string | undefined;
  const target = http.createServer((req, res) => {
    leakedAuthorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'leaked-model' }] }));
  });
  const targetPort = await listen(target);
  const source = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: [{ id: 'model-a' }],
      next: `http://127.0.0.1:${targetPort}/v1/models?page=2`,
    }));
  });
  const sourcePort = await listen(source);
  try {
    await expectCatalogError(fetchLlmModels({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${sourcePort}`,
      apiKey: 'secret-key',
    }), 'INVALID_RESPONSE');
    assert.equal(leakedAuthorization, undefined);
  } finally {
    await close(source);
    await close(target);
  }
});

test('Anthropic 目录使用 last_id 分页', async () => {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(paths.length === 1
      ? JSON.stringify({ data: [{ id: 'claude-a' }], has_more: true, last_id: 'claude-a' })
      : JSON.stringify({ data: [{ id: 'claude-b' }], has_more: false }));
  });
  const port = await listen(server);
  try {
    const models = await fetchLlmModels({
      provider: 'anthropic',
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: null,
    });
    assert.deepEqual(models, ['claude-a', 'claude-b']);
    assert.deepEqual(paths, ['/v1/models', '/v1/models?after_id=claude-a']);
  } finally {
    await close(server);
  }
});

test('模型目录最多请求五页并最多返回五百个模型', async () => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    const page = requests++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: Array.from({ length: 120 }, (_, index) => ({ id: `model-${page}-${index}` })),
      next: `/v1/models?page=${page + 2}`,
    }));
  });
  const port = await listen(server);
  try {
    const models = await fetchLlmModels({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: null,
    });
    assert.equal(requests, 5);
    assert.equal(models.length, 500);
    assert.equal(models[499], 'model-4-19');
  } finally {
    await close(server);
  }
});

test('模型目录将上游状态映射为稳定错误码', async () => {
  let status = 401;
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
  const port = await listen(server);
  try {
    const cases = [
      [401, 'AUTH_FAILED'],
      [403, 'AUTH_FAILED'],
      [404, 'MODEL_CATALOG_NOT_FOUND'],
      [429, 'RATE_LIMITED'],
      [500, 'UPSTREAM_UNAVAILABLE'],
    ] as const;
    for (const [nextStatus, code] of cases) {
      status = nextStatus;
      await expectCatalogError(fetchLlmModels({
        provider: 'openai',
        baseUrl: `http://127.0.0.1:${port}`,
        apiKey: null,
      }), code);
    }
  } finally {
    await close(server);
  }
});

test('模型目录拒绝重定向、非法 JSON、非法结构和超大响应', async () => {
  let mode: 'redirect' | 'json' | 'shape' | 'large' = 'redirect';
  const server = http.createServer((_req, res) => {
    if (mode === 'redirect') {
      res.writeHead(302, { location: '/v1/models' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (mode === 'json') res.end('{');
    else if (mode === 'shape') res.end(JSON.stringify({ data: 'not-an-array' }));
    else res.end(JSON.stringify({ data: [{ id: 'x'.repeat(300 * 1024) }] }));
  });
  const port = await listen(server);
  try {
    for (const nextMode of ['redirect', 'json', 'shape', 'large'] as const) {
      mode = nextMode;
      await expectCatalogError(fetchLlmModels({
        provider: 'openai',
        baseUrl: `http://127.0.0.1:${port}`,
        apiKey: null,
      }), 'INVALID_RESPONSE');
    }
  } finally {
    await close(server);
  }
});

test('模型目录区分超时、网络失败、非法配置并传递私网策略', async () => {
  const server = http.createServer((_req, _res) => {});
  const port = await listen(server);
  try {
    await expectCatalogError(fetchLlmModels({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: null,
      timeoutMs: 20,
    }), 'UPSTREAM_TIMEOUT');
    await expectCatalogError(fetchLlmModels({
      provider: 'openai',
      baseUrl: 'http://bad host',
      apiKey: null,
    }), 'INVALID_CONFIG');
    for (const baseUrl of [
      'https://user:pass@example.com/v1',
      'https://example.com/v1?token=secret',
      'https://example.com/v1#fragment',
    ]) {
      await expectCatalogError(fetchLlmModels({
        provider: 'openai',
        baseUrl,
        apiKey: null,
      }), 'INVALID_CONFIG');
    }
    await expectCatalogError(fetchLlmModels({
      provider: 'openai',
      baseUrl: 'http://192.168.1.20:11434/v1',
      apiKey: null,
      timeoutMs: 20,
    }, undefined, { allowPrivateNetwork: true }), 'UPSTREAM_TIMEOUT');
  } finally {
    server.closeAllConnections();
    await close(server);
  }
});

test('模型目录在调用前已取消时不解析 DNS', async () => {
  const controller = new AbortController();
  controller.abort();
  let lookups = 0;
  await expectCatalogError(fetchLlmModels({
    provider: 'openai',
    baseUrl: 'http://cancelled.test/v1',
    apiKey: null,
  }, controller.signal, {
    lookup: async () => {
      lookups += 1;
      return [{ address: '127.0.0.1', family: 4 }];
    },
  }), 'UPSTREAM_TIMEOUT');
  assert.equal(lookups, 0);
});
