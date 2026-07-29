/**
 * M2 房间闭环 · gateway 集成测试（AC-11 会话接管、AC-14 聊天、STALE_CLIENT_STATE、踢人断开）。
 * 通过真实 WebSocket 驱动完整链路。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
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
    allowedOrigins: [],
    llm: { baseUrl: null, apiKey: null, model: 'test-model', timeoutMs: 5000 },
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

/** 消息队列式客户端：所有服务端消息入队，支持按条件等待 */
class Client {
  readonly socket: WebSocket;
  readonly #queue: Envelope[] = [];
  #waiters: { predicate: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];
  closeCode: number | null = null;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      const envelope = JSON.parse((raw as Buffer).toString()) as Envelope;
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
    // 先挂 message 监听再等 welcome，避免错过握手后立即到达的首帧
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new Client(socket);
    await client.waitFor((e) => e.type === 'welcome');
    return client;
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

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 3000): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return this.#queue.splice(idx, 1)[0]!;
    return new Promise<Envelope>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('等待消息超时')), timeoutMs);
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
    return this.waitFor((e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'));
  }

  async waitClosed(timeoutMs = 3000): Promise<number> {
    if (this.closeCode !== null) return this.closeCode;
    const [code] = (await Promise.race([
      once(this.socket, 'close'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('等待关闭超时')), timeoutMs)),
    ])) as [number];
    return code;
  }
}

interface RoomHandles {
  host: Client;
  roomCode: string;
  hostId: string;
  hostToken: string;
}

async function createRoomVia(app: App, nickname = '房主'): Promise<RoomHandles> {
  const host = await Client.connect(app);
  const ack = await host.request('create_room', { nickname });
  assert.equal(ack.type, 'ack');
  await host.waitFor((e) => e.type === 'room_snapshot');
  return {
    host,
    roomCode: String(ack.payload.roomCode),
    hostId: String(ack.payload.playerId),
    hostToken: String(ack.payload.resumeToken),
  };
}

test('WS join_room：ack 含 resumeToken；双方收到新快照与系统聊天消息', async () => {
  const app = await startApp();
  try {
    const { host, roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);

    const ack = await guest.request('join_room', { roomCode, nickname: '客人' });
    assert.equal(ack.type, 'ack');
    assert.equal(ack.payload.seatRole, 'player');
    assert.ok(String(ack.payload.resumeToken).length >= 40);

    const hostSnap = await host.waitFor((e) => e.type === 'room_snapshot');
    assert.equal((hostSnap.payload.members as unknown[]).length, 2);
    const guestSnap = await guest.waitFor((e) => e.type === 'room_snapshot');
    assert.equal((guestSnap.payload.members as unknown[]).length, 2);

    const sysChat = await host.waitFor((e) => e.type === 'chat_batch');
    const messages = sysChat.payload.messages as { kind: string; text: string }[];
    assert.equal(messages[0]!.kind, 'system');
    assert.match(messages[0]!.text, /客人 加入了房间/);

    // 大小写不敏感的房间码也能加入（FR-ROOM-001）
    const guest2 = await Client.connect(app);
    const ack2 = await guest2.request('join_room', {
      roomCode: roomCode.toLowerCase(),
      nickname: '客人2',
    });
    assert.equal(ack2.type, 'ack');
  } finally {
    await app.shutdown();
  }
});

test('WS join_room 错误路径：不存在的房间码 / 重名', async () => {
  const app = await startApp();
  try {
    const { roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);

    const notFound = await guest.request('join_room', { roomCode: 'ZZZZZ', nickname: '甲' });
    assert.equal(notFound.type, 'error');
    assert.equal(notFound.payload.code, 'ROOM_NOT_FOUND');

    const taken = await guest.request('join_room', { roomCode, nickname: '房主' });
    assert.equal(taken.type, 'error');
    assert.equal(taken.payload.code, 'NICKNAME_TAKEN');
  } finally {
    await app.shutdown();
  }
});

test('AC-14 聊天：广播 chat_batch；resync 按游标补发不重复', async () => {
  const app = await startApp();
  try {
    const { host, roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);
    await guest.request('join_room', { roomCode, nickname: '客人' });
    // 消费 join 引发的系统消息
    await host.waitFor((e) => e.type === 'chat_batch');

    const ack1 = await host.request('chat_send', { text: '第一条' });
    assert.equal(ack1.type, 'ack');
    assert.equal(ack1.roomSeq, undefined); // 聊天不推动 roomSeq（§9.1）
    const cursor1 = Number(ack1.payload.cursor);

    const guestBatch = await guest.waitFor(
      (e) => e.type === 'chat_batch' && (e.payload.messages as { text: string }[])[0]?.text === '第一条',
    );
    const msg = (guestBatch.payload.messages as { kind: string; fromPlayerId: string }[])[0]!;
    assert.equal(msg.kind, 'player');

    await host.request('chat_send', { text: '第二条' });
    // guest 用 cursor1 resync → 只补"第二条"
    const reqId = guest.send('resync', { lastSeq: null, chatCursor: cursor1 });
    const resyncBatch = await guest.waitFor((e) => e.type === 'chat_batch' && e.requestId === reqId);
    const missed = resyncBatch.payload.messages as { text: string }[];
    assert.deepEqual(missed.map((m) => m.text), ['第二条']);
  } finally {
    await app.shutdown();
  }
});

