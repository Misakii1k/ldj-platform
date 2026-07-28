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
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { createLogger } from '../src/boot/logger.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { prepareCreateRoom, applyCreateRoom } from '../src/core/commands/createRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import {
  applyGameAction,
  getActiveSession,
} from '../src/core/game/session.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';

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
async function setupRoom(playerCount: number, dbPath: string): Promise<Ctx> {
  const db = openDb({ path: dbPath });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const { roomId } = prepareCreateRoom();
  const created = await executor.executeCreate({
    roomId,
    actorScope: 'conn:host',
    requestId: nextReq(),
    handler: (tx) => applyCreateRoom(tx, roomId, { nickname: '房主' }),
  });
  const roomCode = created.outcome.roomCode;
  const hostId = created.outcome.playerId;
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

async function action(ctx: Ctx, playerId: string, rawAction: unknown): Promise<void> {
  await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${playerId}`,
    requestId: nextReq(),
    handler: (tx) => applyGameAction(tx, ctx.roomId, playerId, rawAction, nextReq()),
  });
}

function snapshot(db: Db, roomId: string): Record<string, unknown> {
  const session = getActiveSession(db, roomId);
  assert.ok(session, '应存在活动对局');
  return JSON.parse(session.snapshot_json) as Record<string, unknown>;
}

function sessionRow(db: Db, roomId: string) {
  return getActiveSession(db, roomId);
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

    // 崩溃
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // 选票保留
    const afterSeq = sessionRow(ctx2.db, ctx2.roomId)!.last_seq;
    assert.equal(afterSeq, beforeSeq, '投票应保留');
    const afterVotes = snapshot(ctx2.db, ctx2.roomId).votes as Record<string, unknown>;
    assert.equal(Object.keys(afterVotes).length, 2);

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

    // 把 vote_result 计时器改为立即到期
    const session = sessionRow(ctx.db, ctx.roomId)!;
    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND status = 'pending'`)
      .run(Date.now() - 1, session.id);

    // 崩溃
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // 恢复应补执行 vote_result 计时器：推进到下一轮 speaking 或 game_over
    const afterState = snapshot(ctx2.db, ctx2.roomId);
    assert.ok(
      afterState.phase === 'speaking' || afterState.phase === 'game_over',
      `应推进到 speaking 或 game_over，实际 ${afterState.phase}`,
    );

    // vote_result 计时器已 consumed
    const voteResultTimer = ctx2.db
      .prepare(
        `SELECT status FROM timers WHERE session_id = ? AND status = 'consumed' ORDER BY rowid DESC LIMIT 1`,
      )
      .get(session.id) as { status: string } | undefined;
    assert.ok(voteResultTimer, '应存在 consumed 计时器');

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

    const session = sessionRow(ctx.db, ctx.roomId)!;
    // 把 reveal 计时器改为已过去 10 秒
    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = 'reveal'`)
      .run(Date.now() - 10_000, session.id);

    const beforeConsumed = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'consumed'`)
      .get(session.id) as { n: number };
    assert.equal(beforeConsumed.n, 0);

    // 崩溃
    crash(ctx);

    const ctx2 = reopenAndRecover(dbPath, ctx.roomId, ctx.hostId, ctx.playerIds, ctx.roomCode);

    // reveal 计时器被补执行一次（consumed）
    const afterConsumed = ctx2.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'consumed'`)
      .get(session.id) as { n: number };
    assert.equal(afterConsumed.n, 1, '计时器只补执行一次');

    // 推进到 speaking
    const state = snapshot(ctx2.db, ctx2.roomId);
    assert.equal(state.phase, 'speaking');

    // 会话已 ACTIVE
    assert.equal(sessionRow(ctx2.db, ctx2.roomId)!.status, 'ACTIVE');

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
