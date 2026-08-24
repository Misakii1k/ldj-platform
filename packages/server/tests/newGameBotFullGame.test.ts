/**
 * G3-A：新接入 5 款游戏（奶酪大盗/以鹅传鹅/暗夜证词/铃铛对决/伪人测试）
 * 「1 真人 + N 规则机器人」完整局测试。
 *
 * 与 fullGameDriver（为既有 4 款设计，planBotAction 全自动且无 timer 兜底）不同，
 * 这里走生产真实链路：
 * - 机器人由 BotRunner（thinkDelayMs=0，同步）驱动，动作照常经 applySessionAction 落库；
 * - 真人房主动作由测试循环注入（用同一规则策略模拟真人操作，被拒则忽略）；
 * - 到期计时器由 timerRunner 消费（把最早 pending 计时器拨到过去并 consumeDueTimer），
 *   结算兜底（投票到期、夜间推进、讨论/推理结束等）与生产一致。
 *
 * 5 款游戏的 bot 策略是「测试陪练」级：部分视图不暴露「已投票」信号，重复动作会被
 * reduce 拒绝（平台吞掉记日志），对局结算依赖计时器兜底——这正是生产真实行为。
 * 断言：对局在最大轮数内 FINISHED、产出 game_results、动作流水非空。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, type BotDecisionInput } from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { BotRunner } from '../src/core/game/botRunner.ts';
import {
  applyGameAction,
  getActiveSession,
  loadSessionState,
} from '../src/core/game/session.ts';
import { getSessionGameModule } from '../src/core/game/registry.ts';
import { consumeDueTimer } from '../src/core/game/timerRunner.ts';
import { createLogger } from '../src/boot/logger.ts';

const silentLogger = createLogger('error', {}, () => {});

let requestCounter = 0;
function nextReq(): string {
  return `g3a-${++requestCounter}`;
}

interface FullGameSpec {
  gameId: string;
  botCount: number;
  maxRounds: number;
}

const SPECS: FullGameSpec[] = [
  { gameId: 'cheese-thief', botCount: 4, maxRounds: 400 }, // 5 人标准夜间局（非 4 人变体）
  { gameId: 'goose-relay', botCount: 4, maxRounds: 400 }, // 5 人最小局
  { gameId: 'night-testimony', botCount: 3, maxRounds: 400 }, // 4 人局，覆盖狱警猜罪
  { gameId: 'bell-clash', botCount: 3, maxRounds: 400 }, // 4 人局
  { gameId: 'echo-judge', botCount: 3, maxRounds: 400 }, // 4 人局
];

/** 消费最早 pending 计时器（拨到过去并 consumeDueTimer）；返回是否触发成功 */
async function forceAdvanceTimers(
  executor: RoomCommandExecutor,
  db: Db,
  roomId: string,
): Promise<boolean> {
  const due = db.prepare(
    `SELECT t.session_id, t.timer_id
     FROM timers t JOIN game_sessions s ON s.id = t.session_id
     WHERE t.status = 'pending' AND s.status = 'ACTIVE' AND s.room_id = ?
     ORDER BY t.deadline_at ASC LIMIT 1`,
  ).get(roomId) as { session_id: string; timer_id: string } | undefined;
  if (!due) return false;
  db.prepare(
    `UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = ? AND status = 'pending'`,
  ).run(Date.now() - 10000, due.session_id, due.timer_id);
  const fired = await executor.executeInternal({
    roomId,
    handler: (tx) => consumeDueTimer(tx, due.session_id, due.timer_id),
  });
  return fired !== null;
}

/** 真人房主动作注入：用与该游戏 bot 相同的规则策略模拟真人操作；被拒/无动作返回 false */
async function injectHumanAction(
  executor: RoomCommandExecutor,
  db: Db,
  roomId: string,
  humanId: string,
  step: number,
): Promise<boolean> {
  const session = getActiveSession(db, roomId);
  if (!session) return false;
  const module = getSessionGameModule(session);
  if (!module?.pickBotAction) return false;
  const state = loadSessionState(session, module).state;
  const view = module.getPlayerView(state, humanId);
  const random = createSeededRandom(`human:${roomId}:${step}`);
  let action: unknown;
  try {
    const decision = module.pickBotAction({ view, playerId: humanId, random } as BotDecisionInput<unknown>);
    if (!decision) return false;
    action = typeof decision === 'object' && 'action' in decision ? (decision as { action: unknown }).action : decision;
  } catch (err) {
    return false;
  }
  if (action === null || action === undefined) {
    return false;
  }
  try {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:human-${step}`,
      requestId: nextReq(),
      handler: (tx) => applyGameAction(tx, roomId, humanId, action, nextReq()),
    });
    return true;
  } catch {
    return false;
  }
}

for (const spec of SPECS) {
  test(`G3-A ${spec.gameId}：1 真人 + ${spec.botCount} 规则机器人完整局跑通`, async () => {
    const db = openDb({ path: ':memory:' });
    migrate(db);
    try {
      const executor = new RoomCommandExecutor(db);
      const seeded = seedRoom(db, { gameId: spec.gameId, ready: true });
      const { roomId, hostId } = seeded;

      for (let index = 0; index < spec.botCount; index += 1) {
        await executor.executeOnRoom({
          roomId,
          actorScope: `conn:addbot-${index}`,
          requestId: nextReq(),
          handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'add_bot', kind: 'rule' }, {}),
        });
      }
      await executor.executeOnRoom({
        roomId,
        actorScope: 'conn:host-start',
        requestId: nextReq(),
        handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'start_game' }, {}),
      });

      const runner = new BotRunner({
        db,
        executor,
        logger: silentLogger,
        thinkDelayMs: 0,
        onOutcome: () => {},
      });

      let lastSeq = -1;
      let stalled = 0;
      for (let round = 0; round < spec.maxRounds; round += 1) {
        await runner.triggerAndWait(roomId);
        await injectHumanAction(executor, db, roomId, hostId, round);
        const fired = await forceAdvanceTimers(executor, db, roomId);
        const session = getActiveSession(db, roomId);
        if (!session) break; // 对局已结束（FINISHED/ABORTED）
        if (session.last_seq === lastSeq) {
          stalled += 1;
          const snapshot = JSON.parse(session.snapshot_json) as { phase?: string };
          assert.ok(
            stalled < 20,
            `${spec.gameId} 对局疑似卡死：连续 ${stalled} 轮无任何进展（phase=${snapshot.phase ?? '?'}，lastSeq=${lastSeq}，fired=${fired}）`,
          );
        } else {
          stalled = 0;
          lastSeq = session.last_seq;
        }
      }

      const ended = db.prepare(
        `SELECT status, last_seq FROM game_sessions
         WHERE room_id = ? AND status IN ('FINISHED', 'ABORTED')
         ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      ).get(roomId) as { status: string; last_seq: number } | undefined;
      assert.ok(ended, `${spec.gameId} 应在最大轮数内结束`);
      assert.equal(ended.status, 'FINISHED', `${spec.gameId} 应以 FINISHED 结束（实际 ${ended.status}）`);
      assert.ok(ended.last_seq > 0, `${spec.gameId} 应有动作流水`);
      const results = db.prepare(
        `SELECT COUNT(*) AS n FROM game_results
         WHERE session_id = (SELECT id FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1)`,
      ).get(roomId) as { n: number };
      assert.ok(results.n > 0, `${spec.gameId} 应产出对局结果`);
    } finally {
      closeDb(db);
    }
  });
}
