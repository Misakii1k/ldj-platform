/**
 * 启动恢复（SPEC §10.4）：
 * 1. 成员连接状态统一重置为离线（不信任上一进程的连接标记）
 * 2. 校验游戏模块 ID、模块版本、状态 schema 与快照内容
 * 3. 对活动对局进入 RECOVERING，按 deadlineAt 顺序补执行到期计时器
 * 4. 每个补执行动作独立原子提交；完成后转为 ACTIVE
 * 5. 任何快照无法解析或迁移时标记 ABORTED，保留诊断信息并向房间成员说明
 *
 * 恢复在 createApp 中同步执行：接受新连接前完成全部补执行。
 */
import { isVersionedGameModule } from '@ldj/shared';
import type { Db } from '../persistence/db.ts';
import { withTransaction } from '../persistence/db.ts';
import { consumeDueTimer } from './game/timerRunner.ts';
import { getSessionGameModule, type RegisteredGameModule } from './game/registry.ts';
import {
  loadSessionState,
  type SessionRow,
} from './game/session.ts';
import {
  createSnapshotEnvelope,
  isSnapshotEnvelopeV2,
  parseSnapshotEnvelope,
} from './game/snapshotEnvelope.ts';
import { replayVersionedTrailingEvents } from './game/versionedRecovery.ts';
import { settleAdjudicationTasks } from './adjudication/taskStore.ts';
import type { Logger } from '../boot/logger.ts';

export interface RecoverySummary {
  roomsProcessed: number;
  sessionsRecovered: number;
  sessionsAborted: number;
  timersFired: number;
  /** D4-A1：外部裁判任务恢复结算计数 */
  adjudicationTasksReset: number;
  adjudicationTasksDiscarded: number;
}

interface DueTimerRow {
  session_id: string;
  timer_id: string;
  room_id: string;
  deadline_at: number;
  module_id: string;
  ruleset_id: string;
}

/** 恢复失败原因文案（面向用户，不暴露内部细节） */
const REASON_MODULE_MISSING = '对局因服务升级无法恢复，已终止';
const REASON_SCHEMA_MISMATCH = '对局数据版本不兼容，已终止';
const REASON_SNAPSHOT_CORRUPT = '对局数据损坏，已终止';
const REASON_RULESET_UNAVAILABLE = '对局规则集不可用，已终止';

/**
 * 在事务内将一个会话标记为 ABORTED 并写入诊断系统聊天与类型化失败码。
 * 不写 game_results（FR-RESULT-002：ABORTED 不计战绩）。
 */
function abortSession(db: Db, session: SessionRow, reason: string, now: number, failureCode?: string): void {
  db.prepare(
    `UPDATE game_sessions SET status = 'ABORTED', failure = COALESCE(?, failure), updated_at = ? WHERE id = ?`,
  ).run(failureCode ?? null, now, session.id);
  db.prepare(
    `UPDATE timers SET status = 'cancelled' WHERE session_id = ? AND status = 'pending'`,
  ).run(session.id);
  db.prepare(`UPDATE rooms SET status = 'POST_GAME', updated_at = ? WHERE id = ?`).run(
    now,
    session.room_id,
  );
  db.prepare(
    `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at)
     VALUES (?, ?, NULL, 'system', ?, ?)`,
  ).run(session.room_id, session.id, reason, now);
}

/** 失败原因文案 → 类型化失败码（F2：FAILED_* 终止语义）。 */
function failureCodeForReason(reason: string): string | undefined {
  if (reason === REASON_RULESET_UNAVAILABLE) return 'FAILED_RULESET_UNAVAILABLE';
  if (reason === REASON_SCHEMA_MISMATCH || reason === REASON_SNAPSHOT_CORRUPT) return 'FAILED_RECOVERY';
  return undefined;
}

/**
 * 校验单个会话是否可恢复：模块已注册 + stateSchemaVersion 匹配（或可迁移）+ 快照可解析。
 * 返回 null 表示可恢复；返回失败原因文案表示不可恢复。
 */
interface SessionValidation {
  failureReason: string | null;
  migratedSnapshot: unknown | null;
  migratedSchemaVersion: number | null;
  replayedEvents: number;
}

