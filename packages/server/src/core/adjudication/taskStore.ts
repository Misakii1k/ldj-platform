/**
 * D4-A1：外部裁判任务存储（adjudication_tasks 表）。
 * 纯 SQL 操作层：任务创建（post-commit）、状态机推进、恢复结算。
 * 不发起任何外部调用；结果回灌由 taskQueue 经房间串行事务链完成。
 */
import type { AdjudicationTaskEffect } from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';

export type AdjudicationTaskStatus = 'pending' | 'running' | 'done' | 'discarded' | 'errored';

/**
 * D4-B T1：重试上限与指数退避（HIGH-1 热重试循环修复）。
 * attempts 持久化在 primary_attempt_json（{"attempts":N}）；
 * 退避延迟按 attempts 指数增长并封顶；attempts 达上限后进入终态不再重试。
 */
export const MAX_ADJUDICATION_TASK_ATTEMPTS = 8;
export const ADJUDICATION_RETRY_BASE_MS = 1_000;
export const ADJUDICATION_RETRY_CAP_MS = 30_000;

/** 纯函数：第 attempts 次失败后的退避延迟（0 → 立即；指数增长封顶 30s）。 */
export function adjudicationRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  if (attempts === 1) return ADJUDICATION_RETRY_BASE_MS;
  const exponent = Math.min(attempts - 1, 5);
  return Math.min(ADJUDICATION_RETRY_BASE_MS * 2 ** exponent, ADJUDICATION_RETRY_CAP_MS);
}

function attemptsFromAttemptsJson(json: string | null): number {
  if (json === null || json === '') return 0;
  try {
    const parsed = JSON.parse(json) as { attempts?: unknown };
    if (Number.isSafeInteger(parsed.attempts) && (parsed.attempts as number) >= 0) {
      return parsed.attempts as number;
    }
  } catch {
    // 损坏的 attempts 视为 0
  }
  return 0;
}

export interface AdjudicationTask {
  taskId: string;
  sessionId: string;
  rulesetId: string;
  taskType: string;
  submittedAtSeq: number;
  eligibilityDigest: string;
  inputDigest: string;
  inputPlaintextJson: string | null;
  status: AdjudicationTaskStatus;
  primaryAttemptJson: string | null;
  fallbackAttemptJson: string | null;
  resultJson: string | null;
  createdAt: number;
  updatedAt: number;
}

interface TaskRow {
  task_id: string;
  session_id: string;
  ruleset_id: string;
  task_type: string;
  submitted_at_seq: number;
  eligibility_digest: string;
  input_digest: string;
  input_plaintext_json: string | null;
  status: AdjudicationTaskStatus;
  primary_attempt_json: string | null;
  fallback_attempt_json: string | null;
  result_json: string | null;
  created_at: number;
  updated_at: number;
}

