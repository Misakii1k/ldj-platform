/**
 * room_status 心跳查询端点测试（D7-A §6 遗留修复）。
 * 走真实 WS：已绑定房间返回最小权威状态 ack；未绑定返回 ACTION_NOT_ALLOWED。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
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
    allowedOrigins: [],
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

async function connect(app: App): Promise<{ socket: WebSocket; welcome: Envelope }> {
  const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
  const [raw] = (await once(socket, 'message')) as [Buffer];
  return { socket, welcome: JSON.parse(raw.toString()) as Envelope };
}

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

test('room_status：已绑定房间返回最小权威状态 ack', async () => {
  const app = await startApp();
  try {
    const { socket } = await connect(app);
    const created = await sendAndCollect(
      socket,
      JSON.stringify({ v: 1, type: 'create_room', requestId: 'c1', payload: { nickname: '房主', gameId: 'undercover' } }),
      2,
    );
    const ack = created.find((e) => e.type === 'ack');
    assert.ok(ack, '应收到 create_room ack');
    const roomCode = ack.payload.roomCode as string;

    const responses = await sendAndCollect(
      socket,
      JSON.stringify({ v: 1, type: 'room_status', requestId: 'r1', payload: {} }),
      1,
    );
    const status = responses[0]!;
    assert.equal(status.type, 'ack');
    assert.equal(status.requestId, 'r1');
    assert.equal(status.payload.roomCode, roomCode);
    assert.equal(status.payload.status, 'LOBBY');
    assert.equal(typeof status.payload.roomSeq, 'number');
  } finally {
    await app.shutdown();
  }
});

test('room_status：未绑定房间返回 ACTION_NOT_ALLOWED', async () => {
  const app = await startApp();
  try {
    const { socket } = await connect(app);
    const responses = await sendAndCollect(
      socket,
      JSON.stringify({ v: 1, type: 'room_status', requestId: 'r2', payload: {} }),
      1,
    );
    assert.equal(responses[0]!.type, 'error');
    assert.equal(responses[0]!.payload.code, 'ACTION_NOT_ALLOWED');
  } finally {
    await app.shutdown();
  }
});

test('room_status：非法 payload（非空对象）→ INVALID_MESSAGE', async () => {
  const app = await startApp();
  try {
    const { socket } = await connect(app);
    const responses = await sendAndCollect(
      socket,
      JSON.stringify({ v: 1, type: 'room_status', requestId: 'r3', payload: { extra: 1 } }),
      1,
    );
    assert.equal(responses[0]!.type, 'error');
    assert.equal(responses[0]!.payload.code, 'INVALID_MESSAGE');
  } finally {
    await app.shutdown();
  }
});
