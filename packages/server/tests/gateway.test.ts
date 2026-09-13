import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@ldj/shared';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
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

interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  roomSeq?: number;
  payload: Record<string, unknown>;
}

/** 打开 WS 连接并等待首条 welcome */
async function connect(app: App, origin?: string): Promise<{ socket: WebSocket; welcome: Envelope }> {
  const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`, origin ? { origin } : {});
  const [raw] = (await once(socket, 'message')) as [Buffer];
  return { socket, welcome: JSON.parse(raw.toString()) as Envelope };
}

/** 发送 envelope 并收取接下来 n 条消息 */
async function sendAndCollect(socket: WebSocket, data: string, n: number): Promise<Envelope[]> {
  const messages: Envelope[] = [];
  const done = new Promise<void>((resolvePromise) => {
    socket.on('message', (raw) => {
      messages.push(JSON.parse((raw as Buffer).toString()) as Envelope);
      if (messages.length >= n) resolvePromise();
    });
  });
  socket.send(data);
  await done;
  return messages;
}

test('健康检查：/health/live 与 /health/ready 返回 200，停机后 ready 变 503', async () => {
  const app = await startApp();
  try {
    const base = `http://127.0.0.1:${app.port()}`;
    const live = await fetch(`${base}/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok' });

    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await app.shutdown();
  }
});

test('静态托管：无构建产物时根路径返回占位页', async () => {
  const app = await startApp();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port()}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await res.text(), /局域网桌游平台/);

    const post = await fetch(`http://127.0.0.1:${app.port()}/`, { method: 'POST' });
    assert.equal(post.status, 405);
  } finally {
    await app.shutdown();
  }
});

test('WS：连接即收到 welcome（协议版本与 connectionId）', async () => {
  const app = await startApp();
  try {
    const { socket, welcome } = await connect(app);
    assert.equal(welcome.type, 'welcome');
    assert.equal(welcome.v, PROTOCOL_VERSION);
    assert.equal(welcome.payload.protocolVersion, PROTOCOL_VERSION);
    assert.match(String(welcome.payload.connectionId), /^c_/);
    socket.close();
  } finally {
    await app.shutdown();
  }
});

test('WS Origin 校验：跨源被拒（403），白名单与同源放行', async () => {
  const app = await startApp();
  try {
    // 跨源：握手应失败
    const bad = new WebSocket(`ws://127.0.0.1:${app.port()}/`, { origin: 'http://evil.example' });
    const [err] = (await once(bad, 'error')) as [Error];
    assert.match(err.message, /403/);

    // 白名单 Origin 放行
    const { socket: ok1 } = await connect(app, 'http://allowed.example');
    ok1.close();
    // 同源 Origin 放行
    const { socket: ok2 } = await connect(app, `http://127.0.0.1:${app.port()}`);
    ok2.close();
  } finally {
    await app.shutdown();
  }
});

test('WS create_room：无已批准游戏时明确拒绝且不创建房间', async () => {
  const app = await startApp();
  try {
    const { socket } = await connect(app);
    const envelope = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'create_room',
      requestId: 'req-gw-1',
      payload: { nickname: '房主' },
    });
    const [error] = await sendAndCollect(socket, envelope, 1);

    assert.equal(error!.type, 'error');
    assert.equal(error!.requestId, 'req-gw-1');
    assert.equal(error!.payload.code, 'ACTION_NOT_ALLOWED');
    assert.equal(error!.payload.message, '所选游戏暂未开放');
    const count = app.db.prepare('SELECT COUNT(*) AS count FROM rooms').get() as { count: number };
    assert.equal(count.count, 0);
    socket.close();
  } finally {
    await app.shutdown();
  }
});

test('WS 非法消息：坏 JSON / schema 不符 → INVALID_MESSAGE；协议版本不符 → UNSUPPORTED_PROTOCOL', async () => {
  const app = await startApp();
  try {
    const { socket } = await connect(app);

    const [badJson] = await sendAndCollect(socket, 'not json{{', 1);
    assert.equal(badJson!.type, 'error');
    assert.equal(badJson!.payload.code, 'INVALID_MESSAGE');

    const [badSchema] = await sendAndCollect(
      socket,
      JSON.stringify({ v: PROTOCOL_VERSION, type: 'create_room' }),
      1,
    );
    assert.equal(badSchema!.payload.code, 'INVALID_MESSAGE');

    const [badVersion] = await sendAndCollect(
      socket,
      JSON.stringify({ v: 999, type: 'create_room', requestId: 'r', payload: {} }),
      1,
    );
    assert.equal(badVersion!.payload.code, 'UNSUPPORTED_PROTOCOL');

    // M2+ 消息类型（如 game_action）：稳定返回 ACTION_NOT_ALLOWED
    const [notAllowed] = await sendAndCollect(
      socket,
      JSON.stringify({ v: PROTOCOL_VERSION, type: 'game_action', requestId: 'r2', payload: {} }),
      1,
    );
    assert.equal(notAllowed!.payload.code, 'ACTION_NOT_ALLOWED');
    socket.close();
  } finally {
    await app.shutdown();
  }
});

test('静态托管：支持构建产物目录、SPA fallback、穿透 Host 头与绝对 URL 请求', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ldj-static-test-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>JoyTable SPA</title><div id="root">App</div>');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'test.js'), 'console.log("hello");');

    const logger = createLogger('error', {}, () => {});
    const app = createApp(testConfig(), logger, dir);
    await app.listen();

    try {
      const base = `http://127.0.0.1:${app.port()}`;

      // 1. 访问根路径 /
      const rootRes = await fetch(`${base}/`);
      assert.equal(rootRes.status, 200);
      assert.match(rootRes.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await rootRes.text(), /JoyTable SPA/);

      // 2. 访问静态资源 /assets/test.js
      const jsRes = await fetch(`${base}/assets/test.js`);
      assert.equal(jsRes.status, 200);
      assert.match(jsRes.headers.get('content-type') ?? '', /javascript/);
      assert.match(await jsRes.text(), /console\.log/);

      // 3. 访问 SPA 路由 /join/ABCDE 触发 index.html fallback
      const spaRes = await fetch(`${base}/join/ABCDE?server=http%3A%2F%2Fbore.pub%3A24975`, {
        headers: { Host: 'bore.pub:24975' },
      });
      assert.equal(spaRes.status, 200);
      assert.match(spaRes.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await spaRes.text(), /JoyTable SPA/);

      // 4. 穿透代理常见的绝对 URL 格式请求：GET http://bore.pub:24975/join/ABCDE
      const rawReq = await new Promise<{ status: number; text: string; csp: string }>((resolvePromise) => {
        const req = http.request({
          host: '127.0.0.1',
          port: app.port(),
          path: 'http://bore.pub:24975/join/ABCDE',
          headers: { Host: 'bore.pub:24975' },
        }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolvePromise({
            status: res.statusCode ?? 0,
            text: data,
            csp: res.headers['content-security-policy'] as string ?? '',
          }));
        });
        req.end();
      });
      assert.equal(rawReq.status, 200);
      assert.match(rawReq.text, /JoyTable SPA/);
      assert.match(rawReq.csp, /https:\/\/fonts\.loli\.net/);
      assert.match(rawReq.csp, /'unsafe-inline'/);
      assert.match(rawReq.csp, /ws:/);
    } finally {
      await app.shutdown();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
