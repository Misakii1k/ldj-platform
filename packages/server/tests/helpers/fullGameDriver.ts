/**
 * D3 Task 10：完整局崩溃矩阵驱动器。
 * 在文件 SQLite 上推进真实服务端链路（join/start/bot 动作/timer 消费），
 * 每个 accepted 动作后关闭并重开数据库跑启动恢复，再把恢复结果与
 * “不中断 oracle”（崩溃前已提交的持久化状态）逐字段比较。
 * 计时器用虚拟时间推进（到期即消费），避免真实等待；动作数超限即失败。
 */
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { createSeededRandom, type BotDecisionInput } from '@ldj/shared';
import { openDb, closeDb, type Db } from '../../src/persistence/db.ts';
import { migrate } from '../../src/persistence/migrator.ts';
import { createLogger } from '../../src/boot/logger.ts';
import { RoomCommandExecutor } from '../../src/core/executor.ts';
import { seedRoom } from './seedRoom.ts';
import { applyJoinRoom } from '../../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../../src/core/commands/roomCommand.ts';
import {
  applyGameAction,
  getActiveSession,
  loadSessionState,
  type SessionRow,
} from '../../src/core/game/session.ts';
import { getSessionGameModule, type RegisteredGameModule } from '../../src/core/game/registry.ts';
import { runStartupRecovery } from '../../src/core/recovery.ts';
import { consumeDueTimer } from '../../src/core/game/timerRunner.ts';

const silentLogger = createLogger('error', {}, () => {});

export interface FullGameMatrixOptions {
  gameId: 'uno' | 'undercover' | 'werewolf' | 'landlord';
  /** 可选规则集 id：start_game 载荷带 gameConfig:{rulesetId}；缺省保持 {}（兼容旧调用） */
  rulesetId?: string;
  /** 真实玩家（全程被动，只占席位；动作全部由机器人驱动） */
  humanCount: number;
  /** 规则机器人数量（驱动对局） */
  botCount: number;
  /** 每个 accepted 动作后崩溃+恢复并比较 oracle */
  crashEveryStep: boolean;
  maxSteps: number;
  /**
   * 最大虚拟时间上限（毫秒）。
   * 虚拟时间 = 已执行动作的步进时长（ACTION_VIRTUAL_STEP_MS）+
   * 被强制拨快的计时器调度时长之和；超过即失败（D4-TOOLS）。
   * 缺省时不做虚拟时间上限约束（向后兼容既有调用）。
   */
  maxVirtualTimeMs?: number;
}

export interface FullGameMatrixResult {
  steps: number;
  finished: boolean;
  resultRows: number;
  pendingTimersAtEnd: number;
  sessionStatus: string | null;
  finalSeq: number;
  finalRoomSeq: number;
  /** 终局会话实际落库的规则集 id（无则 null，兼容 legacy 会话） */
  finalRulesetId: string | null;
  /** 驱动过程中累计的虚拟时间（毫秒）：动作步进 + 计时器调度时长 */
  virtualTimeMs: number;
}

/** 每个 accepted 动作计为 1 虚拟秒 */
const ACTION_VIRTUAL_STEP_MS = 1_000;

interface Driver {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  playerIds: string[];
  roomCode: string;
  dbPath: string;
}

let requestCounter = 0;
function nextReq(): string {
  return `matrix-${++requestCounter}`;
}

function tempDbPath(): string {
  return join(tmpdir(), `ldj-matrix-${randomUUID()}.db`);
}

function cleanupDb(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // 忽略清理失败
    }
  }
}