function parseStoredCursor(session: SessionRow): number {
  const parsed = JSON.parse(session.rng_state_json) as { cursor?: unknown };
  if (!Number.isSafeInteger(parsed.cursor) || (parsed.cursor as number) < 0) {
    throw new Error('随机游标无效');
  }
  return parsed.cursor as number;
}

function wrapVersionedState(
  session: SessionRow,
  module: Extract<RegisteredGameModule, { readonly identity: unknown }>,
  state: unknown,
): unknown {
  const parsedState = module.parseState(state);
  module.assertInvariants(parsedState);
  return createSnapshotEnvelope({
    gameId: module.manifest.id,
    rulesetId: module.identity.rulesetId,
    schemaVersion: module.manifest.stateSchemaVersion,
    createdAtSequence: session.last_seq,
    rngState: { cursor: parseStoredCursor(session) },
    state: parsedState,
  });
}

function validateSession(db: Db, session: SessionRow): SessionValidation {
  // D4-F1：以持久化 ruleset_id 解析模块；缺失/未注册一律失败关闭，不猜测默认。
  const module = getSessionGameModule(session);
  if (!module) {
    return {
      failureReason: REASON_RULESET_UNAVAILABLE,
      migratedSnapshot: null,
      migratedSchemaVersion: null,
      replayedEvents: 0,
    };
  }

  const schemaMatch = module.manifest.stateSchemaVersion === session.state_schema_version;
  const canMigrate = isVersionedGameModule(module)
    ? session.state_schema_version in module.snapshotMigrations
    : typeof module.migrateSnapshot === 'function';
  if (!schemaMatch && !canMigrate) {
    return {
      failureReason: REASON_SCHEMA_MISMATCH,
      migratedSnapshot: null,
      migratedSchemaVersion: null,
      replayedEvents: 0,
    };
  }

  const parsed = JSON.parse(session.snapshot_json);
  if (isVersionedGameModule(module)) {
    if (schemaMatch) {
      if (isSnapshotEnvelopeV2(parsed)) {
        const envelope = parseSnapshotEnvelope(parsed, {
          gameId: module.manifest.id,
          rulesetId: module.identity.rulesetId,
          schemaVersion: module.manifest.stateSchemaVersion,
        });
        if (envelope.createdAtSequence > session.last_seq) {
          throw new Error('快照序号超过会话末序号');
        }
        if (envelope.createdAtSequence < session.last_seq) {
          const replayed = replayVersionedTrailingEvents(db, session, module);
          return {
            failureReason: null,
            migratedSnapshot: JSON.parse(replayed.snapshotJson),
            migratedSchemaVersion: module.manifest.stateSchemaVersion,
            replayedEvents: replayed.eventsReplayed,
          };
        }
        loadSessionState(session, module);
        return {
          failureReason: null,
          migratedSnapshot: null,
          migratedSchemaVersion: null,
          replayedEvents: 0,
        };
      }
      // pre-D3 raw snapshot → 显式包装；同 schema 仍运行 parseState 与不变量。
      const state = module.parseState(parsed);
      return {
        failureReason: null,
        migratedSnapshot: wrapVersionedState(session, module, state),
        migratedSchemaVersion: module.manifest.stateSchemaVersion,
        replayedEvents: 0,
      };
    }
    const inputState = isSnapshotEnvelopeV2(parsed)
      ? parseSnapshotEnvelope(parsed, {
          gameId: module.manifest.id,
          rulesetId: module.identity.rulesetId,
          schemaVersion: session.state_schema_version,
        }).state
      : parsed;
    let current: unknown = inputState;
    for (let version = session.state_schema_version; version < module.manifest.stateSchemaVersion; version += 1) {
      const migrate = module.snapshotMigrations[version];
      if (!migrate) throw new Error(`缺少 ${version} → ${version + 1} 相邻快照迁移`);
      current = migrate(current);
    }
    return {
      failureReason: null,
      migratedSnapshot: wrapVersionedState(session, module, current),
      migratedSchemaVersion: module.manifest.stateSchemaVersion,
      replayedEvents: 0,
    };
  }
  if (!schemaMatch) {
    const migrated = module.migrateSnapshot!(session.state_schema_version, parsed);
    return {
      failureReason: null,
      migratedSnapshot: migrated,
      migratedSchemaVersion: module.manifest.stateSchemaVersion,
      replayedEvents: 0,
    };
  }
  return {
    failureReason: null,
    migratedSnapshot: null,
    migratedSchemaVersion: null,
    replayedEvents: 0,
  };
}

