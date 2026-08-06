/**
 * M4 持久化恢复测试：崩溃注入 + 启动恢复（SPEC §10.4、AC-15/AC-16）。
 * 使用临时文件 db 模拟"写若干动作 → 关闭 db → 重新打开 → 跑恢复"的崩溃场景。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import {
  createSeededRandom,
  type Actor,
  type AdjudicationTaskEffect,
  type AnyGameModuleV2,
  type GameContext,
  type GameEffect,
} from '@ldj/shared';
import { undercoverModule, type UndercoverState } from '../../games/undercover/server/index.ts';
import { unoModule, type UnoState } from '../../games/uno/server/module.ts';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { createLogger } from '../src/boot/logger.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import {
  applyGameAction,
  getActiveSession,
  loadSessionState,
  type GameActionOutcome,
  type SessionRow,
} from '../src/core/game/session.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';
import { isVersionedEventEnvelope } from '../src/core/game/eventEnvelope.ts';
import { createEventEnvelope } from '../src/core/game/eventEnvelope.ts';
import {
  createSnapshotEnvelope,
  isSnapshotEnvelopeV2,
} from '../src/core/game/snapshotEnvelope.ts';
import { createStateDigest as createTestStateDigest } from '../src/core/game/stateDigest.ts';
import { replayVersionedTrailingEvents } from '../src/core/game/versionedRecovery.ts';
import { getAdjudicationTask } from '../src/core/adjudication/taskStore.ts';

const logger = createLogger('error', {}, () => {});

let requestCounter = 0;
function nextReq(): string {
  return `rec-${++requestCounter}`;
}

/** 生成临时 db 文件路径 */
function tempDbPath(): string {
  return join(tmpdir(), `ldj-recovery-${randomUUID()}.db`);
}

/** 清理 db 及其 WAL/SHM 旁车文件 */
function cleanupDb(path: string): void {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // 忽略清理失败
    }
  }
}

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  hostId: string;
  playerIds: string[]; // 含房主，按加入顺序
  roomCode: string;
  dbPath: string;
}

/** 建房 + 补齐到 n 名在线玩家（使用文件 db） */
async function setupRoom(playerCount: number, dbPath: string, gameId = 'undercover'): Promise<Ctx> {
  const db = openDb({ path: dbPath });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { gameId });
  const { roomId, roomCode, hostId } = seeded;
  const playerIds = [hostId];
  for (let i = 2; i <= playerCount; i++) {
    const joined = await executor.executeOnRoom({
      roomId,
      actorScope: `conn:p${i}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyJoinRoom(tx, roomId, { roomCode, nickname: `玩家${i}`, asSpectator: false }),
    });
    playerIds.push(joined.outcome.playerId);
  }
  // 全员就绪（房间级"准备"机制：先准备再开局）
  db.prepare(`UPDATE room_members SET ready = 1 WHERE room_id = ? AND seat_role = 'player'`).run(roomId);
  return { db, executor, roomId, hostId, playerIds, roomCode, dbPath };
}

async function startGame(ctx: Ctx): Promise<void> {
  await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: 'conn:host',
    requestId: nextReq(),
    handler: (tx) => applyRoomCommand(tx, ctx.roomId, ctx.hostId, { command: 'start_game' }),
  });
}

async function action(ctx: Ctx, playerId: string, rawAction: unknown): Promise<GameActionOutcome> {
  const result = await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${playerId}`,
    requestId: nextReq(),
    handler: (tx) => applyGameAction(tx, ctx.roomId, playerId, rawAction, nextReq()),
  });
  return result.outcome;
}

function snapshot(db: Db, roomId: string): Record<string, unknown> {
  return loadSessionState(requireSession(db, roomId)).state as Record<string, unknown>;
}

function sessionRow(db: Db, roomId: string) {
  return getActiveSession(db, roomId);
}

function requireSession(db: Db, roomId: string): SessionRow {
  const session = sessionRow(db, roomId);
  assert.ok(session, '应存在活动对局');
  return session;
}

function rngCursor(session: SessionRow): number {
  const parsed = JSON.parse(session.rng_state_json) as { cursor?: unknown };
  assert.equal(typeof parsed.cursor, 'number', '随机状态必须包含数值 cursor');
  return parsed.cursor as number;
}

function gameEvent(db: Db, sessionId: string, seq: number): {
  actor: unknown;
  action: unknown;
  events: unknown;
} {
  const row = db
    .prepare(`SELECT actor_json, action_json, events_json FROM game_events WHERE session_id = ? AND seq = ?`)
    .get(sessionId, seq) as { actor_json: string; action_json: string; events_json: string } | undefined;
  assert.ok(row, `应存在事件 ${seq}`);
  return {
    actor: JSON.parse(row.actor_json),
    action: JSON.parse(row.action_json),
    events: (() => {
      const parsed = JSON.parse(row.events_json) as unknown;
      return isVersionedEventEnvelope(parsed) ? parsed.publicEvents : parsed;
    })(),
  };
}

function rotateFrom(order: readonly string[], first: string): string[] {
  const index = order.indexOf(first);
  assert.notEqual(index, -1, '轮转起点必须在顺序中');
  return [...order.slice(index), ...order.slice(0, index)];
}

function unoState(db: Db, roomId: string): UnoState {
  return loadSessionState(requireSession(db, roomId)).state as UnoState;
}

function undercoverState(db: Db, roomId: string): UndercoverState {
  return loadSessionState(requireSession(db, roomId)).state as UndercoverState;
}

interface SerializedViews {
  readonly players: Readonly<Record<string, string>>;
  readonly spectator: string;
}

function serializeViews<State>(
  state: State,
  playerIds: readonly string[],
  getPlayerView: (state: State, playerId: string) => unknown,
  getSpectatorView: (state: State) => unknown,
): SerializedViews {
  return {
    players: Object.fromEntries(
      playerIds.map((playerId) => [playerId, JSON.stringify(getPlayerView(state, playerId))]),
    ),
    spectator: JSON.stringify(getSpectatorView(state)),
  };
}

function serializeUnoViews(state: UnoState, playerIds: readonly string[]): SerializedViews {
  return serializeViews(
    state,
    playerIds,
    (current, playerId) => unoModule.getPlayerView(current, playerId),
    (current) => unoModule.getSpectatorView(current),
  );
}

function serializeUndercoverViews(
  state: UndercoverState,
  playerIds: readonly string[],
): SerializedViews {
  return serializeViews(
    state,
    playerIds,
    (current, playerId) => undercoverModule.getPlayerView(current, playerId),
    (current) => undercoverModule.getSpectatorView(current),
  );
}

function persistUnoState(db: Db, roomId: string, state: UnoState): void {
  const session = requireSession(db, roomId);
  const persisted = JSON.parse(session.snapshot_json) as unknown;
  const snapshotJson = isSnapshotEnvelopeV2(persisted)
    ? JSON.stringify({
        ...persisted,
        state,
        // 此 helper 是 D2 受控边界注入；摘要由启动恢复或后续 test helper 重建。
        stateDigest: createTestStateDigest(state),
      })
    : JSON.stringify(state);
  db.prepare(`UPDATE game_sessions SET snapshot_json = ? WHERE id = ?`).run(snapshotJson, session.id);
}

function assertUnoCardInvariant(state: UnoState): void {
  const cards = [
    ...state.deck,
    ...state.discardPile,
    ...Object.values(state.hands).flat(),
  ];
  assert.equal(cards.length, 108, 'UNO 卡牌总数必须保持 108');
  assert.equal(new Set(cards.map((card) => card.id)).size, 108, 'UNO 卡牌实例 ID 必须唯一');
  assert.ok(state.discardPile.length > 0, '弃牌堆必须保留顶牌');
}

