/**
 * 对局会话服务（SPEC §4.4、§8.5-§8.7、§10.3）：
 * 在执行链事务内完成 开局 / 动作 reduce / 事件流水 / 快照 / 计时器 / 结果 的原子写入。
 * 内核不理解游戏语义：状态与动作对内核是不透明 JSON，由模块 schema 把关。
 */
import { randomUUID } from 'node:crypto';
import {
  createSeededRandom,
  type Actor,
  type ChatMessageView,
  type GameContext,
} from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { getGameModule, DEFAULT_GAME_ID, type ErasedGameModule } from './registry.ts';

export interface SessionRow {
  id: string;
  room_id: string;
  module_id: string;
  module_version: string;
  state_schema_version: number;
  status: string;
  snapshot_json: string;
  seed: string;
  rng_state_json: string;
  last_seq: number;
}

/** 一次成功 reduce 的落库结果；gateway 据此广播视角/事件，timer runner 据此对表 */
export interface GameActionOutcome {
  sessionId: string;
  moduleId: string;
  /** 本次动作在事件流水中的序号 */
  seq: number;
  /** 模块事件（公开语义，gateway 过滤后转发） */
  events: unknown[];
  /** 已写入聊天流的系统消息（gateway 直接以 chat_batch 广播） */
  systemChats: ChatMessageView[];
  /** timers 表有变更（需要重新对表） */
  timersChanged: boolean;
  finished: boolean;
  aborted: boolean;
}

