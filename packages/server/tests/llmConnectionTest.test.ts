import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  LlmConnectionTestError,
  testLlmConnection,
  type LlmConnectionTestErrorCode,
  type LlmConnectionTestInput,
} from '../src/core/llmConnectionTest.ts';
import { safeFetch, validateUpstreamUrl } from '../src/core/safeUpstream.ts';

async function startUpstream(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function expectError(
  input: LlmConnectionTestInput,
  code: LlmConnectionTestErrorCode,
): Promise<LlmConnectionTestError> {
  try {
    await testLlmConnection(input);
    assert.fail(`应抛出 ${code}`);
  } catch (error) {
    assert.ok(error instanceof LlmConnectionTestError);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    return error;
  }
}

const validInput = (baseUrl: string): LlmConnectionTestInput => ({
  provider: 'openai',
  baseUrl,
  apiKey: null,
  model: 'model',
  thinkingDepth: 'off',
  timeoutMs: 1000,
});

test('OpenAI 使用 chat completions 完成最小诊断且不返回模型正文', async () => {
  let path = '';
  let authorization: string | undefined;
  let payload: Record<string, unknown> = {};
  const upstream = await startUpstream((req, res) => {
    path = req.url ?? '';
    authorization = req.headers.authorization;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'SECRET_UPSTREAM_TEXT' } }] }));
    });
  });
  try {
    const result = await testLlmConnection({
      provider: 'openai',
      baseUrl: `${upstream.baseUrl}/v1/`,
      apiKey: 'openai-key',
      model: 'gpt-test',
      thinkingDepth: 'low',
      timeoutMs: 1000,
    });
    assert.equal(path, '/v1/chat/completions');
    assert.equal(authorization, 'Bearer openai-key');
    assert.equal(payload.model, 'gpt-test');
    assert.equal(payload.max_tokens, 8);
    assert.equal(payload.reasoning_effort, 'low');
    assert.deepEqual(payload.messages, [{ role: 'user', content: 'Reply with only OK.' }]);
    assert.equal(result.provider, 'openai');
    assert.equal(result.model, 'gpt-test');
    assert.equal(result.message, '连接成功');
    assert.ok(result.elapsedMs >= 0);
    assert.equal(JSON.stringify(result).includes('SECRET_UPSTREAM_TEXT'), false);
  } finally {
    await upstream.close();
  }
});

test('Anthropic 使用 messages 完成最小诊断', async () => {
  let path = '';
  let apiKey: string | undefined;
  let version: string | undefined;
  let payload: Record<string, unknown> = {};
  const upstream = await startUpstream((req, res) => {
    path = req.url ?? '';
    apiKey = req.headers['x-api-key'] as string | undefined;
    version = req.headers['anthropic-version'] as string | undefined;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }));
    });
  });
  try {
    const result = await testLlmConnection({
      provider: 'anthropic',
      baseUrl: upstream.baseUrl,
      apiKey: 'anthropic-key',
      model: 'claude-test',
      thinkingDepth: 'medium',
      timeoutMs: 1000,
    });
    assert.equal(path, '/v1/messages');
    assert.equal(apiKey, 'anthropic-key');
    assert.equal(version, '2023-06-01');
    assert.equal(payload.model, 'claude-test');
    assert.equal(payload.max_tokens, 2348);
    assert.deepEqual(payload.thinking, { type: 'enabled', budget_tokens: 2048 });
    assert.deepEqual(payload.messages, [{ role: 'user', content: 'Reply with only OK.' }]);
    assert.equal(result.provider, 'anthropic');
    assert.equal(result.model, 'claude-test');
    assert.equal(result.message, '连接成功');
  } finally {
    await upstream.close();
  }
});

test('Anthropic max 思考深度映射为 8192 tokens', async () => {
  let payload: Record<string, unknown> = {};
  const upstream = await startUpstream((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }));
    });
  });
  try {
    await testLlmConnection({
      provider: 'anthropic',
      baseUrl: upstream.baseUrl,
      apiKey: null,
      model: 'claude-test',
      thinkingDepth: 'max',
      timeoutMs: 1000,
    });
    assert.deepEqual(payload.thinking, { type: 'enabled', budget_tokens: 8192 });
    assert.equal(payload.max_tokens, 8492);
  } finally {
    await upstream.close();
  }
});