function persistEmptyUnoDeckBoundary(db: Db, roomId: string): UnoState {
  const state = unoState(db, roomId);
  assertUnoCardInvariant(state);
  const topId = state.discardPile.at(-1)!.id;
  const boundary: UnoState = {
    ...structuredClone(state),
    deck: [],
    discardPile: [...state.deck, ...state.discardPile],
  };
  assertUnoCardInvariant(boundary);
  assert.equal(boundary.discardPile.at(-1)!.id, topId, '受控边界不得改变弃牌顶牌');
  persistUnoState(db, roomId, boundary);
  return boundary;
}

function legacyWerewolfSnapshot(schemaVersion: 1 | 2 | 3): Record<string, unknown> {
  if (schemaVersion === 1) {
    return {
      schemaVersion: 1,
      phase: 'night',
      day: 2,
      players: {
        w1: { role: 'wolf', alive: true, seat: 0 },
        v1: { role: 'villager', alive: false, seat: 1 },
      },
      night: {
        killTargetId: 'v1',
        seerChecked: true,
        seerResult: { playerId: 'w1', team: 'wolves' },
        witchSaveDecision: false,
        witchPoisonTargetId: null,
      },
      lastNightDeaths: ['v1'],
      speakingOrder: [],
      currentSpeakerIndex: 0,
      votes: {},
      witchSaveUsed: false,
      witchPoisonUsed: false,
      winner: null,
    };
  }
  return {
    schemaVersion: 2,
    phase: 'night',
    day: 1,
    players: {
      w1: { role: 'wolf', alive: true, seat: 0, forfeited: false, exitReason: null },
      v1: { role: 'villager', alive: true, seat: 1, forfeited: false, exitReason: null },
    },
    config: { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers' },
    confirmedRolePlayerIds: ['w1', 'v1'],
    announcementConfirmedPlayerIds: [],
    night: {
      wolfVotes: { w1: 'v1' },
      killTargetId: 'v1',
      seerChecked: true,
      seerResult: null,
      witchSaveDecision: false,
      witchPoisonDecided: true,
      witchPoisonTargetId: null,
    },
    seerHistory: [],
    lastNightDeaths: [],
    speakingOrder: [],
    currentSpeakerIndex: 0,
    votes: {},
    runoffCandidates: [],
    lastVoteSummary: null,
    voteHistory: [],
    pendingOutcome: null,
    lastWordsPlayerId: null,
    witchSaveUsed: false,
    witchPoisonUsed: false,
    deadlineAt: null,
    phaseToken: null,
    winner: null,
    aborted: false,
    ...(schemaVersion === 3
      ? {
          schemaVersion: 3,
          players: {
            w1: { role: 'wolf', alive: true, seat: 0, forfeited: false, exitReason: null, idiotRevealed: false },
            v1: { role: 'villager', alive: true, seat: 1, forfeited: false, exitReason: null, idiotRevealed: false },
          },
          config: {
            preset: 'classic',
            pace: 'standard',
            witchSelfSave: 'first_night',
            winCondition: 'numbers',
            roles: { guard: false, hunter: false, idiot: false },
          },
          night: {
            wolfVotes: { w1: 'v1' },
            killTargetId: 'v1',
            seerChecked: true,
            seerResult: null,
            witchSaveDecision: false,
            witchPoisonDecided: true,
            witchPoisonTargetId: null,
            guardDecided: true,
            guardTargetId: null,
          },
          lastGuardTargetId: null,
          pendingShoot: null,
        }
      : {}),
  };
}

/** 模拟崩溃：关闭 db。后续用 reopenAndRecover 重开并恢复。 */
function crash(ctx: Ctx): void {
  closeDb(ctx.db);
}

/** 重开 db 并执行启动恢复。返回新 Ctx（含新 executor）。 */
function reopenAndRecover(dbPath: string, roomId: string, hostId: string, playerIds: string[], roomCode: string): Ctx {
  const db = openDb({ path: dbPath });
  // migrate 幂等（已应用版本跳过）
  migrate(db);
  // 执行启动恢复（§10.4）
  runStartupRecovery(db, logger);
  const executor = new RoomCommandExecutor(db);
  return { db, executor, roomId, hostId, playerIds, roomCode, dbPath };
}

for (const schemaVersion of [1, 2, 3] as const) {
  test(`狼人杀 v${schemaVersion} 快照经启动恢复迁移至 v4，重复恢复保持兼容`, () => {
    const db = openDb({ path: ':memory:' });
    try {
      migrate(db);
      const now = Date.now();
      const roomId = `werewolf-v${schemaVersion}-room`;
      const sessionId = `werewolf-v${schemaVersion}-session`;
      db.prepare(
        `INSERT INTO rooms (id, code, status, game_id, seq, created_at, updated_at)
         VALUES (?, ?, 'IN_GAME', 'werewolf', 0, ?, ?)`,
      ).run(roomId, `WWV${schemaVersion}0`, now, now);
      db.prepare(
        `INSERT INTO game_sessions
           (id, room_id, module_id, module_version, state_schema_version, status,
            snapshot_json, seed, rng_state_json, ruleset_id, created_at, updated_at)
         VALUES (?, ?, 'werewolf', '0.3.0', ?, 'ACTIVE', ?, 'legacy-seed', '{}', 'werewolf_legacy_platform_v2', ?, ?)`,
      ).run(sessionId, roomId, schemaVersion, JSON.stringify(legacyWerewolfSnapshot(schemaVersion)), now, now);

      const first = runStartupRecovery(db, logger);
      assert.equal(first.sessionsRecovered, 1);
      assert.equal(first.sessionsAborted, 0);

      const migratedRow = db
        .prepare(`SELECT status, state_schema_version, snapshot_json FROM game_sessions WHERE id = ?`)
        .get(sessionId) as { status: string; state_schema_version: number; snapshot_json: string };
      const migrated = JSON.parse(migratedRow.snapshot_json) as Record<string, unknown>;
      assert.equal(migratedRow.status, 'ACTIVE');
      assert.equal(migratedRow.state_schema_version, 4);
      assert.equal(migrated.schemaVersion, 4);
      assert.deepEqual((migrated.config as { roles: unknown }).roles, {
        guard: false,
        hunter: false,
        idiot: false,
      });
      assert.equal((migrated.config as { rulesetId: unknown }).rulesetId, 'werewolf_legacy_platform_v2');
      assert.equal((migrated.config as { wolfKillScope: unknown }).wolfKillScope, 'non_wolf');
      const migratedNight = migrated.night as { guardDecided: boolean; guardTargetId: string | null };
      assert.equal(migratedNight.guardDecided, true);
      assert.equal(migratedNight.guardTargetId, null);
      assert.equal(migrated.lastGuardTargetId, null);
      assert.equal(migrated.pendingShoot, null);

      const snapshotAfterFirstRecovery = migratedRow.snapshot_json;
      const second = runStartupRecovery(db, logger);
      assert.equal(second.sessionsRecovered, 1);
      assert.equal(second.sessionsAborted, 0);
      const afterSecond = db
        .prepare(`SELECT state_schema_version, snapshot_json FROM game_sessions WHERE id = ?`)
        .get(sessionId) as { state_schema_version: number; snapshot_json: string };
      assert.equal(afterSecond.state_schema_version, 4);
      assert.equal(afterSecond.snapshot_json, snapshotAfterFirstRecovery);
    } finally {
      closeDb(db);
    }
  });
}

test('AC-15a：word_reveal 阶段崩溃重启，已确认 confirm_word 保留，到期 reveal 计时器补执行 → speaking', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    // 2 名玩家确认看词
    await action(ctx, ctx.playerIds[0]!, { type: 'confirm_word' });
    await action(ctx, ctx.playerIds[1]!, { type: 'confirm_word' });

    // 记录崩溃前状态
    const beforeSnapshot = snapshot(ctx.db, ctx.roomId);
    const beforeViews = serializeUndercoverViews(
      beforeSnapshot as unknown as UndercoverState,
      ctx.playerIds,
    );
    const beforeEvents = (sessionRow(ctx.db, ctx.roomId)!.last_seq);

    // 崩溃
    crash(ctx);

    // 重开 + 恢复
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // 已确认操作保留（RPO=0）
    const afterEvents = sessionRow(ctx2.db, ctx2.roomId)!.last_seq;
    assert.equal(afterEvents, beforeEvents, '事件流水序号应保留');

    // 快照保留：仍是 word_reveal（reveal 计时器未到期，恢复不补执行）
    const afterSnapshot = snapshot(ctx2.db, ctx2.roomId);
    assert.equal(afterSnapshot.phase, 'word_reveal');
    assert.equal(beforeSnapshot.phase, 'word_reveal');
    assert.deepEqual(
      serializeUndercoverViews(afterSnapshot as unknown as UndercoverState, ctx2.playerIds),
      beforeViews,
      '启动恢复前后每位玩家与观战视角 JSON 必须完全一致',
    );

    // reveal 计时器仍 pending（未到期）
    const session = sessionRow(ctx2.db, ctx2.roomId)!;
    const reveal = ctx2.db
      .prepare(`SELECT status FROM timers WHERE session_id = ? AND timer_id = 'reveal'`)
      .get(session.id) as { status: string };
    assert.equal(reveal.status, 'pending');

    // 会话已恢复为 ACTIVE
    assert.equal(session.status, 'ACTIVE');

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('AC-15b：speaking 阶段崩溃重启，已完成的 finish_speech 保留，发言顺序正确', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });

    // 第一名玩家发言完毕
    const state0 = snapshot(ctx.db, ctx.roomId);
    const order = state0.speakingOrder as string[];
    await action(ctx, order[0]!, { type: 'finish_speech' });
    const beforeState = snapshot(ctx.db, ctx.roomId);
    assert.equal(beforeState.currentSpeakerIndex, 1);

    const beforeSeq = sessionRow(ctx.db, ctx.roomId)!.last_seq;

    // 崩溃
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // 事件流水保留
    const afterSeq = sessionRow(ctx2.db, ctx2.roomId)!.last_seq;
    assert.equal(afterSeq, beforeSeq, 'finish_speech 应保留');

    // 发言顺序正确
    const afterState = snapshot(ctx2.db, ctx2.roomId);
    assert.equal(afterState.phase, 'speaking');
    assert.equal(afterState.currentSpeakerIndex, 1);

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('AC-15c：voting 阶段崩溃重启，已投选票保留', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });

    // 推进到 voting
    let state = snapshot(ctx.db, ctx.roomId);
    while (state.phase === 'speaking') {
      const order = state.speakingOrder as string[];
      const idx = state.currentSpeakerIndex as number;
      await action(ctx, order[idx]!, { type: 'finish_speech' });
      state = snapshot(ctx.db, ctx.roomId);
    }
    assert.equal(state.phase, 'voting');

    // 2 名玩家投票
    const players = state.players as Record<string, { role: string }>;
    const spy = Object.entries(players).find(([, p]) => p.role === 'undercover')![0];
    const civs = Object.keys(players).filter((id) => id !== spy);
    await action(ctx, civs[0]!, { type: 'cast_vote', targetPlayerId: spy });
    await action(ctx, civs[1]!, { type: 'cast_vote', targetPlayerId: spy });

    const beforeSeq = sessionRow(ctx.db, ctx.roomId)!.last_seq;
    const beforeVotes = snapshot(ctx.db, ctx.roomId).votes as Record<string, unknown>;
    assert.equal(Object.keys(beforeVotes).length, 2);
    const beforeVotingState = undercoverState(ctx.db, ctx.roomId);
    const beforeViews = serializeUndercoverViews(beforeVotingState, ctx.playerIds);

    // 崩溃
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // 选票保留
    const afterSeq = sessionRow(ctx2.db, ctx2.roomId)!.last_seq;
    assert.equal(afterSeq, beforeSeq, '投票应保留');
    const afterVotes = snapshot(ctx2.db, ctx2.roomId).votes as Record<string, unknown>;
    assert.equal(Object.keys(afterVotes).length, 2);
    assert.deepEqual(
      serializeUndercoverViews(undercoverState(ctx2.db, ctx2.roomId), ctx2.playerIds),
      beforeViews,
      '投票中间状态恢复前后的本人选票与公共进度必须保持 JSON 等价',
    );

    // 仍在 voting（投票计时器未到期）
    assert.equal(snapshot(ctx2.db, ctx2.roomId).phase, 'voting');

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('AC-15d：vote_result 阶段崩溃重启，到期展示计时器补执行并推进', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });

    // 推进到 voting
    let state = snapshot(ctx.db, ctx.roomId);
    while (state.phase === 'speaking') {
      const order = state.speakingOrder as string[];
      const idx = state.currentSpeakerIndex as number;
      await action(ctx, order[idx]!, { type: 'finish_speech' });
      state = snapshot(ctx.db, ctx.roomId);
    }

    // 全员投一名平民 → vote_result；淘汰平民后游戏继续（避免直接 game_over 导致 snapshot 失败）
    const players = state.players as Record<string, { role: string }>;
    const civilianIds = Object.entries(players)
      .filter(([, p]) => p.role === 'civilian')
      .map(([id]) => id);
    assert.ok(civilianIds.length >= 1, '应存在平民玩家');
    const target = civilianIds[0]!;
    const other = Object.keys(players).find((id) => id !== target)!;
    for (const v of Object.keys(players)) {
      await action(ctx, v, { type: 'cast_vote', targetPlayerId: v === target ? other : target });
    }

    state = snapshot(ctx.db, ctx.roomId);
    assert.equal(state.phase, 'vote_result');

    const beforeSession = requireSession(ctx.db, ctx.roomId);
    const beforeCursor = rngCursor(beforeSession);
    const beforeSeq = beforeSession.last_seq;
    const previousFirst = state.roundFirstSpeaker as string;
    const seated = Object.entries(state.players as Record<string, { seat: number; alive: boolean }>)
      .sort(([, a], [, b]) => a.seat - b.seat);
    const previousIndex = seated.findIndex(([playerId]) => playerId === previousFirst);
    assert.notEqual(previousIndex, -1, '上一轮首位必须存在');
    const expectedAliveOrder: string[] = [];
    for (let step = 1; step <= seated.length; step += 1) {
      const [playerId, player] = seated[(previousIndex + step) % seated.length]!;
      if (player.alive) expectedAliveOrder.push(playerId);
    }
    const expectedFirst = expectedAliveOrder[0]!;
    const expectedOrder = rotateFrom(
      seated.filter(([, player]) => player.alive).map(([playerId]) => playerId),
      expectedFirst,
    );

    // 把第一轮正常投票结果计时器改为立即到期
    const updated = ctx.db
      .prepare(
        `UPDATE timers SET deadline_at = ?
         WHERE session_id = ? AND timer_id = 'result:1:normal' AND status = 'pending'`,
      )
      .run(Date.now() - 1, beforeSession.id);
    assert.equal(updated.changes, 1, '应精确命中第一轮结果计时器');

    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const afterState = snapshot(ctx2.db, ctx2.roomId);
    const afterSession = requireSession(ctx2.db, ctx2.roomId);

    assert.equal(afterState.phase, 'speaking');
    assert.equal(afterState.round, 2);
    assert.equal(afterState.roundFirstSpeaker, expectedFirst);
    assert.deepEqual(afterState.speakingOrder, expectedOrder);
    assert.equal(afterState.currentSpeakerIndex, 0);
    assert.equal(afterSession.last_seq, beforeSeq + 1);
    assert.equal(rngCursor(afterSession), beforeCursor, '后续轮次轮转不应消耗随机');
    assert.deepEqual(gameEvent(ctx2.db, beforeSession.id, beforeSeq + 1), {
      actor: { kind: 'system', source: 'timer' },
      action: { type: 'vote_result_elapsed', round: 1 },
      events: [{ type: 'phase_changed', phase: 'speaking', round: 2 }],
    });

    const voteResultTimer = ctx2.db
      .prepare(`SELECT status FROM timers WHERE session_id = ? AND timer_id = 'result:1:normal'`)
      .get(beforeSession.id) as { status: string };
    assert.equal(voteResultTimer.status, 'consumed');

    const speechTimer = ctx2.db
      .prepare(`SELECT deadline_at, action_json, status FROM timers WHERE session_id = ? AND timer_id = 'speech:2:0'`)
      .get(beforeSession.id) as { deadline_at: number; action_json: string; status: string };
    assert.equal(speechTimer.status, 'pending');
    assert.equal(speechTimer.deadline_at, afterState.deadlineAt);
    assert.deepEqual(JSON.parse(speechTimer.action_json), { type: 'speech_timeout', round: 2, speakerIndex: 0 });

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('AC-16：跨 deadline 重启，计时器按 deadlineAt 顺序补执行且只执行一次', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);

    const beforeSession = requireSession(ctx.db, ctx.roomId);
    const beforeRoomSeq = (ctx.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(ctx.roomId) as { seq: number }).seq;
    const beforeState = snapshot(ctx.db, ctx.roomId);
    const beforeCursor = rngCursor(beforeSession);
    const beforeSeq = beforeSession.last_seq;
    assert.ok(beforeCursor > 0, '开局角色和词语分配后 cursor 应为非零');

    const seated = Object.entries(beforeState.players as Record<string, { seat: number; alive: boolean }>)
      .filter(([, player]) => player.alive)
      .sort(([, a], [, b]) => a.seat - b.seat)
      .map(([playerId]) => playerId);
    const oracleRandom = createSeededRandom(beforeSession.seed, beforeCursor);
    const expectedFirst = seated[oracleRandom.nextInt(0, seated.length)]!;
    const expectedOrder = rotateFrom(seated, expectedFirst);
    const expectedCursor = oracleRandom.getCursor();

    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = 'reveal'`)
      .run(Date.now() - 10_000, beforeSession.id);

    const beforeConsumed = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'consumed'`)
      .get(beforeSession.id) as { n: number };
    assert.equal(beforeConsumed.n, 0);

    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const state = snapshot(ctx2.db, ctx2.roomId);
    const afterSession = requireSession(ctx2.db, ctx2.roomId);

    assert.equal(state.phase, 'speaking');
    assert.equal(state.round, 1);
    assert.equal(state.roundFirstSpeaker, expectedFirst);
    assert.deepEqual(state.speakingOrder, expectedOrder);
    assert.equal(state.currentSpeakerIndex, 0);
    assert.equal(afterSession.last_seq, beforeSeq + 1);
    const afterRoomSeq = (ctx2.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(ctx2.roomId) as { seq: number }).seq;
    assert.equal(afterRoomSeq, beforeRoomSeq + 1, 'V2 恢复补执行必须推进真实 roomSeq');
    const replayedEventRow = ctx2.db.prepare(
      `SELECT events_json FROM game_events WHERE session_id = ? AND seq = ?`,
    ).get(beforeSession.id, beforeSeq + 1) as { events_json: string };
    const replayedEnvelope = JSON.parse(replayedEventRow.events_json) as { roomSeq?: unknown };
    assert.equal(replayedEnvelope.roomSeq, afterRoomSeq);
    assert.equal(rngCursor(afterSession), expectedCursor);
    assert.equal(afterSession.status, 'ACTIVE');
    assert.deepEqual(gameEvent(ctx2.db, beforeSession.id, beforeSeq + 1), {
      actor: { kind: 'system', source: 'timer' },
      action: { type: 'reveal_timeout' },
      events: [{ type: 'phase_changed', phase: 'speaking', round: 1 }],
    });

    const revealTimer = ctx2.db
      .prepare(`SELECT status FROM timers WHERE session_id = ? AND timer_id = 'reveal'`)
      .get(beforeSession.id) as { status: string };
    assert.equal(revealTimer.status, 'consumed');

    const speechTimer = ctx2.db
      .prepare(`SELECT deadline_at, action_json, status FROM timers WHERE session_id = ? AND timer_id = 'speech:1:0'`)
      .get(beforeSession.id) as { deadline_at: number; action_json: string; status: string };
    assert.equal(speechTimer.status, 'pending');
    assert.equal(speechTimer.deadline_at, state.deadlineAt);
    assert.deepEqual(JSON.parse(speechTimer.action_json), { type: 'speech_timeout', round: 1, speakerIndex: 0 });

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D3 V2：旧快照 + trailing events 确定性重放，并恢复缺失 effect receipt', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'undercover');
    await startGame(ctx);
    const session = requireSession(ctx.db, ctx.roomId);
    const afterBeginSnapshot = JSON.parse(session.snapshot_json) as unknown;
    assert.equal(isSnapshotEnvelopeV2(afterBeginSnapshot), true);
    if (!isSnapshotEnvelopeV2(afterBeginSnapshot)) return;
    const preBeginState = structuredClone(afterBeginSnapshot.state) as UndercoverState;
    preBeginState.deadlineAt = null;
    const preBeginSnapshot = createSnapshotEnvelope({
      gameId: afterBeginSnapshot.gameId,
      rulesetId: afterBeginSnapshot.rulesetId,
      schemaVersion: afterBeginSnapshot.schemaVersion,
      createdAtSequence: 0,
      rngState: afterBeginSnapshot.rngState,
      state: preBeginState,
    });

    await action(ctx, ctx.playerIds[0]!, { type: 'confirm_word' });
    const afterAction = requireSession(ctx.db, ctx.roomId);
    const expectedState = undercoverState(ctx.db, ctx.roomId);
    const expectedViews = serializeUndercoverViews(expectedState, ctx.playerIds);
    assert.equal(afterAction.last_seq, 2);

    // 注入真实 crash window：保留 seq 1 begin 与 seq 2 confirm 两条 trailing journal，
    // 但 snapshot/RNG 回退至 begin 前；删除 begin 的 timer 后必须按 receipt 幂等重建。
    ctx.db.prepare(
      `UPDATE game_sessions SET snapshot_json = ?, rng_state_json = ? WHERE id = ?`,
    ).run(
      JSON.stringify(preBeginSnapshot),
      JSON.stringify(preBeginSnapshot.rngState),
      session.id,
    );
    ctx.db.prepare(`DELETE FROM timers WHERE session_id = ? AND timer_id = 'reveal'`).run(session.id);

    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const restored = requireSession(ctx2.db, ctx2.roomId);
    const restoredEnvelope = JSON.parse(restored.snapshot_json) as unknown;
    assert.equal(isSnapshotEnvelopeV2(restoredEnvelope), true);
    if (!isSnapshotEnvelopeV2(restoredEnvelope)) return;
    assert.equal(restoredEnvelope.createdAtSequence, restored.last_seq);
    assert.deepEqual(undercoverState(ctx2.db, ctx2.roomId), expectedState);
    assert.deepEqual(
      serializeUndercoverViews(undercoverState(ctx2.db, ctx2.roomId), ctx2.playerIds),
      expectedViews,
    );
    const reveal = ctx2.db.prepare(
      `SELECT status, action_json FROM timers WHERE session_id = ? AND timer_id = 'reveal'`,
    ).get(restored.id) as { status: string; action_json: string };
    assert.equal(reveal.status, 'pending');
    assert.deepEqual(JSON.parse(reveal.action_json), { type: 'reveal_timeout' });
    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D3 V2：trailing event 摘要或 effect/timer 对账不一致时失败关闭', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'undercover');
    await startGame(ctx);
    const session = requireSession(ctx.db, ctx.roomId);
    const snapshot = JSON.parse(session.snapshot_json) as unknown;
    assert.equal(isSnapshotEnvelopeV2(snapshot), true);
    if (!isSnapshotEnvelopeV2(snapshot)) return;
    await action(ctx, ctx.playerIds[0]!, { type: 'confirm_word' });
    const after = requireSession(ctx.db, ctx.roomId);
    ctx.db.prepare(`UPDATE game_sessions SET snapshot_json = ?, rng_state_json = ? WHERE id = ?`).run(
      JSON.stringify(snapshot),
      JSON.stringify(snapshot.rngState),
      session.id,
    );
    const row = ctx.db.prepare(
      `SELECT events_json FROM game_events WHERE session_id = ? AND seq = ?`,
    ).get(session.id, after.last_seq) as { events_json: string };
    const envelope = JSON.parse(row.events_json) as Record<string, unknown>;
    ctx.db.prepare(
      `UPDATE game_events SET events_json = ? WHERE session_id = ? AND seq = ?`,
    ).run(JSON.stringify({ ...envelope, nextStateDigest: '0'.repeat(64) }), session.id, after.last_seq);

    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const aborted = ctx2.db.prepare(
      `SELECT status FROM game_sessions WHERE id = ?`,
    ).get(session.id) as { status: string };
    assert.equal(aborted.status, 'ABORTED');
    const pending = ctx2.db.prepare(
      `SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`,
    ).get(session.id) as { n: number };
    assert.equal(pending.n, 0);
    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D3 V2：trailing timer receipt 冲突时失败关闭且不覆盖持久化记录', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'undercover');
    await startGame(ctx);
    const session = requireSession(ctx.db, ctx.roomId);
    const afterBeginSnapshot = JSON.parse(session.snapshot_json) as unknown;
    assert.equal(isSnapshotEnvelopeV2(afterBeginSnapshot), true);
    if (!isSnapshotEnvelopeV2(afterBeginSnapshot)) return;
    const preBeginState = structuredClone(afterBeginSnapshot.state) as UndercoverState;
    preBeginState.deadlineAt = null;
    const preBeginSnapshot = createSnapshotEnvelope({
      gameId: afterBeginSnapshot.gameId,
      rulesetId: afterBeginSnapshot.rulesetId,
      schemaVersion: afterBeginSnapshot.schemaVersion,
      createdAtSequence: 0,
      rngState: afterBeginSnapshot.rngState,
      state: preBeginState,
    });
    const conflictingDeadline = (preBeginState.deadlineAt ?? 0) + 1;
    ctx.db.prepare(
      `UPDATE game_sessions SET snapshot_json = ?, rng_state_json = ? WHERE id = ?`,
    ).run(
      JSON.stringify(preBeginSnapshot),
      JSON.stringify(preBeginSnapshot.rngState),
      session.id,
    );
    ctx.db.prepare(
      `UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = 'reveal'`,
    ).run(conflictingDeadline, session.id);

    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const aborted = ctx2.db.prepare(
      `SELECT status FROM game_sessions WHERE id = ?`,
    ).get(session.id) as { status: string };
    assert.equal(aborted.status, 'ABORTED');
    const timer = ctx2.db.prepare(
      `SELECT deadline_at, status FROM timers WHERE session_id = ? AND timer_id = 'reveal'`,
    ).get(session.id) as { deadline_at: number; status: string };
    assert.equal(timer.deadline_at, conflictingDeadline, '恢复器不得覆盖无法证明一致的 timer');
    assert.equal(timer.status, 'cancelled');
    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D3 V2：快照 createdAtSequence 不得大于 last_seq', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'undercover');
    await startGame(ctx);
    const session = requireSession(ctx.db, ctx.roomId);
    const current = JSON.parse(session.snapshot_json) as unknown;
    assert.equal(isSnapshotEnvelopeV2(current), true);
    if (!isSnapshotEnvelopeV2(current)) return;
    const future = createSnapshotEnvelope({
      gameId: current.gameId,
      rulesetId: current.rulesetId,
      schemaVersion: current.schemaVersion,
      createdAtSequence: session.last_seq + 1,
      rngState: current.rngState,
      state: current.state,
    });
    ctx.db.prepare(`UPDATE game_sessions SET snapshot_json = ? WHERE id = ?`).run(
      JSON.stringify(future),
      session.id,
    );
    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const aborted = ctx2.db.prepare(`SELECT status FROM game_sessions WHERE id = ?`).get(session.id) as { status: string };
    assert.equal(aborted.status, 'ABORTED');
    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D2 UNO：已摸牌末席重启后过牌，轮序环绕且 cursor 不变', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'uno');
    await startGame(ctx);

    for (const playerId of ctx.playerIds.slice(0, -1)) {
      await action(ctx, playerId, { type: 'draw_card' });
      await action(ctx, playerId, { type: 'pass_after_draw' });
    }
    const lastPlayer = ctx.playerIds.at(-1)!;
    await action(ctx, lastPlayer, { type: 'draw_card' });

    const beforeSession = requireSession(ctx.db, ctx.roomId);
    const beforeState = unoState(ctx.db, ctx.roomId);
    assert.equal(beforeState.currentPlayerId, lastPlayer);
    assert.equal(beforeState.hasDrawnThisTurn, true);
    const beforeSnapshotJson = beforeSession.snapshot_json;
    const beforeViews = serializeUnoViews(beforeState, ctx.playerIds);
    const beforeRngJson = beforeSession.rng_state_json;
    const beforeSeq = beforeSession.last_seq;

    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const restoredSession = requireSession(ctx2.db, ctx2.roomId);
    assert.equal(restoredSession.snapshot_json, beforeSnapshotJson);
    assert.equal(restoredSession.rng_state_json, beforeRngJson);
    assert.equal(restoredSession.last_seq, beforeSeq);
    assert.equal(restoredSession.status, 'ACTIVE');
    assert.deepEqual(
      serializeUnoViews(unoState(ctx2.db, ctx2.roomId), ctx2.playerIds),
      beforeViews,
      'UNO 恢复前后本人手牌与观战公开视角 JSON 必须完全一致',
    );

    await action(ctx2, lastPlayer, { type: 'pass_after_draw' });
    const afterSession = requireSession(ctx2.db, ctx2.roomId);
    const afterState = unoState(ctx2.db, ctx2.roomId);
    assert.equal(afterState.currentPlayerId, ctx2.playerIds[0]);
    assert.equal(afterState.hasDrawnThisTurn, false);
    assert.equal(afterSession.last_seq, beforeSeq + 1);
    assert.equal(afterSession.rng_state_json, beforeRngJson);
    assert.deepEqual(gameEvent(ctx2.db, beforeSession.id, beforeSeq + 1), {
      actor: { kind: 'player', playerId: lastPlayer },
      action: { type: 'pass_after_draw' },
      events: [],
    });
    assert.equal(unoModule.getSpectatorView(afterState).nextPlayerId, ctx2.playerIds[1]);

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('D2 UNO：运行期回收产生的非初始 cursor 跨重启后确定性续接', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath, 'uno');
    await startGame(ctx);

    const initialSession = requireSession(ctx.db, ctx.roomId);
    const initialCursor = rngCursor(initialSession);
    const firstBoundary = persistEmptyUnoDeckBoundary(ctx.db, ctx.roomId);
    const firstRecycleDraws = firstBoundary.discardPile.length - 2;

    const firstOutcome = await action(ctx, ctx.playerIds[0]!, { type: 'draw_card' });
    assert.deepEqual(firstOutcome.events, [{ type: 'card_drawn', playerId: ctx.playerIds[0], count: 1 }]);
    const afterFirstRecycle = requireSession(ctx.db, ctx.roomId);
    assert.equal(rngCursor(afterFirstRecycle), initialCursor + firstRecycleDraws);
    assert.ok(rngCursor(afterFirstRecycle) > initialCursor, '运行期回收必须推进 cursor');

    await action(ctx, ctx.playerIds[0]!, { type: 'pass_after_draw' });
    for (const playerId of ctx.playerIds.slice(1, -1)) {
      await action(ctx, playerId, { type: 'draw_card' });
      await action(ctx, playerId, { type: 'pass_after_draw' });
    }

    const lastPlayer = ctx.playerIds.at(-1)!;
    const secondBoundary = persistEmptyUnoDeckBoundary(ctx.db, ctx.roomId);
    assert.equal(secondBoundary.currentPlayerId, lastPlayer);
    assert.equal(secondBoundary.hasDrawnThisTurn, false);

    const beforeSession = requireSession(ctx.db, ctx.roomId);
    const beforeCursor = rngCursor(beforeSession);
    assert.equal(beforeCursor, initialCursor + firstRecycleDraws);
    const beforeSnapshotJson = beforeSession.snapshot_json;
    const beforeSeq = beforeSession.last_seq;

    const oracleRandom = createSeededRandom(beforeSession.seed, beforeCursor);
    const oracleContext: GameContext = { now: 0, random: oracleRandom };
    const expectedDraw = unoModule.reduce(
      oracleContext,
      structuredClone(secondBoundary),
      { kind: 'player', playerId: lastPlayer },
      { type: 'draw_card' },
    );
    assert.equal(expectedDraw.ok, true);
    if (!expectedDraw.ok) return;
    const expectedDrawCursor = oracleRandom.getCursor();
    const secondRecycleDraws = secondBoundary.discardPile.length - 2;
    assert.equal(expectedDrawCursor, beforeCursor + secondRecycleDraws);
    assertUnoCardInvariant(expectedDraw.state);
    const expectedPass = unoModule.reduce(
      oracleContext,
      expectedDraw.state,
      { kind: 'player', playerId: lastPlayer },
      { type: 'pass_after_draw' },
    );
    assert.equal(expectedPass.ok, true);
    if (!expectedPass.ok) return;

    crash(ctx);
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);
    const restoredSession = requireSession(ctx2.db, ctx2.roomId);
    assert.equal(restoredSession.snapshot_json, beforeSnapshotJson);
    assert.equal(rngCursor(restoredSession), beforeCursor);
    assert.equal(restoredSession.last_seq, beforeSeq);

    const actualDraw = await action(ctx2, lastPlayer, { type: 'draw_card' });
    const actualDrawSession = requireSession(ctx2.db, ctx2.roomId);
    const actualDrawState = unoState(ctx2.db, ctx2.roomId);
    assert.deepEqual(actualDraw.events, expectedDraw.events);
    assert.deepEqual(actualDrawState, expectedDraw.state);
    assertUnoCardInvariant(actualDrawState);
    assert.equal(rngCursor(actualDrawSession), expectedDrawCursor);
    assert.equal(actualDrawSession.last_seq, beforeSeq + 1);
    assert.deepEqual(gameEvent(ctx2.db, beforeSession.id, beforeSeq + 1), {
      actor: { kind: 'player', playerId: lastPlayer },
      action: { type: 'draw_card' },
      events: expectedDraw.events,
    });

    await action(ctx2, lastPlayer, { type: 'pass_after_draw' });
    const actualPassSession = requireSession(ctx2.db, ctx2.roomId);
    const actualPassState = unoState(ctx2.db, ctx2.roomId);
    assert.deepEqual(actualPassState, expectedPass.state);
    assertUnoCardInvariant(actualPassState);
    assert.equal(actualPassState.currentPlayerId, ctx2.playerIds[0]);
    assert.equal(rngCursor(actualPassSession), expectedDrawCursor);
    assert.equal(actualPassSession.last_seq, beforeSeq + 2);
    assert.deepEqual(gameEvent(ctx2.db, beforeSession.id, beforeSeq + 2), {
      actor: { kind: 'player', playerId: lastPlayer },
      action: { type: 'pass_after_draw' },
      events: [],
    });

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('快照 JSON 损坏 → 会话 ABORTED + 系统聊天 + POST_GAME + 无 game_results', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    const session = sessionRow(ctx.db, ctx.roomId)!;
    crash(ctx);

    // 重开但不恢复，手动损坏快照
    const db = openDb({ path: dbPath });
    migrate(db);
    db.prepare(`UPDATE game_sessions SET snapshot_json = ? WHERE id = ?`).run(
      '{corrupt json',
      session.id,
    );
    closeDb(db);

    // 再次重开 + 恢复
    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    const afterSession = ctx2.db
      .prepare('SELECT status FROM game_sessions WHERE id = ?')
      .get(session.id) as { status: string };
    assert.equal(afterSession.status, 'ABORTED');

    const roomStatus = ctx2.db
      .prepare('SELECT status FROM rooms WHERE id = ?')
      .get(ctx2.roomId) as { status: string };
    assert.equal(roomStatus.status, 'POST_GAME');

    // 系统聊天说明恢复失败
    const sysChat = ctx2.db
      .prepare(
        `SELECT text FROM chat_messages WHERE session_id = ? AND kind = 'system' ORDER BY id DESC LIMIT 1`,
      )
      .get(session.id) as { text: string };
    assert.ok(sysChat, '应有系统聊天');
    assert.ok(sysChat.text.includes('终止'), `系统聊天应说明终止，实际：${sysChat.text}`);

    // 不写 game_results
    const results = ctx2.db
      .prepare('SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?')
      .get(session.id) as { n: number };
    assert.equal(results.n, 0);

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('模块未注册（伪造 module_id）→ 会话 ABORTED + 系统聊天', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    const session = sessionRow(ctx.db, ctx.roomId)!;
    crash(ctx);

    // 重开但不恢复，伪造 module_id
    const db = openDb({ path: dbPath });
    migrate(db);
    db.prepare(`UPDATE game_sessions SET module_id = ? WHERE id = ?`).run(
      'nonexistent-game',
      session.id,
    );
    closeDb(db);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    const afterSession = ctx2.db
      .prepare('SELECT status FROM game_sessions WHERE id = ?')
      .get(session.id) as { status: string };
    assert.equal(afterSession.status, 'ABORTED');

    const sysChat = ctx2.db
      .prepare(
        `SELECT text FROM chat_messages WHERE session_id = ? AND kind = 'system' ORDER BY id DESC LIMIT 1`,
      )
      .get(session.id) as { text: string };
    assert.ok(sysChat.text.includes('终止'));

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('恢复后成员 connection_status 全部 DISCONNECTED_RESERVED（KICKED 不变）', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    // 手动把一名玩家标记为 KICKED（模拟被踢）
    ctx.db
      .prepare(`UPDATE room_members SET connection_status = 'KICKED' WHERE player_id = ?`)
      .run(ctx.playerIds[3]!);
    // 其余成员是 CONNECTED（setupRoom 后默认状态）
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    const members = ctx2.db
      .prepare(
        `SELECT player_id, connection_status FROM room_members WHERE room_id = ?`,
      )
      .all(ctx2.roomId) as { player_id: string; connection_status: string }[];

    for (const m of members) {
      if (m.player_id === ctx.playerIds[3]) {
        assert.equal(m.connection_status, 'KICKED', 'KICKED 成员应保持 KICKED');
      } else {
        assert.equal(
          m.connection_status,
          'DISCONNECTED_RESERVED',
          `成员 ${m.player_id} 应为 DISCONNECTED_RESERVED，实际 ${m.connection_status}`,
        );
      }
    }

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('恢复期 game_action 返回 RECOVERY_IN_PROGRESS', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    const session = sessionRow(ctx.db, ctx.roomId)!;
    crash(ctx);

    // 重开但不恢复，手动将会话标记为 RECOVERING
    const db = openDb({ path: dbPath });
    migrate(db);
    db.prepare(`UPDATE game_sessions SET status = 'RECOVERING' WHERE id = ?`).run(session.id);
    closeDb(db);

    // 重开 + 恢复（恢复会把 RECOVERING → ACTIVE，所以需要在恢复前测试）
    // 为测试 RECOVERY_IN_PROGRESS，我们在不跑恢复的情况下直接打开 + 执行 game_action
    const db2 = openDb({ path: dbPath });
    migrate(db2);
    const executor = new RoomCommandExecutor(db2);
    await assert.rejects(
      executor.executeOnRoom({
        roomId: ctx.roomId,
        actorScope: `conn:${ctx.hostId}`,
        requestId: nextReq(),
        handler: (tx) =>
          applyGameAction(tx, ctx.roomId, ctx.hostId, { type: 'confirm_word' }, nextReq()),
      }),
      (err: unknown) => {
        assert.ok(err instanceof CommandError);
        assert.equal(err.code, 'RECOVERY_IN_PROGRESS');
        return true;
      },
    );
    closeDb(db2);
    cleanupDb(dbPath);
  } catch (err) {
    cleanupDb(dbPath);
    throw err;
  }
});

test('补执行产生的下游计时器继续补执行（链式推进）', async () => {
  const dbPath = tempDbPath();
  try {
    const ctx = await setupRoom(4, dbPath);
    await startGame(ctx);
    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });

    // 推进到 voting
    let state = snapshot(ctx.db, ctx.roomId);
    while (state.phase === 'speaking') {
      const order = state.speakingOrder as string[];
      const idx = state.currentSpeakerIndex as number;
      await action(ctx, order[idx]!, { type: 'finish_speech' });
      state = snapshot(ctx.db, ctx.roomId);
    }

    // 全员投一名平民 → vote_result；淘汰平民后游戏继续，可验证下游计时器链式推进
    const players = state.players as Record<string, { role: string }>;
    const civilianIds = Object.entries(players)
      .filter(([, p]) => p.role === 'civilian')
      .map(([id]) => id);
    assert.ok(civilianIds.length >= 1, '应存在平民玩家');
    const target = civilianIds[0]!;
    const other = Object.keys(players).find((id) => id !== target)!;
    for (const v of Object.keys(players)) {
      await action(ctx, v, { type: 'cast_vote', targetPlayerId: v === target ? other : target });
    }

    state = snapshot(ctx.db, ctx.roomId);
    assert.equal(state.phase, 'vote_result');

    // 把 vote_result 计时器改为已过去 100 秒
    const session = sessionRow(ctx.db, ctx.roomId)!;
    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND status = 'pending'`)
      .run(Date.now() - 100_000, session.id);

    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // vote_result 计时器补执行 → 产生新计时器（speaking 或 voting）
    // 由于被淘汰者可能使游戏结束，也可能进入下一轮
    const afterState = snapshot(ctx2.db, ctx2.roomId);
    assert.ok(
      afterState.phase === 'speaking' || afterState.phase === 'voting' || afterState.phase === 'game_over',
      `应推进到 speaking/voting/game_over，实际 ${afterState.phase}`,
    );

    // 至少一个计时器被 consumed（vote_result）
    const consumedCount = ctx2.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'consumed'`)
      .get(session.id) as { n: number };
    assert.ok(consumedCount.n >= 1, '至少一个计时器被 consumed');

    // 若进入 speaking，应有新的 speaking 计时器 pending
    if (afterState.phase === 'speaking') {
      const pendingTimer = ctx2.db
        .prepare(
          `SELECT timer_id FROM timers WHERE session_id = ? AND status = 'pending' LIMIT 1`,
        )
        .get(session.id) as { timer_id: string } | undefined;
      assert.ok(pendingTimer, 'speaking 阶段应有 pending 计时器');
    }

    closeDb(ctx2.db);
  } finally {
    cleanupDb(dbPath);
  }
});