async function createDriver(
  gameId: FullGameMatrixOptions['gameId'],
  humanCount: number,
  botCount: number,
  rulesetId?: string,
): Promise<Driver> {
  const dbPath = tempDbPath();
  const db = openDb({ path: dbPath });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { gameId });
  const { roomId, roomCode, hostId } = seeded;
  const playerIds = [hostId];
  for (let index = 2; index <= humanCount; index += 1) {
    const joined = await executor.executeOnRoom({
      roomId,
      actorScope: `conn:h${index}`,
      requestId: nextReq(),
      handler: (tx) => applyJoinRoom(tx, roomId, { roomCode, nickname: `真人${index}`, asSpectator: false }),
    });
    playerIds.push(joined.outcome.playerId);
  }
  for (let index = 0; index < botCount; index += 1) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:host-bot-${index}`,
      requestId: nextReq(),
      handler: (tx) => applyRoomCommand(tx, roomId, hostId, { command: 'add_bot', kind: 'rule' }, {}),
    });
  }
  db.prepare(`UPDATE room_members SET ready = 1 WHERE room_id = ? AND seat_role = 'player'`).run(roomId);
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host-start',
    requestId: nextReq(),
    handler: (tx) => applyRoomCommand(
      tx,
      roomId,
      hostId,
      rulesetId === undefined
        ? { command: 'start_game' }
        : { command: 'start_game', gameConfig: { rulesetId } },
      {},
    ),
  });
  return { db, executor, roomId, playerIds, roomCode, dbPath };
}

interface SnapshotFingerprint {
  snapshotJson: string;
  rngJson: string;
  lastSeq: number;
  status: string;
  roomSeq: number;
  timers: string;
}

function fingerprint(db: Db, roomId: string, session: SessionRow): SnapshotFingerprint {
  const room = db.prepare('SELECT seq FROM rooms WHERE id = ?').get(roomId) as { seq: number };
  const timers = JSON.stringify(db.prepare(
    `SELECT timer_id, deadline_at, action_json, status FROM timers WHERE session_id = ? ORDER BY timer_id`,
  ).all(session.id));
  return {
    snapshotJson: session.snapshot_json,
    rngJson: session.rng_state_json,
    lastSeq: session.last_seq,
    status: session.status,
    roomSeq: room.seq,
    timers,
  };
}

function assertFingerprintEqual(actual: SnapshotFingerprint, expected: SnapshotFingerprint, step: number): void {
  const keys = Object.keys(actual) as (keyof SnapshotFingerprint)[];
  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `步骤 ${step} 恢复后 ${key} 与不中断 oracle 不一致\n` +
        `oracle: ${String(expected[key]).slice(0, 400)}\n` +
        `actual: ${String(actual[key]).slice(0, 400)}`,
      );
    }
  }
}

/** 当前是否轮到某人可动作（规则策略非空）：真人席位也由同一规则策略驱动，
 *  保证 UNO 这种严格轮转游戏不会卡在被动真人座上（“混合真人/bot 路径”）。 */
function planBotAction(
  module: RegisteredGameModule,
  state: unknown,
  players: readonly { playerId: string }[],
  step: number,
): { botId: string; action: unknown } | null {
  if (!module.pickBotAction) return null;
  for (const player of players) {
    const view = module.getPlayerView(state, player.playerId);
    // 已淘汰成员按模块自身视角排除：reducer 侧一律拒绝已淘汰者动作，
    // 个别规则策略漏检（如 blank 投票策略），驱动器在规划期过滤，避免无效动作无限重试。
    // 仅当 me.alive 显式为 false 时跳过；UNO/landlord 等无 alive 字段的模块不受影响。
    const me = (view as { me?: { alive?: unknown; canAct?: unknown } | null }).me;
    if (me !== null && me !== undefined && (me.alive === false || me.canAct === false)) continue;
    const random = createSeededRandom(`matrix:${player.playerId}:${step}`);
    const input: BotDecisionInput<unknown> = { view, playerId: player.playerId, random };
    try {
      const action = module.pickBotAction(input);
      if (action !== null && action !== undefined) return { botId: player.playerId, action };
    } catch {
      // 策略抛错视为该成员此刻不可动，继续问下一个
    }
  }
  return null;
}

/** 虚拟时间：把最早 pending 计时器拨到已到期并消费，保证对局不被真实时钟卡住。
 *  返回是否触发成功以及该计时器的原调度 deadline（用于累计虚拟时间）。 */
async function forceAdvanceTimers(
  executor: RoomCommandExecutor,
  db: Db,
  roomId: string,
): Promise<{ fired: boolean; deadlineAt: number | null }> {
  const due = db.prepare(
    `SELECT t.session_id, t.timer_id, t.deadline_at, s.room_id
     FROM timers t JOIN game_sessions s ON s.id = t.session_id
     WHERE t.status = 'pending' AND s.status = 'ACTIVE' AND s.room_id = ?
     ORDER BY t.deadline_at ASC LIMIT 1`,
  ).get(roomId) as { session_id: string; timer_id: string; room_id: string; deadline_at: number } | undefined;
  if (!due) return { fired: false, deadlineAt: null };
  db.prepare(
    `UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = ? AND status = 'pending'`,
  ).run(Date.now() - 1, due.session_id, due.timer_id);
  const fired = await executor.executeInternal({
    roomId,
    now: due.deadline_at + 1,
    handler: (tx) => consumeDueTimer(tx, due.session_id, due.timer_id),
  });
  return { fired: fired !== null, deadlineAt: due.deadline_at };
}

async function crashAndRecover(driver: Driver): Promise<Driver> {
  const { db, dbPath, roomId, playerIds, roomCode } = driver;
  closeDb(db);
  const reopened = openDb({ path: dbPath });
  migrate(reopened);
  runStartupRecovery(reopened, silentLogger);
  return {
    db: reopened,
    executor: new RoomCommandExecutor(reopened),
    roomId,
    playerIds,
    roomCode,
    dbPath,
  };
}

/**
 * 完整局驱动：真实链路推进 + 可选逐动作崩溃恢复矩阵。
 * 每个 accepted 动作后若 crashEveryStep，则先记录 oracle 指纹，
 * 关闭→重开→恢复→逐字段比较，再继续下一动作。
 */
export async function driveFullGameWithCrashMatrix(options: FullGameMatrixOptions): Promise<FullGameMatrixResult> {
  const { gameId, humanCount, botCount, crashEveryStep, maxSteps, maxVirtualTimeMs, rulesetId } = options;
  let driver = await createDriver(gameId, humanCount, botCount, rulesetId);
  const dbPath = driver.dbPath;
  let steps = 0;
  let resultRows = 0;
  let pendingTimersAtEnd = 0;
  let sessionStatus: string | null = null;
  let finalSeq = 0;
  let finalRoomSeq = 0;
  let finalRulesetId: string | null = null;
  let finished = false;
  // 虚拟时间累计：动作步进 + 计时器调度时长；anchor 记录上一个被消费计时器的调度时刻
  let virtualTimeMs = 0;
  let lastTimerAnchorAt = Date.now();

  const assertVirtualTimeCap = (): void => {
    if (maxVirtualTimeMs === undefined || maxVirtualTimeMs === Infinity) return;
    if (virtualTimeMs > maxVirtualTimeMs) {
      throw new Error(
        `对局超出最大虚拟时间上限 ${maxVirtualTimeMs}ms（已累计 ${Math.round(virtualTimeMs)}ms，步 ${steps}）`,
      );
    }
  };

  try {
    for (steps = 0; steps < maxSteps; steps += 1) {
      const session = getActiveSession(driver.db, driver.roomId);
      if (!session) {
        // 会话已离开活动状态：取最近一条终局行判定结果。
        const ended = driver.db.prepare(
          `SELECT * FROM game_sessions WHERE room_id = ? AND status IN ('FINISHED','ABORTED')
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        ).get(driver.roomId) as SessionRow | undefined;
        if (ended) {
          finished = ended.status === 'FINISHED';
          sessionStatus = ended.status;
          finalSeq = ended.last_seq;
          finalRulesetId = ended.ruleset_id ?? null;
          const room = driver.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(driver.roomId) as { seq: number };
          finalRoomSeq = room.seq;
          resultRows = (driver.db.prepare(
            'SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?',
          ).get(ended.id) as { n: number }).n;
          pendingTimersAtEnd = (driver.db.prepare(
            `SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`,
          ).get(ended.id) as { n: number }).n;
        }
        break;
      }
      const module = getSessionGameModule(session);
      if (!module) throw new Error('模块未注册');

      const state = loadSessionState(session, module).state;
      // 崩溃恢复会把成员连接状态重置为离线；对局动作并不依赖连接状态，
      // 驱动器按全部参局成员驱动，恢复后无需重连步骤。
      const players = (driver.db.prepare(
        `SELECT player_id FROM room_members
         WHERE room_id = ? AND seat_role = 'player'
         ORDER BY seat ASC`,
      ).all(driver.roomId) as { player_id: string }[]).map((row) => ({ playerId: row.player_id }));
      const planned = planBotAction(module, state, players, steps);
      if (planned === null) {
        // 没有成员可动：虚拟时间推进计时器；仍无进展则判定卡死
        const advanced = await forceAdvanceTimers(driver.executor, driver.db, driver.roomId);
        if (!advanced.fired) {
          throw new Error(
            `对局在第 ${steps} 步卡死（无成员动作也无计时器） ` +
            `players=${JSON.stringify(players.map((p) => p.playerId))} phase=${(state as { phase?: string }).phase} ` +
            `currentPlayerId=${(state as { currentPlayerId?: string }).currentPlayerId}`,
          );
        }
        if (advanced.deadlineAt !== null) {
          virtualTimeMs += Math.max(0, advanced.deadlineAt - lastTimerAnchorAt);
          lastTimerAnchorAt = Math.max(lastTimerAnchorAt, advanced.deadlineAt);
        }
        assertVirtualTimeCap();
        continue;
      }

      let outcome;
      try {
        outcome = await driver.executor.executeOnRoom({
          roomId: driver.roomId,
          actorScope: `conn:driver-${steps}`,
          requestId: nextReq(),
          handler: (tx) => applyGameAction(tx, driver.roomId, planned.botId, planned.action, nextReq()),
        });
      } catch {
        // 策略动作被规则拒绝（竞态/过期）：换一步再试，不计步
        continue;
      }
      // 动作 accepted：计入虚拟时间步进
      virtualTimeMs += ACTION_VIRTUAL_STEP_MS;
      assertVirtualTimeCap();

      if (crashEveryStep) {
        // oracle 取动作提交后的最新会话行（applySessionAction 只改事务内的行对象）；
        // 终局动作会让会话离开 ACTIVE，退回最近一行。
        const fresh = getActiveSession(driver.db, driver.roomId)
          ?? driver.db.prepare(
            `SELECT * FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          ).get(driver.roomId) as SessionRow | undefined;
        if (!fresh) throw new Error(`步骤 ${steps} 动作提交后会话丢失`);
        const oracle = fingerprint(driver.db, driver.roomId, fresh);
        driver = await crashAndRecover(driver);
        const recovered = driver.db.prepare(
          `SELECT * FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        ).get(driver.roomId) as SessionRow | undefined;
        if (!recovered) throw new Error(`步骤 ${steps} 恢复后会话丢失`);
        assertFingerprintEqual(fingerprint(driver.db, driver.roomId, recovered), oracle, steps);
      }

      if (outcome.outcome.finished) {
        finished = !outcome.outcome.aborted;
        break;
      }
    }

    const final = driver.db.prepare(
      `SELECT * FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(driver.roomId) as SessionRow | undefined;
    if (final) {
      sessionStatus = sessionStatus ?? final.status;
      finalSeq = final.last_seq;
      finalRulesetId = final.ruleset_id ?? null;
      const room = driver.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(driver.roomId) as { seq: number };
      finalRoomSeq = room.seq;
      resultRows = (driver.db.prepare(
        'SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?',
      ).get(final.id) as { n: number }).n;
      pendingTimersAtEnd = (driver.db.prepare(
        `SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`,
      ).get(final.id) as { n: number }).n;
    }
    // 最大步数上限：耗尽步数后会话仍未结束 → 失败（D4-TOOLS）
    if (final?.status === 'ACTIVE' && steps >= maxSteps) {
      throw new Error(
        `对局超出最大步数 ${maxSteps}（第 ${steps} 步会话仍为 ACTIVE，phase=${(final.snapshot_json as string | undefined)?.slice(0, 120)}）`,
      );
    }
    assertVirtualTimeCap();
    return { steps, finished, resultRows, pendingTimersAtEnd, sessionStatus, finalSeq, finalRoomSeq, finalRulesetId, virtualTimeMs };
  } finally {
    closeDb(driver.db);
    cleanupDb(dbPath);
  }
}

/** 供测试断言使用的可读指纹（不直接比较跨 run 的随机结果） */
export function describeFinish(result: FullGameMatrixResult): string {
  return `steps=${result.steps} finished=${result.finished} status=${result.sessionStatus} ` +
    `resultRows=${result.resultRows} pendingTimers=${result.pendingTimersAtEnd} seq=${result.finalSeq} ` +
    `ruleset=${result.finalRulesetId ?? '<legacy>'} virtualTimeMs=${result.virtualTimeMs}`;
}
