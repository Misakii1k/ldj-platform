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
import type { Db } from '../persistence/db.ts';
import { withTransaction } from '../persistence/db.ts';
import { consumeDueTimer } from './game/timerRunner.ts';
import { getGameModule } from './game/registry.ts';
import type { Logger } from '../boot/logger.ts';

export interface RecoverySummary {
  roomsProcessed: number;
  sessionsRecovered: number;
  sessionsAborted: number;
  timersFired: number;
}

interface SessionRow {
  id: string;
  room_id: string;
  module_id: string;
  module_version: string;
  state_schema_version: number;
  status: string;
  snapshot_json: string;
}

interface DueTimerRow {
  session_id: string;
  timer_id: string;
  room_id: string;
  deadline_at: number;
}

/** 恢复失败原因文案（面向用户，不暴露内部细节） */
const REASON_MODULE_MISSING = '对局因服务升级无法恢复，已终止';
const REASON_SCHEMA_MISMATCH = '对局数据版本不兼容，已终止';
const REASON_SNAPSHOT_CORRUPT = '对局数据损坏，已终止';

/**
 * 在事务内将一个会话标记为 ABORTED 并写入诊断系统聊天。
 * 不写 game_results（FR-RESULT-002：ABORTED 不计战绩）。
 */
function abortSession(db: Db, session: SessionRow, reason: string, now: number): void {
  db.prepare(`UPDATE game_sessions SET status = 'ABORTED', updated_at = ? WHERE id = ?`).run(
    now,
    session.id,
  );
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

/**
 * 校验单个会话是否可恢复：模块已注册 + stateSchemaVersion 匹配（或可迁移）+ 快照可解析。
 * 返回 null 表示可恢复；返回失败原因文案表示不可恢复。
 */
function validateSession(session: SessionRow): string | null {
  const module = getGameModule(session.module_id);
  if (!module) return REASON_MODULE_MISSING;

  const schemaMatch = module.manifest.stateSchemaVersion === session.state_schema_version;
  if (!schemaMatch && typeof module.migrateSnapshot !== 'function') {
    return REASON_SCHEMA_MISMATCH;
  }

  try {
    const parsed = JSON.parse(session.snapshot_json);
    if (!schemaMatch) {
      // 有 migrateSnapshot：尝试迁移，失败则视为损坏
      module.migrateSnapshot!(session.state_schema_version, parsed);
    }
  } catch {
    return REASON_SNAPSHOT_CORRUPT;
  }
  return null;
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
      `SELECT id, room_id, module_id, module_version, state_schema_version, status, snapshot_json
       FROM game_sessions
       WHERE status IN ('PREPARING','ACTIVE','RECOVERING')`,
    )
    .all() as unknown as SessionRow[];

  // 步骤 3：校验每个会话，通过则标记 RECOVERING，失败则 ABORTED
  for (const session of sessions) {
    summary.roomsProcessed += 1;
    const now = Date.now();
    const failureReason = validateSession(session);

    if (failureReason !== null) {
      withTransaction(db, () => abortSession(db, session, failureReason, now));
      summary.sessionsAborted += 1;
      logger.warn('recovery_session_aborted', {
        sessionId: session.id,
        roomId: session.room_id,
        reason:
          failureReason === REASON_MODULE_MISSING
            ? 'module_missing'
            : failureReason === REASON_SCHEMA_MISMATCH
              ? 'schema_mismatch'
              : 'snapshot_corrupt',
      });
      continue;
    }

    // 校验通过：标记 RECOVERING（若已是 RECOVERING 则保持）
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
        `SELECT t.session_id, t.timer_id, s.room_id, t.deadline_at
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
      const result = withTransaction(db, () =>
        // roomSeq=0：恢复期系统动作不推进房间序号（无客户端 ack 语义）
        consumeDueTimer({ db, now, roomSeq: 0 }, due.session_id, due.timer_id),
      );
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

  // 步骤 5：所有到期计时器补执行完毕，RECOVERING → ACTIVE
  // 若补执行导致会话 FINISHED/ABORTED（如全员退出），则不转 ACTIVE
  withTransaction(db, () => {
    db.prepare(
      `UPDATE game_sessions SET status = 'ACTIVE', updated_at = ?
       WHERE status = 'RECOVERING'`,
    ).run(Date.now());
  });

  logger.info('recovery_completed', { ...summary });
  return summary;
}