function safelyValidateSession(db: Db, session: SessionRow): SessionValidation {
  try {
    return withTransaction(db, () => validateSession(db, session));
  } catch {
    return {
      failureReason: REASON_SNAPSHOT_CORRUPT,
      migratedSnapshot: null,
      migratedSchemaVersion: null,
      replayedEvents: 0,
    };
  }
}

/**
 * 启动恢复主流程。在 migrate 之后、接受新连接之前同步执行。
 * 返回摘要供日志记录；任何内部异常向上抛出（启动失败以非零退出码结束）。
 */
export function runStartupRecovery(db: Db, logger: Logger): RecoverySummary {
  const summary: RecoverySummary = {
    roomsProcessed: 0,
    sessionsRecovered: 0,
    sessionsAborted: 0,
    timersFired: 0,
    adjudicationTasksReset: 0,
    adjudicationTasksDiscarded: 0,
  };

  // 步骤 1：重置成员连接状态（§10.4.3）
  // KICKED 保持不变；CONNECTED 是上一进程遗留，降级为 DISCONNECTED_RESERVED。
  // 保留 reserved_until：席位保留期跨重启仍有效（FR-ID-003）。
  withTransaction(db, () => {
    const result = db
      .prepare(
        `UPDATE room_members
         SET connection_status = 'DISCONNECTED_RESERVED'
         WHERE connection_status = 'CONNECTED'
           AND room_id IN (SELECT id FROM rooms WHERE status != 'CLOSED')`,
      )
      .run();
    if (result.changes > 0) {
      logger.info('recovery_members_reset', { count: result.changes });
    }
  });

  // 步骤 2：加载所有活动对局（PREPARING/ACTIVE/RECOVERING）
  const sessions = db
    .prepare(
      `SELECT *
       FROM game_sessions
       WHERE status IN ('PREPARING','ACTIVE','RECOVERING','SUSPENDED')`,
    )
    .all() as unknown as SessionRow[];

  // 步骤 3：校验每个会话，通过则标记 RECOVERING，失败则 ABORTED
  for (const session of sessions) {
    summary.roomsProcessed += 1;
    const now = Date.now();
    const validation = safelyValidateSession(db, session);
    const { failureReason } = validation;

    if (failureReason !== null) {
      withTransaction(db, () =>
        abortSession(db, session, failureReason, now, failureCodeForReason(failureReason)),
      );
      summary.sessionsAborted += 1;
      logger.warn('recovery_session_aborted', {
        sessionId: session.id,
        roomId: session.room_id,
        reason:
          failureReason === REASON_MODULE_MISSING
            ? 'module_missing'
            : failureReason === REASON_SCHEMA_MISMATCH
              ? 'schema_mismatch'
              : failureReason === REASON_RULESET_UNAVAILABLE
                ? 'ruleset_unavailable'
                : 'snapshot_corrupt',
      });
      continue;
    }

    if (validation.migratedSnapshot !== null && validation.migratedSchemaVersion !== null) {
      const snapshotJson = JSON.stringify(validation.migratedSnapshot);
      const migratedCursor = isSnapshotEnvelopeV2(validation.migratedSnapshot)
        ? validation.migratedSnapshot.rngState.cursor
        : null;
      withTransaction(db, () => {
        db.prepare(
          `UPDATE game_sessions
           SET snapshot_json = ?, state_schema_version = ?,
               rng_state_json = CASE WHEN ? IS NULL THEN rng_state_json ELSE ? END,
               updated_at = ?
           WHERE id = ?`,
        ).run(
          snapshotJson,
          validation.migratedSchemaVersion,
          migratedCursor,
          migratedCursor === null ? null : JSON.stringify({ cursor: migratedCursor }),
          now,
          session.id,
        );
      });
      session.snapshot_json = snapshotJson;
      session.state_schema_version = validation.migratedSchemaVersion;
      if (migratedCursor !== null) session.rng_state_json = JSON.stringify({ cursor: migratedCursor });
      logger.info('recovery_session_migrated', {
        sessionId: session.id,
        roomId: session.room_id,
        stateSchemaVersion: validation.migratedSchemaVersion,
      });
    }

    // 校验通过：标记 RECOVERING（若已是 RECOVERING 则保持）。
    // SUSPENDED 会话在快照/规则集可解析时按确定性恢复继续（F2）。
    if (session.status !== 'RECOVERING') {
      db.prepare(
        `UPDATE game_sessions SET status = 'RECOVERING', updated_at = ? WHERE id = ?`,
      ).run(now, session.id);
    }
    summary.sessionsRecovered += 1;
  }

  // 步骤 4：按 deadlineAt ASC 顺序逐个补执行到期计时器（§10.4.5/§10.4.6）
  // 恢复期无并发（尚未 accept 连接），直接同步事务，不走 executor 队列。
  // consumeDueTimer 已放宽接受 RECOVERING 会话（Task 2）。
  // 补执行可能产生新的到期计时器（如 vote_result → speaking 计时器），循环直到无到期。
  for (;;) {
    const now = Date.now();
    const due = db
      .prepare(
        `SELECT t.session_id, t.timer_id, s.room_id, t.deadline_at, s.module_id, s.ruleset_id
         FROM timers t JOIN game_sessions s ON s.id = t.session_id
         WHERE t.status = 'pending'
           AND s.status = 'RECOVERING'
           AND t.deadline_at <= ?
         ORDER BY t.deadline_at ASC LIMIT 1`,
      )
      .get(now) as DueTimerRow | undefined;
    if (!due) break;

    let fired = false;
    try {
      const module = getSessionGameModule(due as unknown as SessionRow);
      const result = withTransaction(db, () => {
        const room = db.prepare('SELECT seq FROM rooms WHERE id = ?').get(due.room_id) as
          | { seq: number }
          | undefined;
        if (!room) throw new Error('恢复计时器所属房间不存在');
        // V2 补执行是一次真实的持久化游戏变更，必须占用提交后的房间序号；
        // legacy 保留原语义，避免 D3 改变狼人杀/斗地主历史恢复行为。
        const roomSeq = isVersionedGameModule(module) ? room.seq + 1 : room.seq;
        const outcome = consumeDueTimer({ db, now, roomSeq }, due.session_id, due.timer_id);
        if (outcome !== null && isVersionedGameModule(module)) {
          db.prepare('UPDATE rooms SET seq = ?, updated_at = ? WHERE id = ?').run(
            roomSeq,
            now,
            due.room_id,
          );
        }
        return outcome;
      });
      if (result !== null) fired = true;
    } catch (err) {
      // 非 CommandError 异常（如写库失败）：事务已回滚，计时器仍 pending。
      // 为避免无限循环，强制标记 consumed（视为无效计时器）。
      logger.error('recovery_timer_fire_failed', {
        sessionId: due.session_id,
        timerId: due.timer_id,
        message: (err as Error).message,
      });
      withTransaction(db, () => {
        db.prepare(
          `UPDATE timers SET status = 'consumed'
           WHERE session_id = ? AND timer_id = ? AND status = 'pending'`,
        ).run(due.session_id, due.timer_id);
      });
    }
    if (fired) summary.timersFired += 1;
  }

  // 步骤 5：所有到期计时器补执行完毕，RECOVERING → ACTIVE。
  // 成功恢复的 SUSPENDED 会话在此清除失败码（仅对转 ACTIVE 的行）。
  withTransaction(db, () => {
    db.prepare(
      `UPDATE game_sessions SET status = 'ACTIVE', updated_at = ?
       WHERE status = 'RECOVERING'`,
    ).run(Date.now());
    db.prepare(
      `UPDATE game_sessions SET failure = NULL, failure_details_json = NULL, updated_at = ?
       WHERE status = 'ACTIVE' AND failure IS NOT NULL`,
    ).run(Date.now());
  });

  // 步骤 5.5（D4-A1）：外部裁判任务结算。
  // 已结算会话（FINISHED/ABORTED）的迟到任务标记 discarded；
  // 活动会话的 running/errored 任务重置回 pending，由 taskQueue 服务就绪后续跑。
  // 已 done 的任务保持不动：事件重放/重启不再次调用模型、不重新回灌。
  const taskSettlement = settleAdjudicationTasks(db);
  summary.adjudicationTasksReset = taskSettlement.reset;
  summary.adjudicationTasksDiscarded = taskSettlement.discarded;

  logger.info('recovery_completed', { ...summary });
  return summary;
}