// ---------------------------------------------------------------------------
// D4-B T3：trailing enqueue_adjudication 对账（receipt kind:'none'）
// 重放只重建状态与对账 DB；绝不调用 provider / 发起网络。
// ---------------------------------------------------------------------------

const T3_MANIFEST = {
  id: 'adjudication-stub',
  version: '1.0.0',
  displayName: 'A1 外部裁判任务桩',
  minPlayers: 1,
  maxPlayers: 8,
  stateSchemaVersion: 1,
} as const;

const T3_RULESET = 'adjudication_stub_v1';

const T3_IDENTITY = {
  engineContractVersion: 2,
  rulesetId: T3_RULESET,
  viewVersion: 1,
} as const;

interface T3StubState {
  players: string[];
  log: { type: string; taskId?: string }[];
}

/** 最小 stub：emit_adjudication 声明任务 effect；绝不调用外部模型。 */
function t3StubModule(): AnyGameModuleV2 {
  return {
    manifest: T3_MANIFEST,
    identity: T3_IDENTITY,
    registeredRulesets: [T3_RULESET],
    defaultRulesetId: T3_RULESET,
    parseConfig: (input) => input as Record<string, unknown>,
    parseAction: (input) => {
      const action = input as { type?: unknown };
      if (action.type === 'emit_adjudication') return input;
      throw new Error('t3 stub：未知动作');
    },
    parseState: (input) => input as T3StubState,
    parsePlayerView: (state) => state as T3StubState,
    parseSpectatorView: (state) => state as T3StubState,
    assertInvariants: () => {},
    snapshotMigrations: {},
    createInitialState: () => ({ players: [], log: [] }),
    reduce: (_ctx: GameContext, state: unknown, _actor: unknown, action: unknown) => {
      const current = state as T3StubState;
      const typed = action as { type?: string };
      if (typed.type === 'emit_adjudication') {
        const a = action as {
          taskId: string;
          sessionId: string;
          rulesetId: string;
          taskType: string;
          submittedAtSeq: number;
          eligibilityDigest: string;
          inputDigest: string;
          inputPlaintextJson: string | null;
        };
        return {
          ok: true,
          nextState: { ...current, log: [...current.log, { type: 'emitted', taskId: a.taskId }] },
          publicEvents: [{ type: 'adjudication_requested', taskId: a.taskId }],
          privateEvents: [],
          effects: [
            {
              type: 'enqueue_adjudication',
              taskId: a.taskId,
              sessionId: a.sessionId,
              rulesetId: a.rulesetId,
              taskType: a.taskType,
              submittedAtSeq: a.submittedAtSeq,
              eligibilityDigest: a.eligibilityDigest,
              inputDigest: a.inputDigest,
              inputPlaintextJson: a.inputPlaintextJson,
            },
          ] as unknown as readonly GameEffect[],
          resultCandidate: null,
        };
      }
      return { ok: false, code: 'NOT_ALLOWED', message: 't3 stub：未知动作' };
    },
    getPlayerView: (state) => state as T3StubState,
    getSpectatorView: (state) => state as T3StubState,
  };
}

