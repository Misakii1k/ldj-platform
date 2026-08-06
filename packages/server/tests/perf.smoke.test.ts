/**
 * 冒烟级性能回归测试（CI 友好，< 30 秒）。
 *
 * 跑 1 局 4 人 + 2 机器人短时对局，验证：
 * - 脚本可运行 + 关键路径（confirm_word / finish_speech / cast_vote / game_over）无异常
 * - heap 增长 < 10MB（无明显泄漏）
 *
 * 与 perf.mjs 的区别：perf.mjs 跑 12+8 三局长时压测；本测试只跑 1 局短时冒烟。
 * 启动模式复刻自 gatewayBot.test.ts，自动出招逻辑参考 perf.mjs。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@ldj/shared';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { loadSessionState, type SessionRow } from '../src/core/game/session.ts';

// —— 常量 ——

const HUMAN_PLAYERS = 4;
const BOT_COUNT = 2;
const HEAP_GROWTH_LIMIT_MB = 10;
const TEST_TIMEOUT_MS = 30_000;
const GAME_OVER_WAIT_MS = 25_000;

// —— 服务端启动（精简版，LlmProvider=null，仅 rule 机器人）——

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

// —— 协议信封与视角 ——

interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  payload: Record<string, unknown>;
}

interface PlayerView {
  phase: string;
  round: number;
  players: { playerId: string; alive: boolean }[];
  currentSpeakerId: string | null;
  runoffCandidates: string[];
  winner: string | null;
  me: {
    playerId: string;
    alive: boolean;
    confirmed: boolean;
    hasVoted: boolean;
  } | null;
}

// —— 测试客户端（带自动出招）——

let reqCounter = 0;

class Client {
  readonly socket: WebSocket;
  readonly #queue: Envelope[] = [];
  #waiters: {
    predicate: (e: Envelope) => boolean;
    resolve: (e: Envelope) => void;
    reject: (err: Error) => void;
  }[] = [];
  playerId: string | null = null;
  /** 出招去重：避免同一阶段重复发送 */
  #inFlight = new Set<string>();
  #lastPhase: string | null = null;
  /** 投票目标（卧底 ID），由测试主体注入 */
  voteTargetId: string | null = null;

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
      // 自动出招：收到 game_state 后按当前阶段响应
      if (envelope.type === 'game_state') {
        const view = envelope.payload['view'] as PlayerView | undefined;
        if (view) this.#autoPlay(view);
      }
    });
    socket.on('close', () => {
      for (const w of this.#waiters) w.reject(new Error('连接关闭'));
      this.#waiters = [];
    });
    socket.on('error', () => {
      // 由 close 事件统一处理
    });
  }

  static async connect(app: App): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new Client(socket);
    await client.waitFor((e) => e.type === 'welcome');
    return client;
  }

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 10_000): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return this.#queue.splice(idx, 1)[0]!;
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error('等待消息超时'));
      }, timeoutMs);
      const wrapped = (e: Envelope): void => {
        clearTimeout(timer);
        resolve(e);
      };
      this.#waiters.push({
        predicate,
        resolve: wrapped,
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** 发一条并等它的 ack 或 error */
  async request(type: string, payload: unknown): Promise<Envelope> {
    const requestId = `smoke-${++reqCounter}`;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    return this.waitFor(
      (e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'),
    );
  }

  /** 清空队列中残留的旧消息 */
  drainQueue(): void {
    this.#queue.length = 0;
  }

  close(): void {
    this.socket.close();
  }

  #autoPlay(view: PlayerView): void {
    const me = view.me;
    if (!me || !me.alive) return;
    const myId = me.playerId;

    // 阶段切换时清理跨阶段去重标记
    if (view.phase !== this.#lastPhase) {
      this.#lastPhase = view.phase;
      this.#inFlight.delete('confirm_word');
      this.#inFlight.delete('cast_vote');
    }

    switch (view.phase) {
      case 'word_reveal': {
        if (!me.confirmed && !this.#inFlight.has('confirm_word')) {
          this.#inFlight.add('confirm_word');
          this.#fireAction({ type: 'confirm_word' }, 'confirm_word');
        }
        break;
      }
      case 'speaking': {
        if (view.currentSpeakerId === myId) {
          const key = `finish_speech:${view.round}:${myId}`;
          if (!this.#inFlight.has(key)) {
            this.#inFlight.add(key);
            this.#fireAction({ type: 'finish_speech' }, key);
          }
        }
        break;
      }
      case 'voting':
      case 'runoff_voting': {
        if (!me.hasVoted && !this.#inFlight.has('cast_vote')) {
          const target = this.#pickVoteTarget(view, myId);
          if (target) {
            this.#inFlight.add('cast_vote');
            this.#fireAction({ type: 'cast_vote', targetPlayerId: target }, 'cast_vote');
          }
        }
        break;
      }
    }
  }

  #pickVoteTarget(view: PlayerView, myId: string): string | null {
    // 优先投卧底（测试主体注入）；不能投自己
    if (this.voteTargetId && this.voteTargetId !== myId) {
      if (view.phase === 'runoff_voting') {
        // 加赛只能投候选人
        if (view.runoffCandidates.includes(this.voteTargetId)) return this.voteTargetId;
      } else {
        const alive = view.players.find((p) => p.playerId === this.voteTargetId)?.alive;
        if (alive) return this.voteTargetId;
      }
    }
    // 兜底：投第一个存活的其他玩家（加赛时限定候选人）
    const candidates = view.players
      .filter((p) => p.alive && p.playerId !== myId)
      .map((p) => p.playerId);
    if (view.phase === 'runoff_voting') {
      const cand = candidates.filter((c) => view.runoffCandidates.includes(c));
      return cand[0] ?? null;
    }
    return candidates[0] ?? null;
  }

  /** 发送 game_action 并在 ack/error 后清理去重标记 */
  #fireAction(action: unknown, key: string): void {
    const requestId = `smoke-${++reqCounter}`;
    this.socket.send(
      JSON.stringify({ v: PROTOCOL_VERSION, type: 'game_action', requestId, payload: action }),
    );
    this.waitFor(
      (e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'),
      8000,
    )
      .catch(() => {})
      .finally(() => {
        this.#inFlight.delete(key);
      });
  }
}