test('AC-11 会话接管：第二连接 resume 后旧连接收到 session_replaced 并被关闭', async () => {
  const app = await startApp();
  try {
    const { host, roomCode, hostId, hostToken } = await createRoomVia(app);

    const second = await Client.connect(app);
    const ack = await second.request('resume_room', {
      roomCode,
      playerId: hostId,
      resumeToken: hostToken,
    });
    assert.equal(ack.type, 'ack');
    assert.equal(ack.payload.playerId, hostId);

    const replaced = await host.waitFor((e) => e.type === 'session_replaced');
    assert.equal(replaced.payload.code, 'SESSION_REPLACED');
    const closeCode = await host.waitClosed();
    assert.equal(closeCode, 4002);

    // 新连接可正常操作（旧连接关闭不影响成员在场状态）
    const chatAck = await second.request('chat_send', { text: '还在' });
    assert.equal(chatAck.type, 'ack');
    const snapshot = await second.request('resync', { lastSeq: null, chatCursor: null }).then(() => null).catch(() => null);
    void snapshot;
  } finally {
    await app.shutdown();
  }
});

test('AC-10 断线恢复：连接断开后成员转 DISCONNECTED_RESERVED，凭证恢复后回到 CONNECTED', async () => {
  const app = await startApp();
  try {
    const { host, roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);
    const joinAck = await guest.request('join_room', { roomCode, nickname: '掉线侠' });
    const guestId = String(joinAck.payload.playerId);
    const guestToken = String(joinAck.payload.resumeToken);
    await host.waitFor((e) => e.type === 'room_snapshot');

    // 硬断开 → 服务端标记断线并广播
    guest.socket.terminate();
    const snap = await host.waitFor((e) => {
      if (e.type !== 'room_snapshot') return false;
      const m = (e.payload.members as { playerId: string; connectionStatus: string }[]).find(
        (x) => x.playerId === guestId,
      );
      return m?.connectionStatus === 'DISCONNECTED_RESERVED';
    });
    assert.ok(snap.roomSeq !== undefined);

    // 新连接 resume → CONNECTED
    const back = await Client.connect(app);
    const resumeAck = await back.request('resume_room', {
      roomCode,
      playerId: guestId,
      resumeToken: guestToken,
    });
    assert.equal(resumeAck.type, 'ack');
    const snap2 = await back.waitFor((e) => e.type === 'room_snapshot');
    const member = (snap2.payload.members as { playerId: string; connectionStatus: string }[]).find(
      (m) => m.playerId === guestId,
    );
    assert.equal(member?.connectionStatus, 'CONNECTED');
  } finally {
    await app.shutdown();
  }
});

test('room_command：expectedSeq 过期 → STALE_CLIENT_STATE 附 currentSeq；踢人后被踢连接关闭（4001）', async () => {
  const app = await startApp();
  try {
    const { host, roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);
    const joinAck = await guest.request('join_room', { roomCode, nickname: '被踢者' });
    const guestId = String(joinAck.payload.playerId);
    const currentSeq = joinAck.roomSeq!;
    await host.waitFor((e) => e.type === 'room_snapshot');

    // 过期 expectedSeq → STALE_CLIENT_STATE + currentSeq（§9.4）
    const stale = await host.request(
      'room_command',
      { command: 'kick_player', targetPlayerId: guestId },
      { expectedSeq: 0 },
    );
    assert.equal(stale.type, 'error');
    assert.equal(stale.payload.code, 'STALE_CLIENT_STATE');
    assert.equal(stale.payload.currentSeq, currentSeq);

    // 正确 expectedSeq → 踢出成功，被踢连接关闭码 4001
    const ack = await host.request(
      'room_command',
      { command: 'kick_player', targetPlayerId: guestId },
      { expectedSeq: currentSeq },
    );
    assert.equal(ack.type, 'ack');
    const closeCode = await guest.waitClosed();
    assert.equal(closeCode, 4001);
    const snap = await host.waitFor((e) => e.type === 'room_snapshot');
    assert.ok(!(snap.payload.members as { playerId: string }[]).some((m) => m.playerId === guestId));
  } finally {
    await app.shutdown();
  }
});

test('leave_room 与 close_room：退出得到确认；关闭房间后所有连接断开（4003）', async () => {
  const app = await startApp();
  try {
    const { host, roomCode } = await createRoomVia(app);
    const guest = await Client.connect(app);
    await guest.request('join_room', { roomCode, nickname: '过客' });
    await host.waitFor((e) => e.type === 'room_snapshot');

    const leaveAck = await guest.request('leave_room', {});
    assert.equal(leaveAck.type, 'ack');
    assert.equal(leaveAck.payload.mode, 'removed');
    // 退出后再发聊天 → ACTION_NOT_ALLOWED（连接已脱离房间）
    const denied = await guest.request('chat_send', { text: '我还想说' });
    assert.equal(denied.type, 'error');
    assert.equal(denied.payload.code, 'ACTION_NOT_ALLOWED');

    const closeAck = await host.request('room_command', { command: 'close_room' });
    assert.equal(closeAck.type, 'ack');
    const closeCode = await host.waitClosed();
    assert.equal(closeCode, 4003);
  } finally {
    await app.shutdown();
  }
});

test('聊天限流：超过 5 条/10 秒 → RATE_LIMITED（FR-CHAT-003）', async () => {
  const app = await startApp();
  try {
    const { host } = await createRoomVia(app);
    for (let i = 1; i <= 5; i++) {
      const ack = await host.request('chat_send', { text: `刷屏${i}` });
      assert.equal(ack.type, 'ack');
    }
    const blocked = await host.request('chat_send', { text: '第六条' });
    assert.equal(blocked.type, 'error');
    assert.equal(blocked.payload.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.payload.retryAfterMs) > 0);
  } finally {
    await app.shutdown();
  }
});
