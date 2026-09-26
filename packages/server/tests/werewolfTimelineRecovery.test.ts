import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type WerewolfModeratorView } from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { applyMarkDisconnected } from '../src/core/commands/presence.ts';
import {
  startGame,
  getActiveSession,
  applyGameAction,
} from '../src/core/game/session.ts';
import { consumeDueTimer } from '../src/core/game/timerRunner.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';
import { createLogger } from '../src/boot/logger.ts';
import { createApp, type App } from '../src/app.ts';
import type { ServerConfig } from '../src/config.ts';

function tempDbPath(): string {
  return join(tmpdir(), `ldj-ww-recovery-${randomUUID()}.db`);
}

function cleanupDb(path: string): void {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // 忽略
    }
  }
}

async function makeRoomWithPlayers(
  db: Db,
  executor: RoomCommandExecutor,
  playerCount = 6,
): Promise<{ roomId: string; hostId: string; playerIds: string[] }> {
  const seeded = seedRoom(db, { gameId: 'werewolf' });
  const { roomId, hostId } = seeded;
  for (let index = 2; index <= playerCount; index += 1) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:join${index}`,
      requestId: `join-${index}`,
      handler: (tx) =>
        applyJoinRoom(tx, roomId, {
          roomCode: seeded.roomCode,
          nickname: `玩家${index}`,
          asSpectator: false,
        }),
    });
  }
  const players = (
    db
      .prepare(
        `SELECT player_id FROM room_members
       WHERE room_id = ? AND seat_role = 'player' ORDER BY seat ASC`,
      )
      .all(roomId) as { player_id: string }[]
  ).map((r) => r.player_id);

  for (const playerId of players) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:ready-${playerId}`,
      requestId: `ready-${playerId}`,
      handler: (tx) =>
        applyRoomCommand(tx, roomId, playerId, { command: 'ready', ready: true }, {}),
    });
  }
  return { roomId, hostId, playerIds: players };
}

test('T07a: presence 发现 moderator 断线触发暂停，房主非主持时断线不误暂停', async () => {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  try {
    const executor = new RoomCommandExecutor(db);
    const { roomId, hostId, playerIds } = await makeRoomWithPlayers(db, executor, 6);
    const cardPlayers = playerIds.filter((p) => p !== hostId);

    // 房主以 werewolf_moderator_v1 开局（主持人为 hostId）
    await executor.executeOnRoom({
      roomId,
      actorScope: 'conn:host',
      requestId: 'start-mod-game',
      handler: (tx) =>
        startGame(tx, roomId, {
          rulesetId: 'werewolf_moderator_v1',
        }),
    });

    const session = getActiveSession(db, roomId)!;
    assert.ok(session);

    // 1. 模拟房主身份转移给普通玩家 p2，但对局主持人仍为 hostId
    db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(cardPlayers[0]!, roomId);

    // 当新房主（但非主持人）cardPlayers[0] 断线时：
    const nonModDisconnect = await executor.executeInternal({
      roomId,
      handler: (tx) => applyMarkDisconnected(tx, roomId, cardPlayers[0]!),
    });
    assert.ok(nonModDisconnect);
    assert.equal(nonModDisconnect.outcome.gameOutcome, null);

    // 检查会话快照：未暂停
    let sRow = getActiveSession(db, roomId)!;
    let envelope = JSON.parse(sRow.snapshot_json);
    assert.equal(envelope.state.timelineState.current.paused, false);

    // 2. 主持人（hostId）断线：
    const modDisconnect = await executor.executeInternal({
      roomId,
      handler: (tx) => applyMarkDisconnected(tx, roomId, hostId),
    });
    assert.ok(modDisconnect);
    assert.ok(modDisconnect.outcome.gameOutcome);

    // 检查会话快照：已自动暂停
    sRow = getActiveSession(db, roomId)!;
    envelope = JSON.parse(sRow.snapshot_json);
    assert.equal(envelope.state.timelineState.current.paused, true);
    assert.equal(envelope.state.timelineState.activeTimerToken, null);

    // 3. 主持人重连未手动 resume 时保持 paused
    db.prepare(`UPDATE room_members SET connection_status = 'CONNECTED' WHERE room_id = ? AND player_id = ?`).run(
      roomId,
      hostId,
    );
    sRow = getActiveSession(db, roomId)!;
    envelope = JSON.parse(sRow.snapshot_json);
    assert.equal(envelope.state.timelineState.current.paused, true);

    // 4. 主持人手动发送 moderator_resume 恢复
    const resumeRes = await executor.executeOnRoom({
      roomId,
      actorScope: `player:${hostId}`,
      requestId: 'resume-1',
      handler: (tx) =>
        applyGameAction(
          tx,
          roomId,
          hostId,
          {
            type: 'moderator_resume',
            timelineId: envelope.state.timelineState.current.id,
          },
          'resume-1',
        ),
    });
    assert.ok(resumeRes);
    sRow = getActiveSession(db, roomId)!;
    envelope = JSON.parse(sRow.snapshot_json);
    assert.equal(envelope.state.timelineState.current.paused, false);
  } finally {
    closeDb(db);
  }
});