test('OpenAI max 思考深度原样发送', async () => {
  let payload: Record<string, unknown> = {};
  const upstream = await startUpstream((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    });
  });
  try {
    await testLlmConnection({
      provider: 'openai',
      baseUrl: upstream.baseUrl,
      apiKey: null,
      model: 'gpt-test',
      thinkingDepth: 'max',
      timeoutMs: 1000,
    });
    assert.equal(payload.reasoning_effort, 'max');
  } finally {
    await upstream.close();
  }
});

test('非法 URL、空模型、非法思考深度和越界超时映射为 INVALID_CONFIG', async () => {
  const base = validInput('https://example.com/v1');
  await expectError({ ...base, baseUrl: 'ftp://example.com' }, 'INVALID_CONFIG');
  await expectError({ ...base, baseUrl: 'https://user:pass@example.com/v1' }, 'INVALID_CONFIG');
  await expectError({ ...base, baseUrl: 'https://example.com/v1?token=secret' }, 'INVALID_CONFIG');
  await expectError({ ...base, baseUrl: 'https://example.com/v1#fragment' }, 'INVALID_CONFIG');
  await expectError({ ...base, model: '   ' }, 'INVALID_CONFIG');
  await expectError({ ...base, thinkingDepth: 'invalid' as LlmConnectionTestInput['thinkingDepth'] }, 'INVALID_CONFIG');
  await expectError({ ...base, timeoutMs: 999 }, 'INVALID_CONFIG');
  await expectError({ ...base, timeoutMs: 120001 }, 'INVALID_CONFIG');
});

test('拒绝云元数据、未指定和私网地址但保留本地 Ollama', async () => {
  await expectError(validInput('http://169.254.169.254/latest/meta-data'), 'INVALID_CONFIG');
  await expectError(validInput('http://0.0.0.0:11434/v1'), 'INVALID_CONFIG');
  await expectError(validInput('http://192.168.1.20:11434/v1'), 'INVALID_CONFIG');

  const ollama = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  try {
    const result = await testLlmConnection(validInput(ollama.baseUrl));
    assert.equal(result.message, '连接成功');
  } finally {
    await ollama.close();
  }
});

test('显式私网策略允许 RFC1918 但始终拒绝敏感地址', async () => {
  await assert.doesNotReject(() => validateUpstreamUrl('http://127.0.0.1:11434/v1'));
  await assert.rejects(() => validateUpstreamUrl('http://192.168.1.20:11434/v1'));
  await assert.doesNotReject(() => validateUpstreamUrl('http://192.168.1.20:11434/v1', { allowPrivateNetwork: true }));
  await assert.doesNotReject(() => validateUpstreamUrl('http://[fd00::1]:11434/v1', { allowPrivateNetwork: true }));
  await assert.rejects(() => validateUpstreamUrl('http://169.254.169.254/latest/meta-data', { allowPrivateNetwork: true }));
  await assert.rejects(() => validateUpstreamUrl('http://0.0.0.0:11434/v1', { allowPrivateNetwork: true }));
  await assert.rejects(() => validateUpstreamUrl('http://user:password@127.0.0.1:11434/v1', { allowPrivateNetwork: true }));
});

test('IPv4-mapped IPv6 按映射后的 IPv4 地址执行安全策略', async () => {
  await assert.doesNotReject(() => validateUpstreamUrl('http://[::ffff:127.0.0.1]:11434/v1'));
  await assert.rejects(() => validateUpstreamUrl('http://[::ffff:192.168.1.20]:11434/v1'));
  await assert.doesNotReject(() => validateUpstreamUrl('http://[::ffff:c0a8:114]:11434/v1', { allowPrivateNetwork: true }));
  await assert.rejects(() => validateUpstreamUrl('http://[::ffff:a9fe:a9fe]/latest/meta-data', { allowPrivateNetwork: true }));
  await assert.rejects(() => validateUpstreamUrl('http://[::ffff:0.0.0.0]:11434/v1', { allowPrivateNetwork: true }));
});

test('拒绝 RFC6890 特殊用途 IPv4 地址', async () => {
  const addresses = [
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '240.0.0.1',
    '255.255.255.255',
  ];
  for (const address of addresses) {
    await assert.rejects(() => validateUpstreamUrl(`http://${address}/v1`, { allowPrivateNetwork: true }));
  }
});

test('安全请求只解析一次 DNS 并绑定已验证结果', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  const port = new URL(upstream.baseUrl).port;
  let lookups = 0;
  try {
    const response = await safeFetch(`http://upstream.test:${port}/v1`, {}, {
      lookup: async (hostname) => {
        lookups += 1;
        assert.equal(hostname, 'upstream.test');
        return [{ address: '127.0.0.1', family: 4 }];
      },
    });
    assert.equal(response.status, 200);
    assert.equal(lookups, 1);
  } finally {
    await upstream.close();
  }
});

