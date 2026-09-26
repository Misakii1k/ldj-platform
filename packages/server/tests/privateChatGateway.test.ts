import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@ldj/shared';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { listChatAfter } from '../src/core/commands/chat.ts';

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

let reqCounter = 0;

function isRetryableConnectError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'EADDRINUSE';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

class Client {
  readonly socket: WebSocket;
  readonly allReceived: Envelope[] = [];
  readonly #queue: Envelope[] = [];
  #waiters: { predicate: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];
  closeCode: number | null = null;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      const envelope = JSON.parse((raw as Buffer).toString()) as Envelope;
      this.allReceived.push(envelope);
      const idx = this.#waiters.findIndex((w) => w.predicate(envelope));
      if (idx >= 0) {
        const [waiter] = this.#waiters.splice(idx, 1);
        waiter!.resolve(envelope);
      } else {
        this.#queue.push(envelope);
      }
    });
    socket.on('close', (code) => {
      this.closeCode = code;
    });
  }

  static async connect(app: App): Promise<Client> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
      const client = new Client(socket);
      try {
        await Promise.race([
          client.waitFor((e) => e.type === 'welcome'),
          once(socket, 'error').then(([err]) => {
            throw err as Error;
          }),
        ]);
        return client;
      } catch (err) {
        socket.close();
        if (!isRetryableConnectError(err) || attempt === 5) throw err;
        await delay(20 + attempt * 20);
      }
    }
    throw new Error('unreachable connect retry state');
  }

  send(type: string, payload: unknown, extra: { requestId?: string; expectedSeq?: number } = {}): string {
    const requestId = extra.requestId ?? `greq-${++reqCounter}`;
    this.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type,
        requestId,
        payload,
        ...(extra.expectedSeq !== undefined ? { expectedSeq: extra.expectedSeq } : {}),
      }),
    );
    return requestId;
  }

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 3000, tag = 'unknown'): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return this.#queue.splice(idx, 1)[0]!;
    return new Promise<Envelope>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待消息超时: ${tag}`)), timeoutMs);
      this.#waiters.push({
        predicate,
        resolve: (e) => {
          clearTimeout(timer);
          resolvePromise(e);
        },
      });
    });
  }

  async request(type: string, payload: unknown, extra: { expectedSeq?: number } = {}): Promise<Envelope> {
    const requestId = this.send(type, payload, extra);
    return this.waitFor(
      (e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'),
      3000,
      `request-${type}`,
    );
  }

  close() {
    this.socket.close();
  }
}

test('WS 私聊：A/B/C 三连接，A→B 私聊第三方原始 frame 绝不含内容，且 resync 隔离', async () => {
  const app = await startApp();
  try {
    const seeded = seedRoom(app.db, { nickname: '玩家A' });
    const clientA = await Client.connect(app);
    await clientA.request('resume_room', {
      roomCode: seeded.roomCode,
      playerId: seeded.hostId,
      resumeToken: seeded.hostResumeToken,
    });

    const clientB = await Client.connect(app);
    const ackB = await clientB.request('join_room', { roomCode: seeded.roomCode, nickname: '玩家B' });
    assert.equal(ackB.type, 'ack');
    const playerBId = ackB.payload.playerId as string;
    const playerBToken = ackB.payload.resumeToken as string;

    const clientC = await Client.connect(app);
    const ackC = await clientC.request('join_room', { roomCode: seeded.roomCode, nickname: '玩家C' });
    assert.equal(ackC.type, 'ack');
    const _playerCId = ackC.payload.playerId as string;

    // 清理连接初期的系统消息等
    await delay(50);

    const secretText = '绝密密码-778899';
    const ackSend = await clientA.request('chat_send', {
      text: secretText,
      toPlayerId: playerBId,
    });
    assert.equal(ackSend.type, 'ack');

    // B 必须收到包含 secretText 的 chat_batch
    const bBatch = await clientB.waitFor(
      (e) => e.type === 'chat_batch' && JSON.stringify(e.payload).includes(secretText),
      3000,
      'bBatch',
    );
    assert.ok(bBatch);

    // 等待网络传播稳定
    await delay(50);

    // C 的全部原始收包中，绝不应出现 secretText
    const cReceivedLeak = clientC.allReceived.some((e) => JSON.stringify(e).includes(secretText));
    assert.equal(cReceivedLeak, false, '第三方 C 收到泄漏的私聊 frame！');

    // B 断线并重新连接 resume
    clientB.close();
    await delay(50);

    const clientBResumed = await Client.connect(app);
    const resumeAckB = await clientBResumed.request('resume_room', {
      roomCode: seeded.roomCode,
      playerId: playerBId,
      resumeToken: playerBToken,
    });
    assert.equal(resumeAckB.type, 'ack');

    // B 通过 resync 游标 0 补发，应能拉到自己的私聊
    const resyncReqB = clientBResumed.send('resync', {
      lastSeq: null,
      chatCursor: 0,
    });
    const bResyncBatch = await clientBResumed.waitFor(
      (e) => e.type === 'chat_batch' && e.requestId === resyncReqB && JSON.stringify(e.payload).includes(secretText),
      3000,
      'bResyncBatch',
    );
    assert.ok(bResyncBatch);

    // C 通过 resync 游标 0 补发，绝不能拿到 A→B 的私聊
    const resyncReqC = clientC.send('resync', {
      lastSeq: null,
      chatCursor: 0,
    });
    // 等待 C 的 room_snapshot 到达确认 resync 处理完毕
    await clientC.waitFor((e) => e.type === 'room_snapshot' && e.requestId === resyncReqC);
    await delay(50);
    const cResyncLeak = clientC.allReceived.some((e) => JSON.stringify(e).includes(secretText));
    assert.equal(cResyncLeak, false, '第三方 C resync 补发中收到泄漏的私聊！');

    clientA.close();
    clientBResumed.close();
    clientC.close();
  } finally {
    await app.shutdown();
  }
});

test('WS 私聊：同 requestId 重放幂等、非法/断线目标明确返回 error 不伪 ACK', async () => {
  const app = await startApp();
  try {
    const seeded = seedRoom(app.db, { nickname: '玩家A' });
    const clientA = await Client.connect(app);
    await clientA.request('resume_room', {
      roomCode: seeded.roomCode,
      playerId: seeded.hostId,
      resumeToken: seeded.hostResumeToken,
    });

    const clientB = await Client.connect(app);
    const ackB = await clientB.request('join_room', { roomCode: seeded.roomCode, nickname: '玩家B' });
    const playerBId = ackB.payload.playerId as string;

    // 1. 同 requestId 幂等重放
    const reqId = 'test-idempotent-chat-req-1';
    clientA.send('chat_send', { text: '幂等测试', toPlayerId: playerBId }, { requestId: reqId });
    const ackOriginal = await clientA.waitFor((e) => e.requestId === reqId && e.type === 'ack');
    assert.equal(ackOriginal.type, 'ack');

    clientA.send('chat_send', { text: '幂等测试', toPlayerId: playerBId }, { requestId: reqId });
    const ackReplay = await clientA.waitFor((e) => e.requestId === reqId && e.type === 'ack');
    assert.equal(ackReplay.type, 'ack');
    assert.equal(ackReplay.payload.cursor, ackOriginal.payload.cursor);

    // 验证数据库中该内容只落库了一次
    const chatRows = app.db
      .prepare('SELECT count(*) as count FROM chat_messages WHERE text = ?')
      .get('幂等测试') as { count: number };
    assert.equal(chatRows.count, 1);

    // 2. 发给不存在的玩家，明确返回 error
    const errUnknown = await clientA.request('chat_send', {
      text: '发给虚无',
      toPlayerId: 'non-existent-user-999',
    });
    assert.equal(errUnknown.type, 'error');
    assert.equal(errUnknown.payload.code, 'NOT_AUTHORIZED');

    // 3. 房主踢出玩家 B 后，向 B 发私聊明确返回 error
    await clientA.request('room_command', {
      command: 'kick_player',
      targetPlayerId: playerBId,
    });

    const errKicked = await clientA.request('chat_send', {
      text: '向被踢玩家发消息',
      toPlayerId: playerBId,
    });
    assert.equal(errKicked.type, 'error');
    assert.equal(errKicked.payload.code, 'NOT_AUTHORIZED');

    // 4. 房间公共查询与 bot runner 查询视角（viewerId=null）无任何私聊
    const publicChat = listChatAfter(app.db, seeded.roomId, null, null);
    assert.equal(
      publicChat.some((m) => m.toPlayerId !== undefined),
      false,
      '公共/bot视角出现了私聊！',
    );

    clientA.close();
    clientB.close();
  } finally {
    await app.shutdown();
  }
});