function rowToTask(row: TaskRow): AdjudicationTask {
  return {
    taskId: row.task_id,
    sessionId: row.session_id,
    rulesetId: row.ruleset_id,
    taskType: row.task_type,
    submittedAtSeq: row.submitted_at_seq,
    eligibilityDigest: row.eligibility_digest,
    inputDigest: row.input_digest,
    inputPlaintextJson: row.input_plaintext_json,
    status: row.status,
    primaryAttemptJson: row.primary_attempt_json,
    fallbackAttemptJson: row.fallback_attempt_json,
    resultJson: row.result_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 创建任务（post-commit 调用）：初始状态 pending。task_id 冲突由调用方处理。 */
export function createAdjudicationTask(db: Db, effect: AdjudicationTaskEffect): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO adjudication_tasks
       (task_id, session_id, ruleset_id, task_type, submitted_at_seq,
        eligibility_digest, input_digest, input_plaintext_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(
    effect.taskId,
    effect.sessionId,
    effect.rulesetId,
    effect.taskType,
    effect.submittedAtSeq,
    effect.eligibilityDigest,
    effect.inputDigest,
    effect.inputPlaintextJson,
    now,
    now,
  );
}

export function getAdjudicationTask(db: Db, taskId: string): AdjudicationTask | undefined {
  const row = db
    .prepare('SELECT * FROM adjudication_tasks WHERE task_id = ?')
    .get(taskId) as TaskRow | undefined;
  return row === undefined ? undefined : rowToTask(row);
}

/** pending/errored → running（调度前认领）；返回是否发生转换。 */
export function claimAdjudicationTask(db: Db, taskId: string): boolean {
  const info = db
    .prepare(
      `UPDATE adjudication_tasks SET status = 'running', updated_at = ?
       WHERE task_id = ? AND status IN ('pending','errored')`,
    )
    .run(Date.now(), taskId);
  return info.changes > 0;
}

/** 回灌完成：result 落库并擦除明文输入（仅 pending/running 需要）；返回是否发生转换。 */
export function completeAdjudicationTask(db: Db, taskId: string, resultJson: string): boolean {
  const info = db
    .prepare(
      `UPDATE adjudication_tasks
       SET status = 'done', result_json = ?, input_plaintext_json = NULL, updated_at = ?
       WHERE task_id = ? AND status IN ('pending','running','errored')`,
    )
    .run(resultJson, Date.now(), taskId);
  return info.changes > 0;
}

/** 标记 discarded（已结算会话迟到结果 / 恢复时放弃）；返回是否发生转换。 */
export function discardAdjudicationTask(db: Db, taskId: string): boolean {
  const info = db
    .prepare(
      `UPDATE adjudication_tasks SET status = 'discarded', updated_at = ?
       WHERE task_id = ? AND status IN ('pending','running','errored')`,
    )
    .run(Date.now(), taskId);
  return info.changes > 0;
}

/**
 * 模型调用失败 → 记一次 attempts（持久化到 primary_attempt_json）→ errored；
 * attempts ≥ 8 时直接进入终态（discarded，不再被调度，永久停留可诊断状态）。
 */
export function markAdjudicationTaskErrored(db: Db, taskId: string): boolean {
  const row = db
    .prepare(
      `SELECT primary_attempt_json FROM adjudication_tasks WHERE task_id = ? AND status IN ('pending','running','errored')`,
    )
    .get(taskId) as { primary_attempt_json: string | null } | undefined;
  if (!row) return false;
  const attempts = attemptsFromAttemptsJson(row.primary_attempt_json) + 1;
  const attemptsJson = JSON.stringify({ attempts });
  const now = Date.now();
  if (attempts >= MAX_ADJUDICATION_TASK_ATTEMPTS) {
    const info = db
      .prepare(
        `UPDATE adjudication_tasks SET status = 'discarded', primary_attempt_json = ?, updated_at = ?
         WHERE task_id = ? AND status IN ('pending','running','errored')`,
      )
      .run(attemptsJson, now, taskId);
    return info.changes > 0;
  }
  const info = db
    .prepare(
      `UPDATE adjudication_tasks SET status = 'errored', primary_attempt_json = ?, updated_at = ?
       WHERE task_id = ? AND status IN ('pending','running','errored')`,
    )
    .run(attemptsJson, now, taskId);
  return info.changes > 0;
}

/** 恢复续跑：running/errored → pending，供 taskQueue 启动后重新调度。 */
export function resetAdjudicationTaskToPending(db: Db, taskId: string): boolean {
  const info = db
    .prepare(
      `UPDATE adjudication_tasks SET status = 'pending', updated_at = ?
       WHERE task_id = ? AND status IN ('running','errored')`,
    )
    .run(Date.now(), taskId);
  return info.changes > 0;
}

/**
 * 取下一个可调度的任务（活动会话的 pending / 退避已到期的 errored）。
 * 用 SQLite json_extract 从 primary_attempt_json 读取 attempts 并计算 nextRetryAt：
 * nextRetryAt = updated_at + 指数退避延迟；未到期 errored 任务不会被热循环重试。
 * 按提交序号与创建时间排序。
 */
export function nextPendingAdjudicationTask(db: Db, now: number = Date.now()): AdjudicationTask | undefined {
  const row = db
    .prepare(
      `SELECT t.* FROM adjudication_tasks t
       JOIN game_sessions s ON s.id = t.session_id
       WHERE s.status IN ('ACTIVE','RECOVERING')
         AND (
           t.status = 'pending'
           OR (
             t.status = 'errored'
             AND COALESCE(t.updated_at + (
               CASE CAST(json_extract(t.primary_attempt_json, '$.attempts') AS INTEGER)
                 WHEN 0 THEN 0
                 WHEN 1 THEN 1000
                 WHEN 2 THEN 2000
                 WHEN 3 THEN 4000
                 WHEN 4 THEN 8000
                 WHEN 5 THEN 16000
                 ELSE 30000
               END
             ), 0) <= ?
           )
         )
       ORDER BY t.submitted_at_seq ASC, t.created_at ASC LIMIT 1`,
    )
    .get(now) as TaskRow | undefined;
  return row === undefined ? undefined : rowToTask(row);
}

/**
 * D4-B T3：trailing-event 幂等对账。
 * 尾事件已提交但 postCommit 落库失败时，按 effect 恢复缺失 pending 行；
 * 已有行必须校验 immutable fields（不一致抛错，失败关闭）；
 * 绝不重复入队，不改动已有行状态。
 */
export function reconcileAdjudicationTask(db: Db, effect: AdjudicationTaskEffect): void {
  const row = db
    .prepare(
      `SELECT task_id, session_id, ruleset_id, task_type, submitted_at_seq,
              eligibility_digest, input_digest, input_plaintext_json
       FROM adjudication_tasks WHERE task_id = ?`,
    )
    .get(effect.taskId) as
    | { session_id: string; ruleset_id: string; task_type: string; submitted_at_seq: number; eligibility_digest: string; input_digest: string; input_plaintext_json: string | null }
    | undefined;
  if (row === undefined) {
    createAdjudicationTask(db, effect);
    return;
  }
  if (
    row.session_id !== effect.sessionId ||
    row.ruleset_id !== effect.rulesetId ||
    row.task_type !== effect.taskType ||
    row.submitted_at_seq !== effect.submittedAtSeq ||
    row.eligibility_digest !== effect.eligibilityDigest ||
    row.input_digest !== effect.inputDigest ||
    row.input_plaintext_json !== effect.inputPlaintextJson
  ) {
    throw new Error('外部裁判任务 effect 与持久化记录不一致');
  }
}

export interface SettleResult {
  reset: number;
  discarded: number;
}

/**
 * 恢复结算（D4-A1，runStartupRecovery 步骤 5 之后调用）：
 * - 已结算会话（FINISHED/ABORTED）的 pending/running/errored 任务 → discarded
 * - 活动会话的 running/errored 任务 → pending（重启后由 taskQueue 续跑）
 * 已 done 的任务（结果已回灌）保持不动，重放不重新回灌。
 */
export function settleAdjudicationTasks(db: Db): SettleResult {
  const rows = db
    .prepare(
      `SELECT t.task_id, t.status, s.status AS session_status
       FROM adjudication_tasks t JOIN game_sessions s ON s.id = t.session_id
       WHERE t.status IN ('pending','running','errored')`,
    )
    .all() as { task_id: string; status: string; session_status: string }[];
  let reset = 0;
  let discarded = 0;
  for (const row of rows) {
    if (row.session_status === 'FINISHED' || row.session_status === 'ABORTED') {
      if (discardAdjudicationTask(db, row.task_id)) discarded += 1;
    } else if (row.status !== 'pending') {
      if (resetAdjudicationTaskToPending(db, row.task_id)) reset += 1;
    }
  }
  return { reset, discarded };
}