test('连接诊断将 DNS 解析失败映射为上游不可用', async () => {
  await assert.rejects(
    () => testLlmConnection(validInput('http://dns-error.test/v1'), undefined, {
      lookup: async () => {
        throw new Error('dns failed');
      },
    }),
    (error: unknown) => error instanceof LlmConnectionTestError && error.code === 'UPSTREAM_UNAVAILABLE',
  );
});

test('连接诊断向地址校验传递显式私网策略', async () => {
  await assert.rejects(
    () => testLlmConnection(validInput('http://192.168.1.20:11434/v1')),
    (error: unknown) => error instanceof LlmConnectionTestError && error.code === 'INVALID_CONFIG',
  );
  await assert.rejects(
    () => testLlmConnection(
      validInput('http://192.168.1.20:1/v1'),
      undefined,
      { allowPrivateNetwork: true },
    ),
    (error: unknown) => error instanceof LlmConnectionTestError
      && (error.code === 'UPSTREAM_UNAVAILABLE' || error.code === 'UPSTREAM_TIMEOUT'),
  );
});

test('拒绝上游重定向且不向重定向目标发送密钥', async () => {
  let redirectedAuthorization: string | undefined;
  const target = await startUpstream((req, res) => {
    redirectedAuthorization = req.headers.authorization;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const redirector = await startUpstream((_req, res) => {
    res.writeHead(302, { location: `${target.baseUrl}/v1/chat/completions` });
    res.end();
  });
  try {
    await expectError({ ...validInput(redirector.baseUrl), apiKey: 'secret-key' }, 'INVALID_RESPONSE');
    assert.equal(redirectedAuthorization, undefined);
  } finally {
    await redirector.close();
    await target.close();
  }
});

test('401 和 403 映射为 AUTH_FAILED', async () => {
  for (const status of [401, 403]) {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(status, { 'content-type': 'text/plain' });
      res.end('upstream secret');
    });
    try {
      const error = await expectError({ ...validInput(upstream.baseUrl), apiKey: 'secret-key' }, 'AUTH_FAILED');
      assert.equal(error.message.includes('upstream secret'), false);
      assert.equal(error.message.includes('secret-key'), false);
    } finally {
      await upstream.close();
    }
  }
});

test('404 映射为 MODEL_NOT_FOUND', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  try {
    await expectError({ ...validInput(upstream.baseUrl), model: 'missing' }, 'MODEL_NOT_FOUND');
  } finally {
    await upstream.close();
  }
});

test('429 映射为 RATE_LIMITED', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(429);
    res.end();
  });
  try {
    await expectError(validInput(upstream.baseUrl), 'RATE_LIMITED');
  } finally {
    await upstream.close();
  }
});

test('请求超时映射为 UPSTREAM_TIMEOUT', async () => {
  const upstream = await startUpstream((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    }, 1100);
  });
  try {
    await expectError(validInput(upstream.baseUrl), 'UPSTREAM_TIMEOUT');
  } finally {
    await upstream.close();
  }
});

test('网络失败和其他上游状态映射为 UPSTREAM_UNAVAILABLE', async () => {
  const closed = await startUpstream((_req, res) => res.end());
  await closed.close();
  await expectError(validInput(closed.baseUrl), 'UPSTREAM_UNAVAILABLE');

  const unavailable = await startUpstream((_req, res) => {
    res.writeHead(503);
    res.end('private upstream details');
  });
  try {
    const error = await expectError(validInput(unavailable.baseUrl), 'UPSTREAM_UNAVAILABLE');
    assert.equal(error.message.includes('private upstream details'), false);
  } finally {
    await unavailable.close();
  }
});

test('非 JSON、缺少正文和空正文映射为 INVALID_RESPONSE', async () => {
  const responses = [
    'not-json',
    JSON.stringify({ choices: [] }),
    JSON.stringify({ choices: [{ message: { content: '' } }] }),
  ];
  for (const responseBody of responses) {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(responseBody);
    });
    try {
      await expectError(validInput(upstream.baseUrl), 'INVALID_RESPONSE');
    } finally {
      await upstream.close();
    }
  }
});

test('拒绝超过上限的上游响应', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(1024 * 1024) } }] }));
  });
  try {
    await expectError(validInput(upstream.baseUrl), 'INVALID_RESPONSE');
  } finally {
    await upstream.close();
  }
});
