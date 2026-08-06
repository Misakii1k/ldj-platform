/**
 * D4-A1：外部裁判任务队列（runner 模型，仿 TimerRunner）。
 * 轮询 adjudication_tasks 的 pending/errored 任务 → 标记 running → 经注入的
 * dispatchTask 调用外部裁判（模型）→ 结果按 task_id exactly-once 回灌。
 *
 * 独立队列：任务轮询/调度（含慢模型调用）不占用房间事务队列（executor 的
 * RoomQueues）；只有结果回灌本身经 executor.executeInternal 进入对应房间的
 * 串行事务链，以 system 动作 external_task_result 由模块 reducer 应用。
 */
import { isAdjudicationTaskEffect, type AdjudicationTaskEffect } from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import { withTransaction } from '../../persistence/db.ts';
import { type RoomCommandExecutor } from '../executor.ts';
import { getSessionGameModule, type RegisteredGameModule } from '../game/registry.ts';
import { applyExternalTaskResult, type SessionRow } from '../game/session.ts';
import {
  claimAdjudicationTask,
  completeAdjudicationTask,
  createAdjudicationTask,
  discardAdjudicationTask,
  getAdjudicationTask,
  markAdjudicationTaskErrored,
  nextPendingAdjudicationTask,
  type AdjudicationTask,
} from './taskStore.ts';

/** 单次轮询间隔上限：即使无变更通知，也定期对表兜底 */
const MAX_POLL_INTERVAL_MS = 30_000;

export interface AdjudicationTaskQueueOptions {
  db: Db;
  executor: RoomCommandExecutor;
  /** 外部裁判调用（模型）；返回原始裁判结果。测试注入可编程替身。 */
  dispatchTask: (task: AdjudicationTask) => Promise<unknown>;
  /** 会话 → 模块解析；默认走注册表（D4-B 注册白板规则集后生效）。 */
  resolveModule?: (session: SessionRow) => RegisteredGameModule | undefined;
  onOutcome?: (roomId: string, outcome: unknown) => void;
  onError?: (message: string, extra?: Record<string, unknown>) => void;
}

/** 从已提交的房间命令 outcome 中提取外部裁判任务 effect。 */
export function extractAdjudicationEffects(outcome: unknown): AdjudicationTaskEffect[] {
  if (typeof outcome !== 'object' || outcome === null) return [];
  const value = (outcome as { adjudicationEffects?: unknown }).adjudicationEffects;
  if (!Array.isArray(value)) return [];
  return value.filter(isAdjudicationTaskEffect);
}

/**
 * D4-B T4：重放"未应用"的外部裁判结果（at-most-once 防御）。
 * 崩溃窗口（complete 落库之后、external_task_result 注入事件流水之前）里结果已
 * done 但从未进入房间串行事务链的任务，在启动恢复后补注入一次。
 * 幂等：同一 taskId 的 external_task_result 事件已存在则跳过，绝不对 reducer
 * 产生重复副作用；恢复不调用任何 provider（只消费已落库的 result_json）。
 */
export async function replayUnappliedAdjudicationResults(
  db: Db,
  executor: RoomCommandExecutor,
  resolveModule: (session: SessionRow) => RegisteredGameModule | undefined = getSessionGameModule,
  onOutcome?: (roomId: string, outcome: unknown) => void,
  onError?: (message: string, extra?: Record<string, unknown>) => void,
): Promise<number> {
  const rows = db.prepare(
    `SELECT t.task_id, t.session_id, t.result_json, t.submitted_at_seq, s.room_id
     FROM adjudication_tasks t
     JOIN game_sessions s ON s.id = t.session_id
     WHERE t.status = 'done' AND t.result_json IS NOT NULL
       AND s.status IN ('ACTIVE','RECOVERING')`,
  ).all() as {
    task_id: string;
    session_id: string;
    result_json: string;
    submitted_at_seq: number;
    room_id: string;
  }[];
  let replayed = 0;
  for (const row of rows) {
    const alreadyApplied = db.prepare(
      `SELECT 1 FROM game_events
       WHERE session_id = ? AND json_extract(action_json, '$.type') = 'external_task_result'
         AND json_extract(action_json, '$.taskId') = ?
       LIMIT 1`,
    ).get(row.session_id, row.task_id);
    if (alreadyApplied) continue;
    try {
      const outcome = await executor.executeInternal({
        roomId: row.room_id,
        handler: (tx) =>
          applyExternalTaskResult(
            tx,
            row.session_id,
            row.task_id,
            row.submitted_at_seq,
            JSON.parse(row.result_json),
            resolveModule,
          ),
      });
      if (outcome) {
        replayed += 1;
        onOutcome?.(row.room_id, outcome.outcome);
      }
    } catch (err) {
      // 单个任务注入失败不阻断其余任务；由 onError 记录，主模型可在 P6 复核。
      onError?.(`外部裁判未应用结果补注入失败：${String(err)}`, { taskId: row.task_id });
    }
  }
  return replayed;
}

export class AdjudicationTaskQueue {
  readonly #db: Db;
  readonly #executor: RoomCommandExecutor;
  readonly #dispatchTask: (task: AdjudicationTask) => Promise<unknown>;
  readonly #resolveModule: (session: SessionRow) => RegisteredGameModule | undefined;
  readonly #onOutcome?: (roomId: string, outcome: unknown) => void;
  readonly #onError?: (message: string, extra?: Record<string, unknown>) => void;
  #timeout: NodeJS.Timeout | null = null;
  #firing = false;
  #stopped = true;