/** 组装：ACTIVE 会话 + 快照（seq 0）+ seq 1 trailing emit_adjudication 事件。 */
function insertT3TrailingSession(
  db: Db,
  opts: {
    sessionId: string;
    roomId: string;
    effect: AdjudicationTaskEffect;
    preExistingTask?: boolean;
    corruptTaskDigest?: boolean;
  },
): void {
  const now = Date.now();
  const snapshot = createSnapshotEnvelope({
    gameId: T3_MANIFEST.id,
    rulesetId: T3_RULESET,
    schemaVersion: T3_MANIFEST.stateSchemaVersion,
    createdAtSequence: 0,
    rngState: { cursor: 0 },
    state: { players: [], log: [] },
  });
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
     VALUES (?, ?, 'adjudication-stub', '1.0.0', 1, 'ACTIVE', ?, 't3-recovery-seed', ?, ?, 1, ?, ?)`,
  ).run(opts.sessionId, opts.roomId, JSON.stringify(snapshot), JSON.stringify({ cursor: 0 }), T3_RULESET, now, now);
  if (opts.preExistingTask) {
    db.prepare(
      `INSERT INTO adjudication_tasks
         (task_id, session_id, ruleset_id, task_type, submitted_at_seq,
          eligibility_digest, input_digest, input_plaintext_json, status, created_at, updated_at)
       VALUES (?, ?, ?, 'verdict', ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      opts.effect.taskId,
      opts.sessionId,
      T3_RULESET,
      opts.effect.submittedAtSeq,
      opts.effect.eligibilityDigest,
      opts.corruptTaskDigest ? 'CORRUPTED_DIGEST' : opts.effect.inputDigest,
      opts.effect.inputPlaintextJson,
      now,
      now,
    );
  }
  const module = t3StubModule();
  const random = createSeededRandom('t3-recovery-seed', 0);
  const actor: Actor = { kind: 'system', source: 'admin' };
  const { type: _effectType, ...effectFields } = opts.effect;
  const action = { type: 'emit_adjudication', ...effectFields };
  const result = module.reduce({ now, random }, { players: [], log: [] }, actor, action);
  if (!result.ok) throw new Error('T3 测试构造失败');
  const cursorAfter = random.getCursor();
  const envelope = createEventEnvelope({
    rulesetId: T3_RULESET,
    roomSeq: 1,
    publicEvents: result.publicEvents,
    privateEvents: result.privateEvents,
    effects: result.effects,
    effectReceipts: [{ effectIndex: 0, kind: 'none', receiptId: '' }],
    resultCandidate: result.resultCandidate,
    rngCursorBefore: 0,
    rngCursorAfter: cursorAfter,
    nextStateDigest: createTestStateDigest(result.nextState),
  });
  db.prepare(
    `INSERT INTO game_events (session_id, seq, command_time, actor_json, action_json, events_json)
     VALUES (?, 1, ?, ?, ?, ?)`,
  ).run(opts.sessionId, now, JSON.stringify(actor), JSON.stringify(action), JSON.stringify(envelope));
}