export function getActiveSession(db: Db, roomId: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT * FROM game_sessions
       WHERE room_id = ? AND status IN ('PREPARING','ACTIVE','RECOVERING')`,
    )
    .get(roomId) as SessionRow | undefined;
}

function requireModule(moduleId: string): ErasedGameModule {
  const module = getGameModule(moduleId);
  if (!module) throw new CommandError('INTERNAL_ERROR', `未注册的游戏模块：${moduleId}`);
  return module;
}

/** rng_state_json 只保存抽取游标；相同 (seed, cursor) 序列一致（§8.5） */
function parseRngCursor(json: string): number {
  const parsed = JSON.parse(json) as { cursor?: number };
  return typeof parsed.cursor === 'number' ? parsed.cursor : 0;
}

function isZodError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError';
}

/**
 * 在事务内应用一个已解析会话上的动作：reduce → 事件流水 → 快照 → effects → 结果。
 * reduce 拒绝时抛 CommandError（不产生任何写入，由外层事务回滚保证）。
 */
export function applySessionAction(
  tx: TxContext,
  session: SessionRow,
  actor: Actor,
  rawAction: unknown,
  requestId: string | null,
): GameActionOutcome {
  const { db, now } = tx;
  const module = requireModule(session.module_id);

  let action: unknown;
  try {
    action = module.parseAction(rawAction);
  } catch (err) {
    if (isZodError(err)) throw new CommandError('INVALID_MESSAGE', '游戏动作格式无效');
    throw err;
  }

  const random = createSeededRandom(session.seed, parseRngCursor(session.rng_state_json));
  const ctx: GameContext = { now, random };
  const state: unknown = JSON.parse(session.snapshot_json);

  const result = module.reduce(ctx, state, actor, action);
  if (!result.ok) {
    // 模块 code 不进错误码表；统一映射为 ACTION_NOT_ALLOWED，message 保留模块文案
    throw new CommandError('ACTION_NOT_ALLOWED', result.message);
  }

  // 事件流水（§10.2 game_events）：完整记录 actor/action/events，供审计与重放
  const seq = session.last_seq + 1;
  db.prepare(
    `INSERT INTO game_events (session_id, seq, request_id, command_time, actor_json, action_json, events_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    seq,
    requestId,
    now,
    JSON.stringify(actor),
    JSON.stringify(action),
    JSON.stringify(result.events),
  );

  // effects：计时器/系统消息全部与状态同事务落库（§5.8、§10.3）
  const systemChats: ChatMessageView[] = [];
  let timersChanged = false;
  for (const effect of result.effects) {
    switch (effect.type) {
      case 'schedule_timer':
        db.prepare(
          `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
           VALUES (?, ?, ?, ?, 'pending')
           ON CONFLICT (session_id, timer_id)
           DO UPDATE SET deadline_at = excluded.deadline_at, action_json = excluded.action_json, status = 'pending'`,
        ).run(session.id, effect.timerId, effect.deadlineAt, JSON.stringify(effect.action));
        timersChanged = true;
        break;
      case 'cancel_timer':
        db.prepare(
          `UPDATE timers SET status = 'cancelled'
           WHERE session_id = ? AND timer_id = ? AND status = 'pending'`,
        ).run(session.id, effect.timerId);
        timersChanged = true;
        break;
      case 'system_message': {
        const info = db
          .prepare(
            `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at)
             VALUES (?, ?, NULL, 'system', ?, ?)`,
          )
          .run(session.room_id, session.id, effect.text, now);
        systemChats.push({
          cursor: Number(info.lastInsertRowid),
          kind: 'system',
          fromPlayerId: null,
          text: effect.text,
          at: now,
        });
        break;
      }
    }
  }

  // 每个已接受的变更都写最新快照（§10.1）
  const gameResult = module.getResult(result.state);
  const finished = gameResult !== null;
  // 约定：结果对象可携带 aborted 标记（如全员退出，§6.7）；缺省视为正常结束
  const aborted = finished && (gameResult as { aborted?: boolean }).aborted === true;

  db.prepare(
    `UPDATE game_sessions
     SET snapshot_json = ?, rng_state_json = ?, last_seq = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(result.state),
    JSON.stringify({ cursor: random.getCursor() }),
    seq,
    finished ? (aborted ? 'ABORTED' : 'FINISHED') : session.status,
    now,
    session.id,
  );

  if (finished) {
    // 收尾：清掉未消费计时器；正常结束写结果表（ABORTED 只留诊断，不计战绩，FR-RESULT-002）
    db.prepare(`UPDATE timers SET status = 'cancelled' WHERE session_id = ? AND status = 'pending'`).run(
      session.id,
    );
    if (!aborted) {
      db.prepare(
        `INSERT INTO game_results (id, session_id, module_id, result_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(randomUUID(), session.id, session.module_id, JSON.stringify(gameResult), now);
    }
    db.prepare(`UPDATE rooms SET status = 'POST_GAME', updated_at = ? WHERE id = ?`).run(
      now,
      session.room_id,
    );
    // 对局结束回到结算等待：全员准备状态清零，等待重新准备再来一局
    db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ?`).run(session.room_id);
    timersChanged = true;
  }

  // 内存中的行同步推进，便于同事务内连续应用（如 start → begin）
  session.snapshot_json = JSON.stringify(result.state);
  session.rng_state_json = JSON.stringify({ cursor: random.getCursor() });
  session.last_seq = seq;
  if (finished) session.status = aborted ? 'ABORTED' : 'FINISHED';

  return {
    sessionId: session.id,
    moduleId: session.module_id,
    seq,
    events: result.events,
    systemChats,
    timersChanged,
    finished,
    aborted,
  };
}

/** 玩家 game_action 入口：从连接推导 actor，房间必须有活动对局 */
export function applyGameAction(
  tx: TxContext,
  roomId: string,
  playerId: string,
  rawAction: unknown,
  requestId: string,
): GameActionOutcome {
  const session = getActiveSession(tx.db, roomId);
  if (!session) {
    throw new CommandError('ACTION_NOT_ALLOWED', '当前没有进行中的对局');
  }
  // 恢复期给客户端明确的错误码，使其进入 server_recovering 连接态（§10.4、§7.3）
  if (session.status === 'RECOVERING') {
    throw new CommandError('RECOVERY_IN_PROGRESS');
  }
  if (session.status !== 'ACTIVE') {
    throw new CommandError('ACTION_NOT_ALLOWED', '当前没有进行中的对局');
  }
  return applySessionAction(tx, session, { kind: 'player', playerId }, rawAction, requestId);
}

export interface StartGameOutcome {
  sessionId: string;
  moduleId: string;
  /** 参与本局的玩家（按席位序） */
  playerIds: string[];
  /** 开局即刻投递 begin 后的落库结果（含看词计时器） */
  begin: GameActionOutcome;
}

/**
 * 开局（FR-HOST-001、§5.9）：LOBBY 校验人数与连接状态 → 生成种子与初始状态 →
 * 会话 ACTIVE + 房间 IN_GAME → 立即投递 begin 系统动作起表。
 * 房主权限由调用方（roomCommand）校验。
 */
export function startGame(tx: TxContext, roomId: string, gameConfig: unknown): StartGameOutcome {
  const { db, now } = tx;
  const room = db.prepare('SELECT status, game_id FROM rooms WHERE id = ?').get(roomId) as
    | { status: string; game_id: string | null }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'LOBBY') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只能在大厅中开始游戏');
  }
  if (getActiveSession(db, roomId)) {
    throw new CommandError('ACTION_NOT_ALLOWED', '已有进行中的对局');
  }

  const moduleId = room.game_id ?? DEFAULT_GAME_ID;
  const module = requireModule(moduleId);

  // 开局重新校验连接状态（§5.9/D-6）：只有在线玩家参与本局
  const players = (
    db
      .prepare(
        `SELECT player_id, ready FROM room_members
         WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED'
         ORDER BY seat ASC`,
      )
      .all(roomId) as { player_id: string; ready: number }[]
  ).map((r) => r.player_id);
  if (players.length < module.manifest.minPlayers || players.length > module.manifest.maxPlayers) {
    throw new CommandError(
      'ACTION_NOT_ALLOWED',
      `在线玩家需为 ${module.manifest.minPlayers}–${module.manifest.maxPlayers} 人（当前 ${players.length}）`,
    );
  }
  // 全员就绪校验：未准备的在线玩家不能开局
  const notReadyCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM room_members
         WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED' AND ready = 0`,
      )
      .get(roomId) as { n: number }
  ).n;
  if (notReadyCount > 0) {
    throw new CommandError('ACTION_NOT_ALLOWED', `还有 ${notReadyCount} 名玩家未准备`);
  }

  let config: unknown;
  try {
    config = module.parseConfig(gameConfig ?? {});
  } catch (err) {
    if (isZodError(err)) throw new CommandError('INVALID_MESSAGE', '游戏配置无效');
    throw err;
  }

  // FR-RESULT-003：新 SessionId + 新随机种子，不复用上一局秘密状态
  const sessionId = randomUUID();
  const seed = randomUUID();
  const random = createSeededRandom(seed);
  const initialState = module.createInitialState({ now, random }, players, config);

  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, last_seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, 0, ?, ?)`,
  ).run(
    sessionId,
    roomId,
    moduleId,
    module.manifest.version,
    module.manifest.stateSchemaVersion,
    JSON.stringify(initialState),
    seed,
    JSON.stringify({ cursor: random.getCursor() }),
    now,
    now,
  );
  db.prepare(`UPDATE rooms SET status = 'IN_GAME', game_id = ?, updated_at = ? WHERE id = ?`).run(
    moduleId,
    now,
    roomId,
  );

  // 创建后立即投递 begin：模块据此起看词计时器（effect 驱动，§5.8）
  const session = getActiveSession(db, roomId);
  if (!session) throw new CommandError('INTERNAL_ERROR', '对局创建失败');
  const begin = applySessionAction(
    tx,
    session,
    { kind: 'system', source: 'admin' },
    { type: 'begin' },
    null,
  );

  return { sessionId, moduleId, playerIds: players, begin };
}

/**
 * 房主终止本局（FR-HOST-002）：内核级终止，不经模块语义——
 * 会话标记 ABORTED、清计时器、房间回 POST_GAME；不写正常战绩。
 */
export function abortGame(
  tx: TxContext,
  roomId: string,
): { sessionId: string; sysChat: ChatMessageView } {
  const { db, now } = tx;
  const session = getActiveSession(db, roomId);
  if (!session) throw new CommandError('ACTION_NOT_ALLOWED', '当前没有进行中的对局');
  db.prepare(`UPDATE game_sessions SET status = 'ABORTED', updated_at = ? WHERE id = ?`).run(
    now,
    session.id,
  );
  db.prepare(`UPDATE timers SET status = 'cancelled' WHERE session_id = ? AND status = 'pending'`).run(
    session.id,
  );
  db.prepare(`UPDATE rooms SET status = 'POST_GAME', updated_at = ? WHERE id = ?`).run(now, roomId);
  db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ?`).run(roomId);
  const text = '房主已终止本局';
  const info = db
    .prepare(
      `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at)
       VALUES (?, ?, NULL, 'system', ?, ?)`,
    )
    .run(roomId, session.id, text, now);
  return {
    sessionId: session.id,
    sysChat: { cursor: Number(info.lastInsertRowid), kind: 'system', fromPlayerId: null, text, at: now },
  };
}

