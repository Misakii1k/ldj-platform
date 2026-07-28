/**
 * 计时器 runner（SPEC §5.8）：
 * 到期计时器转化为 system 动作，进入同一房间命令队列串行执行；
 * 触发即先标记 consumed（同事务），已取消/已消费不再生效；重复触发天然幂等。
 * 恢复场景（§10.4）：start() 会把 ACTIVE 会话的过期计时器按截止时间顺序补执行。
 */
import type { Db } from '../../persistence/db.ts';
import { CommandError, type RoomCommandExecutor, type TxContext } from '../executor.ts';
import { applySessionAction, type GameActionOutcome, type SessionRow } from './session.ts';

interface DueTimerRow {
  session_id: string;
  timer_id: string;
  room_id: string;
}

/** 单次 setTimeout 上限：即使无变更通知，也定期对表兜底 */
const MAX_ARM_DELAY_MS = 30_000;

/**
 * 在事务内消费一个到期计时器；竞态（已取消/已消费/会话已结束/未到期）时返回 null。
 * reduce 被拒（如迟到的旧计时器碰上阶段防御）也吞掉并保持 consumed，不得使房间队列崩溃。
 */
export function consumeDueTimer(
  tx: TxContext,
  sessionId: string,
  timerId: string,
): GameActionOutcome | null {
  const { db, now } = tx;
  const timer = db
    .prepare(
      `SELECT deadline_at, action_json, status FROM timers WHERE session_id = ? AND timer_id = ?`,
    )
    .get(sessionId, timerId) as
    | { deadline_at: number; action_json: string; status: string }
    | undefined;
  if (!timer || timer.status !== 'pending' || timer.deadline_at > now) return null;

  // 接受 ACTIVE 与 RECOVERING：恢复期（§10.4）需补执行到期计时器，
  // 其他状态（PREPARING/FINISHED/ABORTED）的会话计时器不被消费
  const session = db
    .prepare(`SELECT * FROM game_sessions WHERE id = ? AND status IN ('ACTIVE','RECOVERING')`)
    .get(sessionId) as SessionRow | undefined;
  if (!session) return null;

  db.prepare(`UPDATE timers SET status = 'consumed' WHERE session_id = ? AND timer_id = ?`).run(
    sessionId,
    timerId,
  );

  try {
    return applySessionAction(
      tx,
      session,
      { kind: 'system', source: 'timer' },
      JSON.parse(timer.action_json),
      null,
    );
  } catch (err) {
    // 系统动作被模块拒绝：视为无效计时器，只保留 consumed 标记；
    // 其他异常（如写库失败）必须抛出让事务回滚，不得提交部分状态（§8.7）
    if (err instanceof CommandError) return null;
    throw err;
  }
}

export class TimerRunner {
  readonly #db: Db;
  readonly #executor: RoomCommandExecutor;
  readonly #onOutcome: (roomId: string, outcome: GameActionOutcome) => void;
  #timeout: NodeJS.Timeout | null = null;
  #firing = false;
  #stopped = true;

  constructor(
    db: Db,
    executor: RoomCommandExecutor,
    onOutcome: (roomId: string, outcome: GameActionOutcome) => void,
  ) {
    this.#db = db;
    this.#executor = executor;
    this.#onOutcome = onOutcome;
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

  /** 任何命令写入 timers 表之后调用：立即重新对表 */
  notifyChanged(): void {
    if (!this.#stopped) this.#arm(0);
  }

  #arm(delayMs?: number): void {
    if (this.#stopped) return;
    if (this.#timeout) clearTimeout(this.#timeout);
    let delay = delayMs;
    if (delay === undefined) {
      const row = this.#db
        .prepare(
          `SELECT MIN(t.deadline_at) AS next
           FROM timers t JOIN game_sessions s ON s.id = t.session_id
           WHERE t.status = 'pending' AND s.status = 'ACTIVE'`,
        )
        .get() as { next: number | null } | undefined;
      delay = row?.next != null ? Math.max(0, row.next - Date.now()) : MAX_ARM_DELAY_MS;
    }
    this.#timeout = setTimeout(() => {
      void this.#fireDue();
    }, Math.min(delay, MAX_ARM_DELAY_MS));
    // 不阻止进程退出
    this.#timeout.unref?.();
  }

  /** 按截止时间顺序逐个补执行到期计时器；每个都独立入队 + 独立事务（§5.8） */
  async #fireDue(): Promise<void> {
    if (this.#firing) return;
    this.#firing = true;
    try {
      while (!this.#stopped) {
        const due = this.#db
          .prepare(
            `SELECT t.session_id, t.timer_id, s.room_id
             FROM timers t JOIN game_sessions s ON s.id = t.session_id
             WHERE t.status = 'pending' AND s.status = 'ACTIVE' AND t.deadline_at <= ?
             ORDER BY t.deadline_at ASC LIMIT 1`,
          )
          .get(Date.now()) as DueTimerRow | undefined;
        if (!due) break;
        const fired = await this.#executor.executeInternal({
          roomId: due.room_id,
          handler: (tx) => consumeDueTimer(tx, due.session_id, due.timer_id),
        });
        if (fired) this.#onOutcome(due.room_id, fired.outcome);
      }
    } finally {
      this.#firing = false;
      this.#arm();
    }
  }
}
