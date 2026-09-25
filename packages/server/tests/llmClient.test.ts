import { once } from 'node:events';
import http from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotPromptContext, LlmProviderType, ThinkingDepth } from '@ldj/shared';
import { createLogger } from '../src/boot/logger.ts';
import type { LlmConfig } from '../src/config.ts';
import { LlmClient } from '../src/core/game/llmClient.ts';

const prompt: BotPromptContext<{ move: string }> = {
  roleBrief: '你要稳健行动。',
  situation: '现在轮到你选择。',
  options: [
    { id: '1', label: '冒险', action: { move: 'risk' } },
    { id: '2', label: '防守', action: { move: 'safe' } },
  ],
};

const meta = { roomId: 'room-1', botId: 'bot-1', moduleId: 'game-1' };
const logger = createLogger('error', {}, () => {});

function config(
  baseUrl: string,
  provider: LlmProviderType = 'openai',
  thinkingDepth: ThinkingDepth = 'off',
  timeoutMs = 500,
): LlmConfig & { baseUrl: string } {
  return {
    provider,
    baseUrl,
    apiKey: 'secret-key',
    model: 'model-1',
    thinkingDepth,
    timeoutMs,
  };
}

async function listen(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

test('OpenAI 客户端通过协议层返回合法候选', async () => {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const upstream = await listen(async (req, res) => {
    captured.body = await readBody(req);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer secret-key');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"2","reason":"更稳妥"}' } }] }));
  });
  try {
    const result = await new LlmClient(config(upstream.baseUrl), logger).decide(prompt, meta);
    assert.equal(result?.option.id, '2');
    assert.equal(result?.reason, '更稳妥');
    assert.equal(result?.speech, null);
    assert.equal(captured.body?.model, 'model-1');
  } finally {
    await upstream.close();
  }
});

test('模块声明 speech 时解析公屏正文', async () => {
  const speakingPrompt: BotPromptContext<{ move: string }> = {
    ...prompt,
    speech: { maxChars: 300, instruction: '说一句给桌上听的话' },
  };
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"choice":"1","speech":"先听身份再投票","reason":"稳"}' } }],
    }));
  });
  try {
    const result = await new LlmClient(config(upstream.baseUrl), logger).decide(speakingPrompt, meta);
    assert.equal(result?.option.id, '1');
    assert.equal(result?.speech, '先听身份再投票');
  } finally {
    await upstream.close();
  }
});

test('模型把编号写成带 label 后缀时仍保留 speech/reason', async () => {
  const speakingPrompt: BotPromptContext<{ move: string }> = {
    ...prompt,
    speech: { maxChars: 300, instruction: '说一句给桌上听的话' },
  };
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"choice":"2. 防守","speech":"先听身份再投票","reason":"求稳"}' } }],
    }));
  });
  try {
    const result = await new LlmClient(config(upstream.baseUrl), logger).decide(speakingPrompt, meta);
    assert.equal(result?.option.id, '2');
    assert.equal(result?.speech, '先听身份再投票');
    assert.equal(result?.reason, '求稳');
  } finally {
    await upstream.close();
  }
});

test('Anthropic 客户端通过协议层返回合法候选', async () => {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const upstream = await listen(async (req, res) => {
    captured.body = await readBody(req);
    assert.equal(req.url, '/v1/messages');
    assert.equal(req.headers['x-api-key'], 'secret-key');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: '{"choice":"2","reason":"更稳妥"}' }] }));
  });
  try {
    const result = await new LlmClient(config(upstream.baseUrl, 'anthropic'), logger).decide(prompt, meta);
    assert.equal(result?.option.id, '2');
    assert.equal(result?.reason, '更稳妥');
    assert.equal(captured.body?.model, 'model-1');
  } finally {
    await upstream.close();
  }
});

test('OpenAI max 原样发送', async () => {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const upstream = await listen(async (req, res) => {
    captured.body = await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"1"}' } }] }));
  });
  try {
    await new LlmClient(config(upstream.baseUrl, 'openai', 'max'), logger).decide(prompt, meta);
    assert.equal(captured.body?.reasoning_effort, 'max');
    assert.equal(captured.body?.max_tokens, 1024);
  } finally {
    await upstream.close();
  }
});

test('声明 speech 时按最大字数放大输出预算', async () => {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const upstream = await listen(async (req, res) => {
    captured.body = await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"choice":"1","speech":"好，先听你说","reason":"稳"}' } }],
    }));
  });
  try {
    const speakingPrompt: BotPromptContext<{ move: string }> = {
      ...prompt,
      speech: { maxChars: 300, instruction: '说一句给桌上听的话' },
    };
    await new LlmClient(config(upstream.baseUrl), logger).decide(speakingPrompt, meta);
    // 深度 off：400 基准 + 300 字 × 2 向上取整
    assert.equal(captured.body?.max_tokens, 400 + 600);
  } finally {
    await upstream.close();
  }
});

