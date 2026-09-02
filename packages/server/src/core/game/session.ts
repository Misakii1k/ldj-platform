/**
 * 对局会话服务（SPEC §4.4、§8.5-§8.7、§10.3）：
 * 在执行链事务内完成 开局 / 动作 reduce / 事件流水 / 快照 / 计时器 / 结果 的原子写入。
 * 内核不理解游戏语义：状态与动作对内核是不透明 JSON，由模块 schema 把关。
 */
import { randomUUID } from 'node:crypto';
import {
  assertPrivateGameEvents,
  createSeededRandom,
  isAdjudicationTaskEffect,
  isVersionedGameModule,
  type Actor,
  type AdjudicationTaskEffect,
  type ChatMessageView,
  type GameContext,
  type GameEffect,
  type PrivateGameEvent,
} from '@ldj/shared';
import {
  GameInternalError,
  sanitizeFailureDetails,
  type SuspendedReasonCode,
} from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import { withTransaction } from '../../persistence/db.ts';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { getGameModule, getSessionGameModule, resolveRulesetForStart, DEFAULT_GAME_ID, type RegisteredGameModule } from './registry.ts';
import { createEventEnvelope, type EffectReceipt } from './eventEnvelope.ts';
import {
  createSnapshotEnvelope,
  isSnapshotEnvelopeV2,
  parseSnapshotEnvelope,
  type SnapshotEnvelopeV2,
} from './snapshotEnvelope.ts';
import { createStateDigest } from './stateDigest.ts';

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
  /** D4-F1：权威规则集身份（migration v7 后必填） */
  ruleset_id?: string;
  failure?: string | null;
}

/** 一次成功 reduce 的落库结果；gateway 据此广播视角/事件，timer runner 据此对表 */
export interface GameActionOutcome {
  sessionId: string;
  moduleId: string;
  /** 本次动作在事件流水中的序号 */
  seq: number;
  /** V2 快照信封；legacy 会话保持 false */
  readonly versioned: boolean;
  /** 本次动作的公开事件；events 为兼容别名 */
  readonly publicEvents: unknown[];
  readonly privateEvents: PrivateGameEvent[];
  readonly rulesetId: string | null;
  readonly viewVersion: number | null;
  /** 本次已提交的房间级序号 */
  readonly roomSeq: number;
  /** 模块事件（公开语义，legacy gateway 兼容别名） */
  events: unknown[];
  /** 已写入聊天流的系统消息（gateway 直接以 chat_batch 广播） */
  systemChats: ChatMessageView[];
  /** timers 表有变更（需要重新对表） */
  timersChanged: boolean;
  /** D4-A1：本次动作声明的外部裁判任务（平台在事务提交后落库，不参与房间事务） */
  readonly adjudicationEffects?: readonly AdjudicationTaskEffect[];
  finished: boolean;
  aborted: boolean;
}