/** POST_GAME → LOBBY（FR-RESULT-004：保留成员与房主关系） */
export function returnToLobby(tx: TxContext, roomId: string): void {
  const { db, now } = tx;
  const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as
    | { status: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'POST_GAME') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只能在结算页返回大厅');
  }
  // 回大厅等同新的一轮等待：重置全员准备
  db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ?`).run(roomId);
  db.prepare(`UPDATE rooms SET status = 'LOBBY', updated_at = ? WHERE id = ?`).run(now, roomId);
}

/**
 * 自动开局（全员就绪 + 人数达标时由 gateway 延迟任务触发）：
 * POST_GAME 先转 LOBBY 再开局，配置沿用房间 config 中的 gameConfig（可能不存在）。
 * 返回 null 表示条件已不满足（幂等复检），调用方不广播。
 */
export function autoStartGame(
  tx: TxContext,
  roomId: string,
): StartGameOutcome | null {
  const { db, now } = tx;
  const room = db.prepare('SELECT status, game_id FROM rooms WHERE id = ?').get(roomId) as
    | { status: string; game_id: string | null }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'LOBBY' && room.status !== 'POST_GAME') return null;
  if (getActiveSession(db, roomId)) return null;
  const moduleId = room.game_id ?? DEFAULT_GAME_ID;
  const module = requireModule(moduleId);

  // 幂等复检：在线玩家数达标且全员就绪，否则放弃
  const players = (
    db
      .prepare(
        `SELECT player_id, ready FROM room_members
         WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED'
         ORDER BY seat ASC`,
      )
      .all(roomId) as { player_id: string; ready: number }[]
  ).map((r) => r.player_id);
  if (players.length < module.manifest.minPlayers || players.length > module.manifest.maxPlayers) {
    return null;
  }
  const notReadyCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM room_members
         WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED' AND ready = 0`,
      )
      .get(roomId) as { n: number }
  ).n;
  if (notReadyCount > 0) return null;

  if (room.status === 'POST_GAME') {
    db.prepare(`UPDATE rooms SET status = 'LOBBY', updated_at = ? WHERE id = ?`).run(now, roomId);
  }
  const config = parseRoomGameConfig(db, roomId);
  return startGame(tx, roomId, config);
}

/** 房间 config_json 里的游戏配置（update_config 保存），无则返回空配置 */
function parseRoomGameConfig(db: Db, roomId: string): unknown {
  const row = db.prepare('SELECT config_json FROM rooms WHERE id = ?').get(roomId) as
    | { config_json: string }
    | undefined;
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.config_json) as Record<string, unknown>;
    return parsed.gameConfig ?? {};
  } catch {
    return {};
  }
}

/**
 * 席位保留期结束的批量退出（§6.7）：投递 player_forfeited 系统动作。
 * 安全点顺延（D-7）由调用方保证（presence 检查在命令队列间隙执行即天然满足）。
 * 无活动对局或玩家不在局内时为 no-op（返回 null）。
 */
export function forfeitPlayers(
  tx: TxContext,
  roomId: string,
  playerIds: string[],
): GameActionOutcome | null {
  const session = getActiveSession(tx.db, roomId);
  if (!session || session.status !== 'ACTIVE' || playerIds.length === 0) return null;
  return applySessionAction(
    tx,
    session,
    { kind: 'system', source: 'timer' },
    { type: 'player_forfeited', playerIds },
    null,
  );
}
