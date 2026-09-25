import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';
import { seedRoom } from './helpers/seedRoom.ts';

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
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

interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  roomSeq?: number;
  payload: Record<string, unknown>;
}

let reqIdCounter = 0;

class TestClient {
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

  static async connect(app: App): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new TestClient(socket);
    await Promise.race([
      client.waitFor((e) => e.type === 'welcome'),
      once(socket, 'error').then(([err]) => {
        throw err as Error;
      }),
    ]);
    return client;
  }

  waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 4000): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) {
      const [envelope] = this.#queue.splice(idx, 1);
      return Promise.resolve(envelope!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new Error(`waitFor timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#waiters.push({
        predicate,
        resolve: (e) => {
          clearTimeout(timer);
          resolve(e);
        },
      });
    });
  }

  send(type: string, payload: unknown, requestId?: string, expectedSeq?: number): string {
    const id = requestId ?? `req-${++reqIdCounter}`;
    this.socket.send(
      JSON.stringify({
        v: 1,
        type,
        requestId: id,
        ...(expectedSeq !== undefined ? { expectedSeq } : {}),
        payload,
      }),
    );
    return id;
  }

  async request(type: string, payload: unknown, expectedSeq?: number): Promise<Envelope> {
    const id = this.send(type, payload, undefined, expectedSeq);
    return this.waitFor((e) => e.requestId === id && (e.type === 'ack' || e.type === 'error'));
  }

  close(): void {
    this.socket.close();
  }
}

test('gateway: 一智千金 WebSocket 全链路（开局、作答隐私、STALE_CLIENT_STATE 守卫）', async () => {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(testConfig(), logger, undefined, { reservationSweepMs: 300_000 });
  await app.listen();

  try {
    const db = app.db;
    const seeded = seedRoom(db, {
      gameId: 'wits-wagers',
      ready: true,
      config: { rulesetId: 'wits_wagers_platform_v1', answerSeconds: 30, betSeconds: 30 },
    });

    const c1 = await TestClient.connect(app);
    const c2 = await TestClient.connect(app);
    const c3 = await TestClient.connect(app);

    // 1. 房主上线 resume 并准备
    const r1 = await c1.request('resume_room', { roomCode: seeded.roomCode, playerId: seeded.hostId, resumeToken: seeded.hostResumeToken });
    assert.equal(r1.type, 'ack', `c1 resume failed: ${JSON.stringify(r1)}`);
    const ready1 = await c1.request('room_command', { command: 'ready', ready: true });
    assert.equal(ready1.type, 'ack');

    // 玩家 2 加入并准备
    const r2 = await c2.request('join_room', { roomCode: seeded.roomCode, nickname: '玩家2' });
    assert.equal(r2.type, 'ack', `c2 join failed: ${JSON.stringify(r2)}`);
    const ready2 = await c2.request('room_command', { command: 'ready', ready: true });
    assert.equal(ready2.type, 'ack');

    // 玩家 3 加入并准备
    const r3 = await c3.request('join_room', { roomCode: seeded.roomCode, nickname: '玩家3' });
    assert.equal(r3.type, 'ack', `c3 join failed: ${JSON.stringify(r3)}`);
    const ready3 = await c3.request('room_command', { command: 'ready', ready: true });
    assert.equal(ready3.type, 'ack');

    // 2. 房主启动游戏
    const startAck = await c1.request('room_command', { command: 'start_game' });
    assert.equal(startAck.type, 'ack', `start_game failed: ${JSON.stringify(startAck)}`);

    // 等待 game_state 推送
    const gs1 = await c1.waitFor((e) => e.type === 'game_state');
    const gs2 = await c2.waitFor((e) => e.type === 'game_state');

    const v1 = (gs1.payload as { view: Record<string, unknown> }).view;
    const v2 = (gs2.payload as { view: Record<string, unknown> }).view;
    assert.equal(v1.phase, 'answering');
    assert.equal(v2.phase, 'answering');

    // 3. 隐私验证：c1 提交作答，c2 收到 game_state 更新但绝无 c1 的作答数值
    const roundToken = v1.roundToken as string;
    const guessAck = await c1.request('game_action', {
      type: 'submit_guess',
      roundToken,
      expectedRevision: 0,
      value: 5000,
    });
    assert.equal(guessAck.type, 'ack');

    // c2 收到 game_state
    const gs2Updated = await c2.waitFor((e) => e.type === 'game_state');
    const v2Updated = (gs2Updated.payload as { view: Record<string, unknown> }).view;
    const p1Summary = (v2Updated.players as Array<{ playerId: string; hasSubmitted: boolean }>).find(
      (p) => p.playerId === seeded.hostId,
    );
    assert.equal(p1Summary?.hasSubmitted, true);
    // 确认 c2 视角中无 5000 数值，board 为空
    assert.deepEqual(v2Updated.board, []);
    assert.equal(JSON.stringify(v2Updated).includes('5000'), false);

    // 4. STALE_CLIENT_STATE 守卫（X08）：携带旧的 expectedSeq 提交动作被网关拒绝并要求 resync
    const staleSeq = 1;
    const staleErr = await c1.request(
      'game_action',
      { type: 'submit_guess', roundToken, expectedRevision: 1, value: 5200 },
      staleSeq,
    );
    assert.equal(staleErr.type, 'error');
    assert.equal(staleErr.payload.code, 'STALE_CLIENT_STATE');

    c1.close();
    c2.close();
    c3.close();
  } finally {
    await app.shutdown();
  }
});
