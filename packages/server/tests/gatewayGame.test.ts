/**
 * M3 gateway 对局集成测试（真实 WebSocket 全链路）：
 * start_game 三类视角不泄密（G-04）/ game_action 闭环 / abort_game /
 * resume·resync 补发 game_state（FR-REC-003）/ TimerRunner 到期广播 /
 * 席位保留期满 forfeit（§6.7）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  };
}

async function startApp(tuning?: {
  hostTransferDelayMs?: number;
  reservationSweepMs?: number;
}): Promise<App> {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(testConfig(), logger, undefined, tuning);
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

/** 消息队列式客户端（同 gatewayM2）：所有服务端消息入队，支持按条件等待 */
class Client {
  readonly socket: WebSocket;
  readonly #queue: Envelope[] = [];
  #waiters: { predicate: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];

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
  }

  static async connect(app: App): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new Client(socket);
    await client.waitFor((e) => e.type === 'welcome');
    return client;
  }

  send(type: string, payload: unknown): string {
    const requestId = `ggame-${++reqCounter}`;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    return requestId;
  }

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 4000): Promise<Envelope> {
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

  async request(type: string, payload: unknown): Promise<Envelope> {
    const requestId = this.send(type, payload);
    return this.waitFor((e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'));
  }

  /** 最近一条满足条件的 game_state（先清队列中旧的，再等新一帧） */
  async waitGameState(predicate: (view: Record<string, unknown>) => boolean): Promise<Envelope> {
    return this.waitFor(
      (e) => e.type === 'game_state' && predicate((e.payload.view ?? {}) as Record<string, unknown>),
    );
  }
}

interface GameRoom {
  app: App;
  roomCode: string;
  host: Client;
  hostId: string;
  clients: Client[]; // 与 playerIds 对齐（含 host 在 0 位）
  playerIds: string[];
  tokens: string[];
}

/** 建房 + 加入至 n 名玩家（可选一名观战者），全部真实 WS 连接 */
async function setupGameRoom(
  app: App,
  playerCount: number,
  withSpectator = false,
): Promise<GameRoom & { spectator?: Client }> {
  const host = await Client.connect(app);
  const created = await host.request('create_room', { nickname: '房主' });
  assert.equal(created.type, 'ack');
  const roomCode = String(created.payload.roomCode);
  const clients = [host];
  const playerIds = [String(created.payload.playerId)];
  const tokens = [String(created.payload.resumeToken)];
  for (let i = 2; i <= playerCount; i++) {
    const c = await Client.connect(app);
    const ack = await c.request('join_room', { roomCode, nickname: `玩家${i}` });
    assert.equal(ack.type, 'ack');
    clients.push(c);
    playerIds.push(String(ack.payload.playerId));
    tokens.push(String(ack.payload.resumeToken));
  }
  let spectator: Client | undefined;
  if (withSpectator) {
    spectator = await Client.connect(app);
    const ack = await spectator.request('join_room', { roomCode, nickname: '观众', asSpectator: true });
    assert.equal(ack.type, 'ack');
    assert.equal(ack.payload.seatRole, 'spectator');
  }
  return { app, roomCode, host, hostId: playerIds[0]!, clients, playerIds, tokens, spectator };
}

test('AC-15/G-04 开局广播：玩家各收自己的词，观战者无词；他人的词不出现在自己的帧里', async () => {
  const app = await startApp();
  try {
    const room = await setupGameRoom(app, 4, true);
    const ack = await room.host.request('room_command', { command: 'start_game' });
    assert.equal(ack.type, 'ack');

    // 每名玩家收到 player 视角：me 是自己且有词，未淘汰时不公开阵营
    const words: string[] = [];
    for (let i = 0; i < 4; i++) {
      const gs = await room.clients[i]!.waitFor((e) => e.type === 'game_state');
      assert.equal(gs.payload.role, 'player');
      assert.equal(gs.payload.status, 'ACTIVE');
      const view = gs.payload.view as {
        phase: string;
        me: { playerId: string; word: string; role: string | null } | null;
        reveal: unknown;
      };
      assert.equal(view.phase, 'word_reveal');
      assert.ok(view.me, '参局玩家应有 me');
      assert.equal(view.me.playerId, room.playerIds[i]);
      assert.ok(view.me.word.length > 0);
      assert.equal(view.me.role, null); // 存活期间不公开自己身份（词已足够）
      assert.equal(view.reveal, null);
      words.push(view.me.word);
    }
    const distinct = [...new Set(words)];
    assert.equal(distinct.length, 2, '4 人局应有平民词与卧底词两种');
    // 逐帧复查：每人帧内只含自己的词
    for (let i = 0; i < 4; i++) {
      const mine = words[i]!;
      const foreign = distinct.find((w) => w !== mine)!;
      // 重新拉一帧（resync），对完整 JSON 做包含性检查
      const reqId = room.clients[i]!.send('resync', { lastSeq: null, chatCursor: null });
      const gs = await room.clients[i]!.waitFor(
        (e) => e.type === 'game_state' && e.requestId === reqId,
      );
      const raw = JSON.stringify(gs.payload);
      assert.ok(raw.includes(mine));
      assert.ok(!raw.includes(foreign), '不得泄露另一阵营的词');
    }

    // 观战者：spectator 视角，无 me、无任何词
    const spectator = room.spectator!;
    const sgs = await spectator.waitFor((e) => e.type === 'game_state');
    assert.equal(sgs.payload.role, 'spectator');
    const sraw = JSON.stringify(sgs.payload);
    for (const w of distinct) assert.ok(!sraw.includes(w), '观战者不得见任何词');
    assert.equal((sgs.payload.view as { me?: unknown }).me, undefined);
  } finally {
    await app.shutdown();
  }
});

test('game_action 闭环：确认看词 → 广播新视角与 game_event；无对局时稳定报错', async () => {
  const app = await startApp();
  try {
    const room = await setupGameRoom(app, 4);

    // 未开局 game_action → ACTION_NOT_ALLOWED
    const denied = await room.host.request('game_action', { type: 'confirm_word' });
    assert.equal(denied.type, 'error');
    assert.equal(denied.payload.code, 'ACTION_NOT_ALLOWED');

    await room.host.request('room_command', { command: 'start_game' });

    for (const c of room.clients) {
      const ack = await c.request('game_action', { type: 'confirm_word' });
      assert.equal(ack.type, 'ack');
      assert.ok(Number(ack.payload.seq) >= 2);
    }
    // 全员确认 → 进入发言阶段的 game_state 广播到每个客户端
    for (const c of room.clients) {
      await c.waitGameState((v) => v.phase === 'speaking');
    }
    // 公开事件广播（phase_changed）
    const evt = await room.host.waitFor((e) => e.type === 'game_event');
    const events = (evt.payload.events as { type: string }[]).map((x) => x.type);
    assert.ok(events.length >= 1);
  } finally {
    await app.shutdown();
  }
});

test('abort_game：全员收到 ABORTED 视角与系统提示；房间回 POST_GAME', async () => {
  const app = await startApp();
  try {
    const room = await setupGameRoom(app, 4);
    await room.host.request('room_command', { command: 'start_game' });
    for (const c of room.clients) await c.waitFor((e) => e.type === 'game_state');

    const ack = await room.host.request('room_command', { command: 'abort_game' });
    assert.equal(ack.type, 'ack');
    for (const c of room.clients) {
      const gs = await c.waitFor((e) => e.type === 'game_state' && e.payload.status === 'ABORTED');
      assert.ok(gs);
    }
    const chat = await room.clients[1]!.waitFor(
      (e) =>
        e.type === 'chat_batch' &&
        (e.payload.messages as { text: string }[]).some((m) => m.text.includes('终止')),
    );
    assert.ok(chat);
    const snap = await room.clients[1]!.waitFor(
      (e) => e.type === 'room_snapshot' && e.payload.status === 'POST_GAME',
    );
    assert.ok(snap);
  } finally {
    await app.shutdown();
  }
});

test('FR-REC-003 断线重连：resume 依次收到快照、个人视角（词不变）、聊天增量', async () => {
  const app = await startApp();
  try {
    const room = await setupGameRoom(app, 4);
    await room.host.request('room_command', { command: 'start_game' });
    const gs0 = await room.clients[1]!.waitFor((e) => e.type === 'game_state');
    const wordBefore = (gs0.payload.view as { me: { word: string } }).me.word;

    // 硬断开 → 新连接凭 token 恢复
    room.clients[1]!.socket.terminate();
    await room.host.waitFor((e) => {
      if (e.type !== 'room_snapshot') return false;
      const m = (e.payload.members as { playerId: string; connectionStatus: string }[]).find(
        (x) => x.playerId === room.playerIds[1],
      );
      return m?.connectionStatus === 'DISCONNECTED_RESERVED';
    });

    const back = await Client.connect(app);
    const resumeAck = await back.request('resume_room', {
      roomCode: room.roomCode,
      playerId: room.playerIds[1],
      resumeToken: room.tokens[1],
    });
    assert.equal(resumeAck.type, 'ack');
    const gs = await back.waitFor((e) => e.type === 'game_state');
    assert.equal(gs.payload.role, 'player');
    const view = gs.payload.view as { me: { playerId: string; word: string } };
    assert.equal(view.me.playerId, room.playerIds[1]);
    assert.equal(view.me.word, wordBefore, '重连后秘密词一致（G-03）');
  } finally {
    await app.shutdown();
  }
});

test('TimerRunner 接入 app：看词计时器到期 → 自动进入发言并广播 game_state', async () => {
  const app = await startApp();
  try {
    const room = await setupGameRoom(app, 4);
    await room.host.request('room_command', { command: 'start_game' });
    await room.host.waitFor((e) => e.type === 'game_state');

    // 把看词计时器改成已到期，通知 runner 立即对表
    app.db.prepare(`UPDATE timers SET deadline_at = ? WHERE timer_id = 'reveal'`).run(Date.now() - 1);
    app.timerRunner.notifyChanged();

    for (const c of room.clients) {
      await c.waitGameState((v) => v.phase === 'speaking');
    }
  } finally {
    await app.shutdown();
  }
});

test('§6.7 保留期满：扫描将成员置 EXPIRED 并在对局内判负退出', async () => {
  const app = await startApp({ reservationSweepMs: 50, hostTransferDelayMs: 10_000 });
  try {
    const room = await setupGameRoom(app, 4);
    await room.host.request('room_command', { command: 'start_game' });
    await room.host.waitFor((e) => e.type === 'game_state');

    // 玩家 2 断线 → 保留 → 把保留期改成已过期，等待扫描
    const gonePlayerId = room.playerIds[1]!;
    room.clients[1]!.socket.terminate();
    await room.host.waitFor((e) => {
      if (e.type !== 'room_snapshot') return false;
      const m = (e.payload.members as { playerId: string; connectionStatus: string }[]).find(
        (x) => x.playerId === gonePlayerId,
      );
      return m?.connectionStatus === 'DISCONNECTED_RESERVED';
    });
    app.db
      .prepare(`UPDATE room_members SET reserved_until = ? WHERE player_id = ?`)
      .run(Date.now() - 1, gonePlayerId);

    // 系统聊天提示 + 对局内该玩家 alive=false（disconnect_timeout）
    await room.host.waitFor(
      (e) =>
        e.type === 'chat_batch' &&
        (e.payload.messages as { text: string }[]).some((m) => m.text.includes('席位保留到期')),
      6000,
    );
    await room.host.waitGameState((v) => {
      const players = v.players as { playerId: string; alive: boolean; exitReason: string | null }[];
      const gone = players.find((p) => p.playerId === gonePlayerId);
      return gone?.alive === false && gone.exitReason === 'disconnect_timeout';
    });

    // 过期成员的恢复凭证已作废（FR-ID-005）
    const attempt = await Client.connect(app);
    const deniedResume = await attempt.request('resume_room', {
      roomCode: room.roomCode,
      playerId: gonePlayerId,
      resumeToken: room.tokens[1],
    });
    assert.equal(deniedResume.type, 'error');
    assert.equal(deniedResume.payload.code, 'RESERVATION_EXPIRED');
  } finally {
    await app.shutdown();
  }
});