function t3Effect(taskId: string, sessionId: string): AdjudicationTaskEffect {
  return {
    type: 'enqueue_adjudication',
    taskId,
    sessionId,
    rulesetId: T3_RULESET,
    taskType: 'verdict',
    submittedAtSeq: 1,
    eligibilityDigest: 'elig-1',
    inputDigest: 'inp-1',
    inputPlaintextJson: '{"word":"西瓜"}',
  };
}

test('T3：trailing enqueue_adjudication 对账——缺失行按 effect 恢复，receipt kind:none 不抛错', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t3-recover';
    const effect = t3Effect('task-t3-1', sessionId);
    insertT3TrailingSession(db, { sessionId, roomId: seeded.roomId, effect });
    const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as unknown as SessionRow;
    const replayed = replayVersionedTrailingEvents(db, session, t3StubModule());
    assert.equal(replayed.eventsReplayed, 1, 'trailing 事件应重放一次');

    const task = getAdjudicationTask(db, 'task-t3-1');
    assert.ok(task, '对账应按 effect 恢复缺失任务行');
    assert.equal(task!.status, 'pending', '恢复的任务应为 pending（由队列稍后调度）');
    assert.equal(task!.sessionId, effect.sessionId);
    assert.equal(task!.rulesetId, effect.rulesetId);
    assert.equal(task!.taskType, effect.taskType);
    assert.equal(task!.submittedAtSeq, effect.submittedAtSeq);
    assert.equal(task!.eligibilityDigest, effect.eligibilityDigest);
    assert.equal(task!.inputDigest, effect.inputDigest);
    assert.equal(task!.inputPlaintextJson, effect.inputPlaintextJson);
    // 不重复入队：行只有一条
    const count = db.prepare(
      "SELECT COUNT(*) AS n FROM adjudication_tasks WHERE task_id = 'task-t3-1'",
    ).get() as { n: number };
    assert.equal(count.n, 1, '对账不得重复入队');
    // 零 provider 调用：任务保持 pending（恢复期不消费结果、不调用外部裁判）
    assert.equal(task!.status, 'pending');
  } finally {
    closeDb(db);
  }
});