  constructor(options: AdjudicationTaskQueueOptions) {
    this.#db = options.db;
    this.#executor = options.executor;
    this.#dispatchTask = options.dispatchTask;
    this.#resolveModule = options.resolveModule ?? getSessionGameModule;
    this.#onOutcome = options.onOutcome;
    this.#onError = options.onError;
  }

  start(): void {
    this.#stopped = false;
    this.#arm(0);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timeout) clearTimeout(this.#timeout);
    this.#timeout = null;
  }

  /** 任何 adjudication_tasks 写入后调用：立即重新对表 */
  notifyChanged(): void {
    if (!this.#stopped) this.#arm(0);
  }

  /**
   * post-commit 调度入口（executor 提交后回调）：把 outcome 中的
   * enqueue_adjudication 效果落库。任务创建失败不影响已提交的房间事务，
   * 失败经 onError 记录（状态 errored 可重试由后续轮询/恢复处理）。
   */
  handleCommitted(roomId: string, outcome: unknown): void {
    const effects = extractAdjudicationEffects(outcome);
    if (effects.length === 0) return;
    let created = 0;
    for (const effect of effects) {
      try {
        createAdjudicationTask(this.#db, effect);
        created += 1;
      } catch (err) {
        this.#onError?.(`外部裁判任务落库失败：${String(err)}`, { taskId: effect.taskId });
      }
    }
    if (created > 0) this.notifyChanged();
  }

  #arm(delayMs?: number): void {
    if (this.#stopped) return;
    if (this.#timeout) clearTimeout(this.#timeout);
    let delay = delayMs;
    if (delay === undefined) delay = MAX_POLL_INTERVAL_MS;
    this.#timeout = setTimeout(() => {
      void this.#fire();
    }, Math.min(delay, MAX_POLL_INTERVAL_MS));
    // 不阻止进程退出
    this.#timeout.unref?.();
  }

  /** 逐任务串行轮询：每个任务独立认领 + 调度 + 回灌（§A1 生命周期） */
  async #fire(): Promise<void> {
    if (this.#firing) return;
    this.#firing = true;
    try {
      while (!this.#stopped) {
        const task = nextPendingAdjudicationTask(this.#db);
        if (!task) break;
        await this.#runTask(task);
      }
    } finally {
      this.#firing = false;
      this.#arm();
    }
  }

  async #runTask(task: AdjudicationTask): Promise<void> {
    // 认领：pending/errored → running（数据库层 exactly-once，防重复调度）
    const claimed = withTransaction(this.#db, () => claimAdjudicationTask(this.#db, task.taskId));
    if (!claimed) return;

    let result: unknown;
    try {
      result = await this.#dispatchTask(task);
    } catch (err) {
      // 模型调用失败：标记 errored，下一轮或重启后可重试
      withTransaction(this.#db, () => markAdjudicationTaskErrored(this.#db, task.taskId));
      this.#onError?.(`外部裁判调用失败：${String(err)}`, { taskId: task.taskId });
      return;
    }
    await this.applyTaskResult(task.taskId, result);
  }

  /**
   * 结果回灌（exactly-once）：
   * 1. 事务内：任务已 done/discarded → 丢弃；会话已结算（FINISHED/ABORTED）→
   *    标记 discarded；否则 pending/running → done 并落库结果、擦除明文输入。
   * 2. 提交后：经房间串行事务链以 system 动作 external_task_result 进入，
   *    由模块 reducer 应用 —— 外部任务绝不直接修改权威状态。
   */
  async applyTaskResult(taskId: string, result: unknown): Promise<void> {
    const claim = withTransaction(this.#db, () => {
      const task = getAdjudicationTask(this.#db, taskId);
      if (!task) return { applied: false } as const;
      if (task.status === 'done' || task.status === 'discarded') {
        return { applied: false } as const;
      }
      const session = this.#db
        .prepare('SELECT status, room_id FROM game_sessions WHERE id = ?')
        .get(task.sessionId) as { status: string; room_id: string } | undefined;
      if (!session || session.status === 'FINISHED' || session.status === 'ABORTED') {
        // 已结算会话的迟到结果：丢弃（不回灌）
        discardAdjudicationTask(this.#db, taskId);
        return { applied: false } as const;
      }
      completeAdjudicationTask(this.#db, taskId, JSON.stringify(result));
      return {
        applied: true,
        roomId: session.room_id,
        sessionId: task.sessionId,
        submittedAtSeq: task.submittedAtSeq,
      } as const;
    });
    if (!claim.applied) return;

    try {
      const outcome = await this.#executor.executeInternal({
        roomId: claim.roomId,
        handler: (tx) =>
          applyExternalTaskResult(tx, claim.sessionId, taskId, claim.submittedAtSeq, result, this.#resolveModule),
      });
      if (outcome) this.#onOutcome?.(claim.roomId, outcome.outcome);
    } catch (err) {
      // 结果已落库（done）；回灌失败不再重试（at-most-once，防重复回灌）。
      this.#onError?.(`外部裁判结果回灌失败：${String(err)}`, { taskId });
    }
  }
}