test('T07a: timer 隔离与 dispatch：旧 revision/stale token 被拒，旧 session 的 timer 不落入新局', async () => {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  try {
    const executor = new RoomCommandExecutor(db);
    const { roomId, hostId } = await makeRoomWithPlayers(db, executor, 6);

    await executor.executeOnRoom({
      roomId,
      actorScope: 'conn:host',
      requestId: 'start-mod-game',
      handler: (tx) =>
        startGame(tx, roomId, {
          rulesetId: 'werewolf_moderator_v1',
          pace: 'fast',
        }),
    });

    const s1 = getActiveSession(db, roomId)!;
    assert.ok(s1);

    // 主持人从 d0-confirm 点击 next 进入首夜
    let env = JSON.parse(s1.snapshot_json);
    await executor.executeOnRoom({
      roomId,
      actorScope: `player:${hostId}`,
      requestId: 'enter-night',
      handler: (tx) =>
        applyGameAction(
          tx,
          roomId,
          hostId,
          {
            type: 'moderator_next',
            timelineId: env.state.timelineState.current.id,
          },
          'enter-night',
        ),
    });

    // 主持人切换为 auto 模式，调度 timer
    const s1Night = getActiveSession(db, roomId)!;
    env = JSON.parse(s1Night.snapshot_json);
    const setAuto = await executor.executeOnRoom({
      roomId,
      actorScope: `player:${hostId}`,
      requestId: 'set-auto',
      handler: (tx) =>
        applyGameAction(
          tx,
          roomId,
          hostId,
          {
            type: 'moderator_set_mode',
            mode: 'auto',
            timelineId: env.state.timelineState.current.id,
          },
          'set-auto',
        ),
    });
    assert.ok(setAuto);
    env = JSON.parse(getActiveSession(db, roomId)!.snapshot_json);

    // 获取待执行的 timer
    const timerRow = db.prepare('SELECT * FROM timers WHERE session_id = ? AND status = ?').get(s1.id, 'pending') as {
      timer_id: string;
      action_json: string;
    };
    assert.ok(timerRow);

    // 1. 尝试使用陈旧的 token 或 timelineId 执行 consumeDueTimer：
    // reducer 内直接忽略（noop），不推进
    const fakeStaleAction = {
      type: 'timeline_timeout',
      timelineId: 'old-stale-id',
      token: 'fake-token',
    };
    db.prepare('UPDATE timers SET action_json = ?, deadline_at = 0 WHERE session_id = ? AND timer_id = ?').run(
      JSON.stringify(fakeStaleAction),
      s1.id,
      timerRow.timer_id,
    );
    const staleOutcome = await executor.executeInternal({
      roomId,
      handler: (tx) => consumeDueTimer(tx, s1.id, timerRow.timer_id),
    });
    assert.ok(staleOutcome); // consumeDueTimer consumed the timer row
    // 但状态未被推进（step 仍未变）
    const s1AfterStale = getActiveSession(db, roomId)!;
    const envAfterStale = JSON.parse(s1AfterStale.snapshot_json);
    assert.equal(envAfterStale.state.timelineState.current.id, env.state.timelineState.current.id);

    // 2. 验证旧 session 的 timer 不落入新局：
    // 在 timers 表中伪造一个属于已被替代的旧 session 的 timer
    const oldSessionId = 'old-session-' + randomUUID();
    db.prepare(
      `INSERT INTO game_sessions (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, ruleset_id, created_at, updated_at)
       VALUES (?, ?, 'werewolf', '0.3.0', 2, 'FINISHED', '{}', 'seed', '{}', 'werewolf_moderator_v1', 1000, 1000)`,
    ).run(oldSessionId, roomId);

    db.prepare(
      `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
       VALUES (?, 'old-timer-1', 0, ?, 'pending')`,
    ).run(oldSessionId, JSON.stringify({ type: 'timeline_timeout', timelineId: 't1', token: 'tok1' }));

    // 尝试执行该旧 session 的 timer
    const oldResult = await executor.executeInternal({
      roomId,
      handler: (tx) => consumeDueTimer(tx, oldSessionId, 'old-timer-1'),
    });
    assert.equal(oldResult, null);
    // 检查该 timer 已被置为 cancelled
    const oldTimerCheck = db.prepare('SELECT status FROM timers WHERE session_id = ? AND timer_id = ?').get(
      oldSessionId,
      'old-timer-1',
    ) as { status: string };
    assert.equal(oldTimerCheck.status, 'cancelled');
  } finally {
    closeDb(db);
  }
});