export function getActiveSession(db: Db, roomId: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT * FROM game_sessions
       WHERE room_id = ? AND status IN ('PREPARING','ACTIVE','RECOVERING','SUSPENDED')`,
    )
    .get(roomId) as SessionRow | undefined;
}

function requireModule(moduleId: string): RegisteredGameModule {
  const module = getGameModule(moduleId);
  if (!module) throw new CommandError('INTERNAL_ERROR', `未注册的游戏模块：${moduleId}`);
  return module;
}

/** D4-F1：会话级模块解析，以持久化 ruleset_id 为权威；缺失/未注册即失败关闭。 */
function requireSessionModule(session: SessionRow): RegisteredGameModule {
  const module = getSessionGameModule(session);
  if (!module) {
    throw new CommandError(
      'INTERNAL_ERROR',
      `会话 ${session.id} 的规则集不可用：${session.ruleset_id ?? '<missing>'}`,
    );
  }
  return module;
}

/** rng_state_json 只保存抽取游标；相同 (seed, cursor) 序列一致（§8.5） */
function parseRngCursor(json: string): number {
  const parsed = JSON.parse(json) as { cursor?: unknown };
  if (!Number.isSafeInteger(parsed.cursor) || (parsed.cursor as number) < 0) {
    throw new Error('随机状态游标无效');
  }
  return parsed.cursor as number;
}

function moduleSnapshotIdentity(module: Extract<RegisteredGameModule, { readonly identity: unknown }>) {
  return {
    gameId: module.manifest.id,
    rulesetId: module.identity.rulesetId,
    schemaVersion: module.manifest.stateSchemaVersion,
  };
}

function participantIdsFromState(state: unknown): string[] {
  if (typeof state !== 'object' || state === null) return [];
  const players = (state as { players?: unknown }).players;
  if (Array.isArray(players) && players.every((entry) => typeof entry === 'string')) return [...players];
  if (typeof players === 'object' && players !== null && !Array.isArray(players)) return Object.keys(players);
  return [];
}

export interface LoadedSessionState {
  readonly state: unknown;
  readonly rngCursor: number;
  readonly snapshot: SnapshotEnvelopeV2 | null;
}

/** 单一会话状态入口：V2 严格验证信封，legacy 维持原始 JSON。 */
export function loadSessionState(session: SessionRow, module = requireSessionModule(session)): LoadedSessionState {
  const parsed: unknown = JSON.parse(session.snapshot_json);
  const legacyCursor = parseRngCursor(session.rng_state_json);
  if (!isVersionedGameModule(module)) return { state: parsed, rngCursor: legacyCursor, snapshot: null };
  if (!isSnapshotEnvelopeV2(parsed)) {
    // 历史 raw snapshot 的显式转换由启动恢复负责；普通动作路径不得静默包装。
    throw new Error('版本化会话缺少快照信封');
  }
  const snapshot = parseSnapshotEnvelope(parsed, moduleSnapshotIdentity(module));
  if (snapshot.rngState.cursor !== legacyCursor) throw new Error('快照与随机状态游标不一致');
  const state = module.parseState(snapshot.state);
  module.assertInvariants(state);
  return { state, rngCursor: snapshot.rngState.cursor, snapshot };
}

function isZodError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ZodError';
}

/**
 * D4-F2：把内部规则故障持久化为 SUSPENDED + 类型化失败码。
 * 在外层动作事务已回滚后单独提交（内部故障不产生任何动作写入）。
 * 不取消 pending 计时器：SUSPENDED 期间计时器不触发，
 * 重启恢复时按既有 RECOVERING 流程重挂，保证可确定性续跑。
 */
function writeSuspended(
  db: Db,
  session: SessionRow,
  reason: SuspendedReasonCode,
  error: unknown,
  seq: number,
): void {
  try {
    withTransaction(db, () => {
      db.prepare(
        `UPDATE game_sessions
         SET status = 'SUSPENDED', failure = ?, failure_details_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        reason,
        sanitizeFailureDetails(reason, error, {
          sessionId: session.id,
          moduleId: session.module_id,
          rulesetId: session.ruleset_id ?? '',
          seq,
        }),
        Date.now(),
        session.id,
      );
    });
  } catch {
    // 写 SUSPENDED 失败不掩盖原始内部故障；由调用方按内部错误继续处理。
  }
}

/**
 * 在事务内应用一个已解析会话上的动作：reduce → 事件流水 → 快照 → effects → 结果。
 * reduce 拒绝时抛 CommandError（不产生任何写入，由外层事务回滚保证）。
 * 内部故障（reduce 抛错 / schema / invariant / 未知 effect / 不可序列化）：
 * 原事务回滚，会话置 SUSPENDED + 类型化失败码，并以内部错误向外抛出。
 */
export function applySessionAction(
  tx: TxContext,
  session: SessionRow,
  actor: Actor,
  rawAction: unknown,
  requestId: string | null,
  module: RegisteredGameModule = requireSessionModule(session),
): GameActionOutcome {
  const { db } = tx;

  let action: unknown;
  try {
    action = module.parseAction(rawAction);
  } catch (err) {
    if (isZodError(err)) throw new CommandError('INVALID_MESSAGE', '游戏动作格式无效');
    throw err;
  }

  const seq = session.last_seq + 1;
  try {
    return applySessionActionCore(tx, session, module, action, actor, requestId, seq);
  } catch (err) {
    // 用户输入拒绝（CommandError）不暂停会话。
    if (err instanceof CommandError) throw err;
    const reason: SuspendedReasonCode =
      err instanceof GameInternalError
        ? err.reason
        : isZodError(err)
          ? 'SUSPENDED_STATE_SCHEMA'
          : 'SUSPENDED_REDUCE_FAULT';
    writeSuspended(db, session, reason, err, seq);
    // 对外保持内部错误不透明：客户端只收到稳定错误码，细节留在 failure 列诊断。
    throw new CommandError('INTERNAL_ERROR', '对局内部错误，已暂停');
  }
}

