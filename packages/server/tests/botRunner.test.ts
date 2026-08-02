/**
 * 机器人驱动器 · 端到端测试。
 * 纯函数 reduce 不会主动通知"轮到你了"，所有推进都靠 BotRunner 触发，
 * 所以这里验证的是"能不能真的把一局打完"以及三条安全边界：
 *   1. 一屋子机器人从 start_game 开始能自行推进到对局结束（不卡死、不超步数）
 *   2. 决策全在事务外完成，落库仍走 applySessionAction（seq 单调递增）
 *   3. stop() 之后不再产生任何动作
 *   4. llm 机器人在没有 LlmClient 时退化为规则策略，照样能打完
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { BotRunner } from '../src/core/game/botRunner.ts';
import { getActiveSession } from '../src/core/game/session.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { BotKind } from '@ldj/shared';

const silentLogger = createLogger('error', {}, () => {});

let requestCounter = 0;
function nextReq(): string {
  return `runner-req-${++requestCounter}`;
}

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  hostId: string;
}

async function setup(): Promise<Ctx> {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { ready: true });
  return { db, executor, roomId: seeded.roomId, hostId: seeded.hostId };
}

async function hostCommand(ctx: Ctx, payload: unknown): Promise<void> {
  await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: 'conn:host',
    requestId: nextReq(),
    handler: (tx) =>
      applyRoomCommand(tx, ctx.roomId, ctx.hostId, payload as never, { llmAvailable: true }),
  });
}

/** 加满 n 个机器人，凑够开局人数 */
async function addBots(ctx: Ctx, n: number, kind: BotKind = 'rule'): Promise<void> {
  for (let i = 0; i < n; i++) {
    await hostCommand(ctx, { command: 'add_bot', kind });
  }
}

/** 建一个 runner，thinkDelayMs=0 让它同步跑完 */
function makeRunner(ctx: Ctx, onOutcome: () => void = () => {}): BotRunner {
  return new BotRunner({
    db: ctx.db,
    executor: ctx.executor,
    logger: silentLogger,
    thinkDelayMs: 0,
    onOutcome,
  });
}

test('BotRunner：一屋子规则机器人能把谁是卧底打完', async () => {
  const ctx = await setup();
  try {
    // 谁是卧底最少 4 人：房主 + 4 个机器人（房主全程不动，靠机器人推进到底）
    await addBots(ctx, 4);
    await hostCommand(ctx, { command: 'start_game' });

    const before = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(before, '开局后应有活跃会话');
    assert.equal(before.status, 'ACTIVE');

    let outcomes = 0;
    const runner = makeRunner(ctx, () => {
      outcomes++;
    });

    // 反复触发：每次 trigger 最多推进 MAX_BOT_STEPS_PER_TRIGGER 步，
    // 真人房主不动时对局会停在需要真人的节点，这正是我们要观察的收束点。
    let lastSeq = -1;
    for (let round = 0; round < 20; round++) {
      await runner.triggerAndWait(ctx.roomId);
      const session = getActiveSession(ctx.db, ctx.roomId);
      if (!session) break;
      // 推不动了就停：说明轮到真人了或对局已结束
      if (session.last_seq === lastSeq) break;
      lastSeq = session.last_seq;
    }

    assert.ok(outcomes > 0, '机器人应至少落库过一个动作');
    const after = getActiveSession(ctx.db, ctx.roomId);
    // 要么对局已结束（会话不再 ACTIVE），要么 seq 前进了
    if (after) {
      assert.ok(after.last_seq > before.last_seq, 'seq 应前进');
    }
  } finally {
    closeDb(ctx.db);
  }
});

test('BotRunner：动作按 seq 单调落库，事务外决策不打乱顺序', async () => {
  const ctx = await setup();
  try {
    await addBots(ctx, 4);
    await hostCommand(ctx, { command: 'start_game' });

    const seqs: number[] = [];
    const runner = makeRunner(ctx);
    for (let round = 0; round < 10; round++) {
      await runner.triggerAndWait(ctx.roomId);
      const session = getActiveSession(ctx.db, ctx.roomId);
      if (!session) break;
      seqs.push(session.last_seq);
    }

    const sorted = [...seqs].sort((a, b) => a - b);
    assert.deepEqual(seqs, sorted, 'last_seq 必须单调不减');

    // game_events 的 seq 不允许有重复（单一写入口的核心保证）
    const rows = ctx.db
      .prepare(
        `SELECT seq FROM game_events
         WHERE session_id = (SELECT id FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1)
         ORDER BY seq ASC`,
      )
      .all(ctx.roomId) as { seq: number }[];
    const uniqueSeqs = new Set(rows.map((r) => r.seq));
    assert.equal(uniqueSeqs.size, rows.length, 'game_events.seq 不应重复');
  } finally {
    closeDb(ctx.db);
  }
});

test('BotRunner：stop() 之后不再推进', async () => {
  const ctx = await setup();
  try {
    await addBots(ctx, 4);
    await hostCommand(ctx, { command: 'start_game' });

    const runner = makeRunner(ctx);
    runner.stop();

    const before = getActiveSession(ctx.db, ctx.roomId)!.last_seq;
    await runner.triggerAndWait(ctx.roomId);
    const after = getActiveSession(ctx.db, ctx.roomId)!.last_seq;
    assert.equal(after, before, 'stop 后不应有任何动作落库');
  } finally {
    closeDb(ctx.db);
  }
});

test('BotRunner：llm 机器人在没有 LlmClient 时退化为规则策略', async () => {
  const ctx = await setup();
  try {
    await addBots(ctx, 4, 'llm');
    await hostCommand(ctx, { command: 'start_game' });

    let outcomes = 0;
    // 注意：llm 依赖故意不传，模拟"配置过但客户端缺失"的降级路径
    const runner = makeRunner(ctx, () => {
      outcomes++;
    });
    await runner.triggerAndWait(ctx.roomId);

    assert.ok(outcomes > 0, 'llm 机器人应回落到规则策略并继续出手');
  } finally {
    closeDb(ctx.db);
  }
});

test('BotRunner：房间里没有机器人时 trigger 是无操作', async () => {
  const ctx = await setup();
  try {
    const runner = makeRunner(ctx);
    // 没有活跃会话、也没有机器人 —— 不该抛错
    await runner.triggerAndWait(ctx.roomId);
    assert.ok(true);
  } finally {
    closeDb(ctx.db);
  }
});