// —— 从对局快照中查找卧底（测试加速：定向投票让一局快速结束）——

function findUndercoverId(app: App, roomId: string): string | null {
  const row = app.db
    .prepare(
      `SELECT * FROM game_sessions
       WHERE room_id = ? AND status = 'ACTIVE'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(roomId) as SessionRow | undefined;
  if (!row) return null;
  // V2 会话的 snapshot_json 是版本化信封，统一走会话状态入口解出 raw state。
  const state = loadSessionState(row).state as {
    players: Record<string, { role: string; alive: boolean }>;
  };
  for (const [id, p] of Object.entries(state.players)) {
    if (p.role === 'undercover' && p.alive) return id;
  }
  return null;
}

// —— 测试 ——

test(
  '冒烟性能回归：1 局 4 人 + 2 机器人短时对局完成且堆增长 < 10MB',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const app = await startApp();
    const clients: Client[] = [];
    try {
      // 1. 连接 4 名真人玩家
      for (let i = 0; i < HUMAN_PLAYERS; i++) {
        clients.push(await Client.connect(app));
      }
      const host = clients[0]!;

      // 2. 注入历史房间，并通过真实恢复链路绑定房主连接
      const seeded = seedRoom(app.db, { gameId: 'undercover' });
      const resumed = await host.request('resume_room', {
        roomCode: seeded.roomCode,
        playerId: seeded.hostId,
        resumeToken: seeded.hostResumeToken,
      });
      assert.equal(resumed.type, 'ack', `恢复房主失败：${JSON.stringify(resumed.payload)}`);
      const roomId = seeded.roomId;
      const roomCode = seeded.roomCode;
      host.playerId = seeded.hostId;

      // 3. 3 名真人加入
      for (let i = 1; i < HUMAN_PLAYERS; i++) {
        const ack = await clients[i]!.request('join_room', {
          roomCode,
          nickname: `玩家${i + 1}`,
        });
        assert.equal(ack.type, 'ack', `玩家 ${i + 1} 加入失败：${JSON.stringify(ack.payload)}`);
        clients[i]!.playerId = ack.payload['playerId'] as string;
      }

      // 4. 添加 2 个 rule 机器人
      for (let i = 0; i < BOT_COUNT; i++) {
        const ack = await host.request('room_command', { command: 'add_bot', kind: 'rule' });
        assert.equal(ack.type, 'ack', `添加机器人 ${i + 1} 失败：${JSON.stringify(ack.payload)}`);
      }

      // 4b. 真人全员就绪（机器人加入时自动就绪；房间级"准备"机制）
      for (const c of clients) {
        const readyAck = await c.request('room_command', { command: 'ready', ready: true });
        assert.equal(readyAck.type, 'ack', `玩家就绪失败：${JSON.stringify(readyAck.payload)}`);
      }

      // 清空残留的快照消息，避免干扰 game_state 等待
      for (const c of clients) c.drainQueue();

      // 5. 测量堆前值（仅围绕对局本身，排除启动噪声）
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        globalThis.gc();
      }
      const heapBefore = process.memoryUsage().heapUsed;
      const startMs = Date.now();

      // 6. 开始游戏
      const startAck = await host.request('room_command', { command: 'start_game' });
      assert.equal(startAck.type, 'ack', `开局失败：${JSON.stringify(startAck.payload)}`);

      // 7. 从 DB 快照查找卧底，注入投票目标（定向投票让一局快速结束）
      const undercoverId = findUndercoverId(app, roomId);
      assert.ok(undercoverId, '应能从对局快照中找到卧底');
      for (const c of clients) c.voteTargetId = undercoverId;

      // 8. 等待 game_over 帧（关键路径闭环：confirm_word → finish_speech → cast_vote → game_over）
      const gameOver = await host.waitFor(
        (e) =>
          e.type === 'game_state' &&
          (e.payload['view'] as PlayerView | undefined)?.phase === 'game_over',
        GAME_OVER_WAIT_MS,
      );
      const durationMs = Date.now() - startMs;

      // 9. 测量堆后值
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        globalThis.gc();
      }
      const heapAfter = process.memoryUsage().heapUsed;
      const heapGrowth = heapAfter - heapBefore;

      // 10. 断言关键路径无异常：平民胜（卧底被淘汰）
      const view = gameOver.payload['view'] as PlayerView;
      assert.equal(view.winner, 'civilian', '卧底应被淘汰，平民胜');

      // 11. 断言堆增长 < 10MB
      assert.ok(
        heapGrowth < HEAP_GROWTH_LIMIT_MB * 1024 * 1024,
        `heap 增长 ${Math.round(heapGrowth / 1024 / 1024)}MB 超过 ${HEAP_GROWTH_LIMIT_MB}MB`,
      );

      // 12. 断言时长 < 30 秒
      assert.ok(
        durationMs < TEST_TIMEOUT_MS,
        `对局耗时 ${Math.round(durationMs / 1000)}s 超过 ${TEST_TIMEOUT_MS / 1000}s`,
      );

      // 13. 房主关闭房间
      const closeAck = await host.request('room_command', { command: 'close_room' });
      assert.equal(closeAck.type, 'ack', `关闭房间失败：${JSON.stringify(closeAck.payload)}`);
    } finally {
      for (const c of clients) {
        try {
          c.close();
        } catch {
          // 忽略已关闭的连接
        }
      }
      await app.shutdown();
    }
  },
);