function applySessionActionCore(
  tx: TxContext,
  session: SessionRow,
  module: RegisteredGameModule,
  action: unknown,
  actor: Actor,
  requestId: string | null,
  seq: number,
): GameActionOutcome {
  const { db, now } = tx;
  const loaded = loadSessionState(session, module);
  const random = createSeededRandom(session.seed, loaded.rngCursor);
  const rngCursorBefore = random.getCursor();
  const ctx: GameContext = { now, random };
  const state = loaded.state;

  const rawResult = module.reduce(ctx, state, actor, action);
  if (!rawResult.ok) {
    // 模块 code 不进错误码表；统一映射为 ACTION_NOT_ALLOWED，message 保留模块文案
    throw new CommandError('ACTION_NOT_ALLOWED', rawResult.message);
  }

  let nextState: unknown;
  let events: readonly unknown[];
  let privateEvents: readonly PrivateGameEvent[] = [];
  let effects: readonly GameEffect[];
  let gameResult: unknown;
  if ('nextState' in rawResult) {
    if (!isVersionedGameModule(module)) {
      throw new CommandError('INTERNAL_ERROR', '游戏模块契约与 reduce 结果不一致');
    }
    nextState = module.parseState(rawResult.nextState);
    module.assertInvariants(nextState);
    assertPrivateGameEvents(rawResult.privateEvents, participantIdsFromState(nextState));
    events = rawResult.publicEvents;
    privateEvents = rawResult.privateEvents;
    effects = rawResult.effects;
    gameResult = rawResult.resultCandidate;
  } else {
    nextState = rawResult.state;
    events = rawResult.events;
    effects = rawResult.effects;
    if (!('getResult' in module)) {
      throw new CommandError('INTERNAL_ERROR', '游戏模块契约与 reduce 结果不一致');
    }
    gameResult = module.getResult(nextState);
  }

  // effects：计时器/系统消息全部与状态同事务落库（§5.8、§10.3）
  const systemChats: ChatMessageView[] = [];
  const effectReceipts: EffectReceipt[] = [];
  const adjudicationEffects: AdjudicationTaskEffect[] = [];
  let timersChanged = false;
  for (const [effectIndex, effect] of effects.entries()) {
    // D4-A1：外部裁判任务（平台级 effect，不在 GameEffect 基联合中）先于
    // 类型化 switch 单独处理，保证既有 effect 的判别联合收窄不受影响。
    // 只登记 receipt（kind 'none'，receiptId = taskId）并做参数校验；
    // 真实落库在房间事务提交后由 executor post-commit 回调完成。
    if ((effect as { type?: unknown }).type === 'enqueue_adjudication') {
      const taskEffect = effect as unknown as AdjudicationTaskEffect;
      if (
        !isAdjudicationTaskEffect(taskEffect)
        || taskEffect.sessionId !== session.id
        || taskEffect.submittedAtSeq < 1
      ) {
        throw new GameInternalError('SUSPENDED_UNKNOWN_EFFECT', '外部裁判任务 effect 参数无效');
      }
      adjudicationEffects.push(taskEffect);
      effectReceipts.push({ effectIndex, kind: 'none', receiptId: taskEffect.taskId });
      continue;
    }
    switch (effect.type) {
      case 'schedule_timer':
        db.prepare(
          `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
           VALUES (?, ?, ?, ?, 'pending')
           ON CONFLICT (session_id, timer_id)
           DO UPDATE SET deadline_at = excluded.deadline_at, action_json = excluded.action_json, status = 'pending'`,
        ).run(session.id, effect.timerId, effect.deadlineAt, JSON.stringify(effect.action));
        timersChanged = true;
        effectReceipts.push({ effectIndex, kind: 'timer', receiptId: `${effect.timerId}:pending` });
        break;
      case 'cancel_timer':
        db.prepare(
          `UPDATE timers SET status = 'cancelled'
           WHERE session_id = ? AND timer_id = ? AND status = 'pending'`,
        ).run(session.id, effect.timerId);
        timersChanged = true;
        effectReceipts.push({ effectIndex, kind: 'timer', receiptId: `${effect.timerId}:cancelled` });
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
        effectReceipts.push({ effectIndex, kind: 'chat', receiptId: String(info.lastInsertRowid) });
        break;
      }
      default:
        // D4-F2：未知 effect 是规则模块内部故障，失败关闭并暂停会话。
        throw new GameInternalError(
          'SUSPENDED_UNKNOWN_EFFECT',
          `未知 effect 类型：${String((effect as { type?: unknown }).type)}`,
        );
    }
  }

  // 每个已接受的变更都写最新快照（§10.1）。V2 在原 JSON 列内写版本化信封。
  const rngCursorAfter = random.getCursor();
  const versioned = isVersionedGameModule(module);
  const snapshotJson = versioned
    ? JSON.stringify(createSnapshotEnvelope({
        ...moduleSnapshotIdentity(module),
        createdAtSequence: seq,
        rngState: { cursor: rngCursorAfter },
        state: nextState,
      }))
    : JSON.stringify(nextState);
  const persistedEvents = versioned
    ? createEventEnvelope({
        rulesetId: module.identity.rulesetId,
        roomSeq: tx.roomSeq,
        publicEvents: events,
        privateEvents,
        effects,
        effectReceipts,
        resultCandidate: gameResult,
        rngCursorBefore,
        rngCursorAfter,
        nextStateDigest: createStateDigest(nextState),
      })
    : events;

  // 事件流水（§10.2 game_events）：完整记录 actor/action/版本化输出，供审计与重放。
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
    JSON.stringify(persistedEvents),
  );

  const finished = gameResult !== null;
  // 约定：结果对象可携带 aborted 标记（如全员退出，§6.7）；缺省视为正常结束
  const aborted = finished && (gameResult as { aborted?: boolean }).aborted === true;

  db.prepare(
    `UPDATE game_sessions
     SET snapshot_json = ?, rng_state_json = ?, last_seq = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    snapshotJson,
    JSON.stringify({ cursor: rngCursorAfter }),
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
    // 对局结束回到结算等待：真人准备状态清零，等待重新准备再来一局；
    // 机器人保持就绪（无法自己点准备，加入时即 ready=1）
    db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ? AND is_bot = 0`).run(session.room_id);
    timersChanged = true;
  }

  // 内存中的行同步推进，便于同事务内连续应用（如 start → begin）
  session.snapshot_json = snapshotJson;
  session.rng_state_json = JSON.stringify({ cursor: rngCursorAfter });
  session.last_seq = seq;
  if (finished) session.status = aborted ? 'ABORTED' : 'FINISHED';

  return {
    sessionId: session.id,
    moduleId: session.module_id,
    seq,
    versioned,
    publicEvents: [...events],
    privateEvents: [...privateEvents],
    rulesetId: versioned ? module.identity.rulesetId : null,
    viewVersion: versioned ? module.identity.viewVersion : null,
    roomSeq: tx.roomSeq,
    events: [...events],
    systemChats,
    timersChanged,
    adjudicationEffects,
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

/**
 * D4-A1：外部裁判结果再入房间串行事务链。
 * 结果以 system 动作 external_task_result 经 executor.executeInternal 进入；
 * 平台层 exactly-once 由 taskQueue 的 adjudication_tasks 行状态保证
 * （done/discarded 后丢弃），这里只负责把有效结果交给模块 reducer 应用，
 * 绝不直接修改权威状态。
 */
export function applyExternalTaskResult(
  tx: TxContext,
  sessionId: string,
  taskId: string,
  expectedSequence: number,
  result: unknown,
  resolveModule: (session: SessionRow) => RegisteredGameModule | undefined = getSessionGameModule,
): GameActionOutcome {
  const session = tx.db
    .prepare('SELECT * FROM game_sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
  if (!session) {
    throw new CommandError('ACTION_NOT_ALLOWED', '外部裁判结果对应的会话不存在');
  }
  const module = resolveModule(session);
  if (!module) {
    throw new CommandError(
      'INTERNAL_ERROR',
      `外部裁判结果无法应用：规则集不可用 ${session.ruleset_id ?? '<missing>'}`,
    );
  }
  return applySessionAction(
    tx,
    session,
    { kind: 'system', source: 'recovery' },
    { type: 'external_task_result', taskId, expectedSequence, result },
    taskId,
    module,
  );
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
  if (room.status !== 'LOBBY' && room.status !== 'POST_GAME') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只能在大厅或结算页开始游戏');
  }
  if (getActiveSession(db, roomId)) {
    throw new CommandError('ACTION_NOT_ALLOWED', '已有进行中的对局');
  }
  if (room.status === 'POST_GAME') {
    db.prepare(`UPDATE rooms SET status = 'LOBBY', updated_at = ? WHERE id = ?`).run(now, roomId);
  }

  const resolvedConfig = gameConfig ?? parseRoomGameConfig(db, roomId);
  const moduleId = room.game_id ?? DEFAULT_GAME_ID;
  // D4-F1：先解析权威规则集，再按 (gameId, rulesetId) 取模块。
  // 这样同一游戏可并行承载 legacy 与版本化规则集；未指定 rulesetId 仍走游戏默认。
  // rulesetId 是平台元数据，不属于模块 config；解析后从传给模块的配置中剥离，
  // 避免 strict 模块 schema（如卧底）拒绝未知键。
  const rulesetId = resolveRulesetForStart(moduleId, resolvedConfig ?? {});
  const module = getGameModule(moduleId, rulesetId);
  if (!module) {
    throw new CommandError('INTERNAL_ERROR', `规则集模块不可用：${moduleId}/${rulesetId}`);
  }
  const moduleConfig = (resolvedConfig as Record<string, unknown> | null | undefined) ?? {};
  const roomRow = db.prepare('SELECT config_json FROM rooms WHERE id = ?').get(roomId) as { config_json: string } | undefined;
  let roomConfigObj: Record<string, unknown> = {};
  try {
    roomConfigObj = JSON.parse(roomRow?.config_json ?? '{}');
  } catch {
    roomConfigObj = {};
  }

  // 开局重新校验连接状态（§5.9/D-6）：只有在线玩家参与本局
  const allConnectedPlayers = (
    db
      .prepare(
        `SELECT player_id, ready FROM room_members
         WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED'
         ORDER BY seat ASC`,
      )
      .all(roomId) as { player_id: string; ready: number }[]
  ).map((r) => r.player_id);

  if (allConnectedPlayers.length < module.manifest.minPlayers || allConnectedPlayers.length > module.manifest.maxPlayers) {
    throw new CommandError(
      'ACTION_NOT_ALLOWED',
      `在线玩家需为 ${module.manifest.minPlayers}–${module.manifest.maxPlayers} 人（当前 ${allConnectedPlayers.length}）`,
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

  const rawMergedConfig: Record<string, unknown> = {
    ...moduleConfig,
  };
  const { rulesetId: _platformRuleset, ...restConfig } = rawMergedConfig;

  let config: unknown;
  try {
    config = module.parseConfig(restConfig);
  } catch (err) {
    if (isZodError(err)) throw new CommandError('INVALID_MESSAGE', '游戏配置无效');
    throw err;
  }

  // FR-RESULT-003：新 SessionId + 新随机种子，不复用上一局秘密状态
  const sessionId = randomUUID();
  const seed = randomUUID();
  const random = createSeededRandom(seed);
  const initialState = module.createInitialState({ now, random }, allConnectedPlayers, config);
  if (isVersionedGameModule(module)) {
    module.assertInvariants(module.parseState(initialState));
  }
  const initialCursor = random.getCursor();
  const initialSnapshotJson = isVersionedGameModule(module)
    ? JSON.stringify(createSnapshotEnvelope({
        ...moduleSnapshotIdentity(module),
        createdAtSequence: 0,
        rngState: { cursor: initialCursor },
        state: initialState,
      }))
    : JSON.stringify(initialState);

  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    sessionId,
    roomId,
    moduleId,
    module.manifest.version,
    module.manifest.stateSchemaVersion,
    initialSnapshotJson,
    seed,
    JSON.stringify({ cursor: initialCursor }),
    rulesetId,
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

  return { sessionId, moduleId, playerIds: allConnectedPlayers, begin };
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
  // 机器人保持就绪（同 returnToLobby 语义）
  db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ? AND is_bot = 0`).run(roomId);
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
  // 回大厅等同新的一轮等待：重置真人准备（机器人保持就绪——它们无法自己点准备，
  // 加入时即 ready=1，跨局沿用；否则带机器人的房间永远无法"再来一局"）
  db.prepare(`UPDATE room_members SET ready = 0 WHERE room_id = ? AND is_bot = 0`).run(roomId);
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
  const room = db.prepare('SELECT status, game_id, config_json FROM rooms WHERE id = ?').get(roomId) as
    | { status: string; game_id: string | null; config_json: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'LOBBY' && room.status !== 'POST_GAME') return null;
  if (getActiveSession(db, roomId)) return null;
  const moduleId = room.game_id ?? DEFAULT_GAME_ID;
  const module = requireModule(moduleId);

  let roomConfigObj: Record<string, unknown> = {};
  try {
    roomConfigObj = JSON.parse(room.config_json);
  } catch {
    roomConfigObj = {};
  }
  const config = parseRoomGameConfig(db, roomId);
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
  try {
    return applySessionAction(
      tx,
      session,
      { kind: 'system', source: 'timer' },
      { type: 'player_forfeited', playerIds },
      null,
    );
  } catch {
    // 某些模块不定义 player_forfeited 动作：若房间内已无有效连接或保留，直接终止对局
    const activeCount = tx.db.prepare(
      `SELECT count(*) as c FROM room_members WHERE room_id = ? AND connection_status IN ('CONNECTED', 'DISCONNECTED_RESERVED')`,
    ).get(roomId) as { c: number };
    if (activeCount.c === 0) {
      abortGame(tx, roomId);
    }
    return null;
  }
}