test('T07b: 持久化 DB 恢复：跨重启到期环节自动推进、后续环节给完整时长、重放幂等无双重动作', async () => {
  const dbFile = tempDbPath();
  const logger = createLogger('error', {}, () => {});
  try {
    // 阶段 1：启动 DB，创建房间，以 moderator 模式开局并开启 auto 模式
    const db1 = openDb({ path: dbFile });
    migrate(db1);
    const executor1 = new RoomCommandExecutor(db1);
    const { roomId, hostId } = await makeRoomWithPlayers(db1, executor1, 6);

    await executor1.executeOnRoom({
      roomId,
      actorScope: 'conn:host',
      requestId: 'start-mod',
      handler: (tx) =>
        startGame(tx, roomId, {
          rulesetId: 'werewolf_moderator_v1',
          pace: 'fast',
        }),
    });

    const s1 = getActiveSession(db1, roomId)!;
    let env1 = JSON.parse(s1.snapshot_json);

    // 主持人进入首夜
    await executor1.executeOnRoom({
      roomId,
      actorScope: `player:${hostId}`,
      requestId: 'next-night',
      handler: (tx) =>
        applyGameAction(
          tx,
          roomId,
          hostId,
          {
            type: 'moderator_next',
            timelineId: env1.state.timelineState.current.id,
          },
          'next-night',
        ),
    });

    // 设为 auto 模式
    const s1AfterNext = getActiveSession(db1, roomId)!;
    env1 = JSON.parse(s1AfterNext.snapshot_json);
    await executor1.executeOnRoom({
      roomId,
      actorScope: `player:${hostId}`,
      requestId: 'set-auto',
      handler: (tx) =>
        applyGameAction(
          tx,
          roomId,
          hostId,
          {
            type: 'moderator_set_mode',
            mode: 'auto',
            timelineId: env1.state.timelineState.current.id,
          },
          'set-auto',
        ),
    });

    const pendingTimerBeforeCrash = db1
      .prepare('SELECT * FROM timers WHERE session_id = ? AND status = ?')
      .get(s1.id, 'pending') as { timer_id: string; deadline_at: number; action_json: string };
    assert.ok(pendingTimerBeforeCrash);
    const oldToken = JSON.parse(pendingTimerBeforeCrash.action_json).token;

    // 阶段 2：服务“崩溃关闭”
    closeDb(db1);

    // 等待 3.1 秒让真实时间跨过首夜 intro 时限 (3000ms)
    await new Promise((r) => setTimeout(r, 3100));

    // 阶段 3：服务重启，使用相同数据库文件，执行 runStartupRecovery
    const db2 = openDb({ path: dbFile });
    const recoverySummary = runStartupRecovery(db2, logger);
    assert.equal(recoverySummary.sessionsRecovered, 1);
    assert.equal(recoverySummary.sessionsAborted, 0);
    assert.equal(recoverySummary.timersFired, 1);

    const s2 = getActiveSession(db2, roomId)!;
    const env2 = JSON.parse(s2.snapshot_json);

    // 验证到期推进：原首夜 intro 环节到期后，已自动推进至下一环节
    assert.notEqual(env2.state.timelineState.current.segment, 'intro');
    // 新环节被赋予了从恢复时间起的完整 durationMs 时长
    assert.ok(env2.state.timelineState.current.endsAt);
    assert.ok(env2.state.timelineState.current.endsAt > Date.now());

    // 验证 timer token 绝对不复用
    assert.notEqual(env2.state.timelineState.activeTimerToken, oldToken);

    // 阶段 4：幂等性测试——再次运行 runStartupRecovery
    const recoveryAgain = runStartupRecovery(db2, logger);
    assert.equal(recoveryAgain.timersFired, 0);

    // 验证聊天与事件不产生双重消息
    const msgCount = db2.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE room_id = ?').get(roomId) as {
      n: number;
    };
    const recoveryThird = runStartupRecovery(db2, logger);
    assert.equal(recoveryThird.timersFired, 0);
    const msgCountAfter = db2.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE room_id = ?').get(roomId) as {
      n: number;
    };
    assert.equal(msgCount.n, msgCountAfter.n);

    closeDb(db2);
  } finally {
    cleanupDb(dbFile);
  }
});

interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  roomSeq?: number;
  payload: Record<string, unknown>;
}

let greqCounter = 0;

class GatewayClient {
  readonly socket: WebSocket;
  readonly allReceived: Envelope[] = [];
  readonly #queue: Envelope[] = [];
  #waiters: { predicate: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];

  constructor(socket: WebSocket) {
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
  }

  static async connect(app: App): Promise<GatewayClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new GatewayClient(socket);
    await Promise.race([
      client.waitFor((e) => e.type === 'welcome'),
      once(socket, 'error').then(([err]) => {
        throw err as Error;
      }),
    ]);
    return client;
  }

  send(type: string, payload: unknown, extra: { requestId?: string } = {}): string {
    const requestId = extra.requestId ?? `greq-${++greqCounter}`;
    this.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type,
        requestId,
        payload,
      }),
    );
    return requestId;
  }

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 4000, tag = 'unknown'): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return this.#queue.splice(idx, 1)[0]!;
    return new Promise<Envelope>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 WS 消息超时: ${tag}`)), timeoutMs);
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
    return this.waitFor(
      (e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'),
      4000,
      `request-${type}`,
    );
  }

  close(): void {
    this.socket.close();
  }
}

test('T07c: 真实 3 客户端 WebSocket：公共 timeline 一致、视角保密、主持断线广播暂停、私聊隔离防泄漏', async () => {
  const dbFile = tempDbPath();
  let app: App | null = null;
  const clients: GatewayClient[] = [];

  try {
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 0,
      dbPath: dbFile,
      publicBaseUrl: null,
      logLevel: 'error',
      allowedOrigins: [],
      allowPrivateLlmUpstream: false,
      llm: { provider: 'openai', baseUrl: null, apiKey: null, model: 'm', thinkingDepth: 'off', timeoutMs: 5000 },
      adminToken: null,
    };
    const logger = createLogger('error', {}, () => {});
    app = createApp(config, logger);
    await app.listen();

    // 1. 种子化 6 人房间
    const seeded = seedRoom(app.db, { gameId: 'werewolf' });
    const roomCode = seeded.roomCode;
    const hostResume = seeded.hostResumeToken;

    // 2. 启动 3 个客户端：cHost (主持人), cP2, cP3
    const cHost = await GatewayClient.connect(app);
    clients.push(cHost);
    const ackHost = await cHost.request('resume_room', {
      roomCode,
      playerId: seeded.hostId,
      resumeToken: hostResume,
    });
    assert.equal(ackHost.type, 'ack');

    const cP2 = await GatewayClient.connect(app);
    clients.push(cP2);
    const ackP2 = await cP2.request('join_room', { roomCode, nickname: '玩家2', asSpectator: false });
    assert.equal(ackP2.type, 'ack');
    const p2Id = ackP2.payload.playerId as string;

    const cP3 = await GatewayClient.connect(app);
    clients.push(cP3);
    const ackP3 = await cP3.request('join_room', { roomCode, nickname: '玩家3', asSpectator: false });
    assert.equal(ackP3.type, 'ack');
    const p3Id = ackP3.payload.playerId as string;

    // 补齐 3 个玩家以达 6 人准入
    for (let i = 4; i <= 6; i += 1) {
      const dummyClient = await GatewayClient.connect(app);
      clients.push(dummyClient);
      const ackDummy = await dummyClient.request('join_room', { roomCode, nickname: `玩家${i}`, asSpectator: false });
      assert.equal(ackDummy.type, 'ack');
      const ackReady = await dummyClient.request('room_command', { command: 'ready', ready: true });
      assert.equal(ackReady.type, 'ack');
    }

    const ackP2Ready = await cP2.request('room_command', { command: 'ready', ready: true });
    assert.equal(ackP2Ready.type, 'ack');
    const ackP3Ready = await cP3.request('room_command', { command: 'ready', ready: true });
    assert.equal(ackP3Ready.type, 'ack');

    // 3. 房主开局（werewolf_moderator_v1）
    const ackStart = await cHost.request('room_command', {
      command: 'start_game',
      gameConfig: { rulesetId: 'werewolf_moderator_v1' },
    });
    assert.equal(ackStart.type, 'ack');

    // 4. 验证三客户端接收到的 game_state 视图
    const hostState = await cHost.waitFor((e) => e.type === 'game_state', 4000, 'hostState');
    const p2State = await cP2.waitFor((e) => e.type === 'game_state', 4000, 'p2State');
    const p3State = await cP3.waitFor((e) => e.type === 'game_state', 4000, 'p3State');

    const hostView = hostState.payload.view as WerewolfModeratorView;
    const p2View = p2State.payload.view as WerewolfModeratorView;
    const p3View = p3State.payload.view as WerewolfModeratorView;

    // 主持人全知，普通玩家严格保密他人身份
    assert.equal(hostView.isModerator, true);
    assert.equal(p2View.isModerator, false);
    assert.equal(p3View.isModerator, false);
    assert.ok(p2View.myRole);
    assert.ok(p3View.myRole);
    // 普通玩家视角中其他人的 role 必须为 undefined
    assert.equal(p2View.players.find((p) => p.playerId === p3Id)?.role, undefined);
    assert.equal(p3View.players.find((p) => p.playerId === p2Id)?.role, undefined);

    // 公共时间线一致
    assert.ok(hostView.timeline);
    assert.ok(p2View.timeline);
    assert.ok(p3View.timeline);
    assert.equal(hostView.timeline.id, p2View.timeline.id);
    assert.equal(p2View.timeline.id, p3View.timeline.id);

    // 5. 私聊隔离测试：p2 发私聊给 p3
    const ackChat = await cP2.request('chat_send', { text: '私密密谋', toPlayerId: p3Id });
    assert.equal(ackChat.type, 'ack');

    // p3 收到私聊
    type ChatBatchPayload = { messages?: Array<{ text?: string }> };
    type GameStateView = { timeline?: { paused?: boolean } };
    const p3Batch = await cP3.waitFor(
      (e) => e.type === 'chat_batch' && Boolean((e.payload as ChatBatchPayload)?.messages?.some((m) => m.text === '私密密谋')),
      4000,
      'p3Batch',
    );
    assert.ok(p3Batch);

    // 主持人及无关玩家绝逃不能收到该私聊
    const leakedToHost = cHost.allReceived.some(
      (e) => e.type === 'chat_batch' && Boolean((e.payload as ChatBatchPayload)?.messages?.some((m) => m.text === '私密密谋')),
    );
    assert.equal(leakedToHost, false);

    // 6. 主持人断线广播暂停
    cHost.close();
    // p2 与 p3 收到断线引起的 game_state 更新
    const p2StatePaused = await cP2.waitFor(
      (e) => e.type === 'game_state' && (e.payload.view as GameStateView)?.timeline?.paused === true,
      4000,
      'p2StatePaused',
    );
    assert.ok(p2StatePaused);
  } finally {
    for (const c of clients) {
      try {
        c.close();
      } catch {
        // 忽略
      }
    }
    if (app) {
      await app.shutdown();
    }
    cleanupDb(dbFile);
  }
});