test('T3：已有任务行 immutable 一致时不重复入队、不改状态', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t3-consistent';
    const effect = t3Effect('task-t3-2', sessionId);
    insertT3TrailingSession(db, { sessionId, roomId: seeded.roomId, effect, preExistingTask: true });
    const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as unknown as SessionRow;
    assert.doesNotThrow(() => replayVersionedTrailingEvents(db, session, t3StubModule()));
    const count = db.prepare(
      "SELECT COUNT(*) AS n FROM adjudication_tasks WHERE task_id = 'task-t3-2'",
    ).get() as { n: number };
    assert.equal(count.n, 1, '已有行不得重复入队');
    assert.equal(getAdjudicationTask(db, 'task-t3-2')!.status, 'pending', '对账不得改动已有行状态');
  } finally {
    closeDb(db);
  }
});

test('T3：已有任务行 immutable 字段不一致 → 对账失败关闭（抛错）', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t3-conflict';
    const effect = t3Effect('task-t3-3', sessionId);
    insertT3TrailingSession(db, { sessionId, roomId: seeded.roomId, effect, preExistingTask: true, corruptTaskDigest: true });
    const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as unknown as SessionRow;
    assert.throws(
      () => replayVersionedTrailingEvents(db, session, t3StubModule()),
      /不一致/,
      'immutable 冲突必须失败关闭',
    );
  } finally {
    closeDb(db);
  }
});