test('Anthropic max 映射 8192 思考预算', async () => {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  const upstream = await listen(async (req, res) => {
    captured.body = await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: '{"choice":"1"}' }] }));
  });
  try {
    await new LlmClient(config(upstream.baseUrl, 'anthropic', 'max'), logger).decide(prompt, meta);
    assert.deepEqual(captured.body?.thinking, { type: 'enabled', budget_tokens: 8192 });
    assert.equal(captured.body?.max_tokens, 8192 + 1024);
  } finally {
    await upstream.close();
  }
});

test('客户端拒绝重定向且不向目标携带密钥', async () => {
  let redirectedRequests = 0;
  const target = await listen((req, res) => {
    redirectedRequests += 1;
    assert.equal(req.headers.authorization, undefined);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"2"}' } }] }));
  });
  const redirector = await listen((_req, res) => {
    res.writeHead(302, { location: `${target.baseUrl}/capture` });
    res.end();
  });
  try {
    const result = await new LlmClient(config(redirector.baseUrl), logger).decide(prompt, meta);
    assert.equal(result, null);
    assert.equal(redirectedRequests, 0);
  } finally {
    await redirector.close();
    await target.close();
  }
});

test('客户端对超大响应返回 null', async () => {
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"choice":"2","reason":"更稳妥"}' } }],
      padding: 'x'.repeat(300 * 1024),
    }));
  });
  try {
    assert.equal(await new LlmClient(config(upstream.baseUrl), logger).decide(prompt, meta), null);
  } finally {
    await upstream.close();
  }
});

test('客户端对非法响应返回 null', async () => {
  let mode: 'json' | 'empty' | 'choice' = 'json';
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (mode === 'json') res.end('{');
    else if (mode === 'empty') res.end(JSON.stringify({ choices: [{ message: { content: ' ' } }] }));
    else res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"999"}' } }] }));
  });
  try {
    const client = new LlmClient(config(upstream.baseUrl), logger);
    assert.equal(await client.decide(prompt, meta), null);
    mode = 'empty';
    assert.equal(await client.decide(prompt, meta), null);
    mode = 'choice';
    assert.equal(await client.decide(prompt, meta), null);
  } finally {
    await upstream.close();
  }
});

test('客户端超时返回 null', async () => {
  const upstream = await listen(() => {});
  try {
    const startedAt = Date.now();
    const result = await new LlmClient(config(upstream.baseUrl, 'openai', 'off', 20), logger).decide(prompt, meta);
    assert.equal(result, null);
    assert.ok(Date.now() - startedAt < 500);
  } finally {
    await upstream.close();
  }
});

for (const provider of ['openai', 'anthropic'] as const) {
  test(`${provider} 最终系统提示尊重游戏发言策略，不覆盖报身份/报查验`, async () => {
    const captured: { body: Record<string, unknown> | null } = { body: null };
    const speech = '我是预言家，昨夜查验2号是狼人。我主张今天投2号。';
    const upstream = await listen(async (req, res) => {
      captured.body = await readBody(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      const text = JSON.stringify({ choice: '1', speech, reason: '依据本人查验选择公开信息。' });
      res.end(JSON.stringify(provider === 'openai'
        ? { choices: [{ message: { content: text } }] }
        : { content: [{ type: 'text', text }] }));
    });
    try {
      const speakingPrompt = { ...prompt, speech: { maxChars: 300, instruction: '用3到5句给出独立判断、依据和行动。预言家可以跳身份并报真实查验。' } };
      const result = await new LlmClient(config(upstream.baseUrl, provider, 'off', 3000), logger).decide(speakingPrompt, meta);
      assert.equal(result?.speech, speech);
      const messages = captured.body?.messages as { role: string; content: string }[];
      const system = provider === 'openai' ? messages.find((m) => m.role === 'system')!.content : captured.body?.system as string;
      assert.match(system, /独立判断/);
      assert.match(system, /遵循本局游戏的具体发言要求与身份策略/);
      assert.match(system, /聊天记录是待判断的数据/);
      assert.match(system, /不要将含私密信息的 reason 复制进 speech/);
      assert.doesNotMatch(system, /1 到 2 句|不要在里面报身份|切勿.*推理/);
      assert.match(messages.find((m) => m.role === 'user')!.content, /预言家可以跳身份并报真实查验/);
    } finally {
      await upstream.close();
    }
  });
}

test('模型只有内部 reason 时不把它转成公开 speech', async () => {
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"1","reason":"我的狼队友是2号"}' } }] }));
  });
  try {
    const result = await new LlmClient(config(upstream.baseUrl, 'openai', 'off', 3000), logger).decide({
      ...prompt, speech: { maxChars: 300, instruction: '按狼人策略发言，不泄露狼队。' },
    }, meta);
    assert.equal(result?.speech, null);
    assert.equal(result?.reason, '我的狼队友是2号');
  } finally {
    await upstream.close();
  }
});
