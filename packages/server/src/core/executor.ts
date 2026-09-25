/**
 * 命令执行链（SPEC §8.7）：
 * 校验（调用方完成）→ 入队 → 事务（含 seq 递增与幂等回执）→ ack → 广播（调用方完成）。
 * 事务提交成功前不得返回成功结果（先提交后确认）。
 */
import type { ErrorCode } from '@ldj/shared';
import type { Db } from '../persistence/db.ts';
import { withTransaction } from '../persistence/db.ts';
import { RoomQueues } from './queue.ts';

/** 带稳定错误码的命令错误；message 面向用户 */
export class CommandError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CommandError';
    this.code = code;
  }
}

export interface TxContext {
  db: Db;
  /** 命令时间：由内核注入的服务端时间 */
  now: number;
  /** 本次命令提交后的房间序号 */
  roomSeq: number;
}

export interface ExecuteResult<T> {
  roomSeq: number;
  outcome: T;
  /** true 表示命中幂等回执，返回的是第一次执行的结果 */
  replayed: boolean;
}

interface ReceiptRow {
  room_seq: number;
  outcome_json: string;
}

export class RoomCommandExecutor {
  readonly #db: Db;
  readonly #queues: RoomQueues;
  readonly #postCommit: ((roomId: string, outcome: unknown) => void) | undefined;

  constructor(
    db: Db,
    queues: RoomQueues = new RoomQueues(),
    postCommit?: (roomId: string, outcome: unknown) => void,
  ) {
    this.#db = db;
    this.#queues = queues;
    this.#postCommit = postCommit;
  }

  /**
   * 事务提交后的尽力而为回调（D4-A1）：外部裁判任务在房间事务提交后落库，
   * 绝不参与房间事务。回调抛错被吞掉，不影响已提交的命令结果
   * （任务创建失败不影响已提交房间事务，状态 errored 可重试）。
   */
  #runPostCommit(roomId: string, outcome: unknown): void {
    if (!this.#postCommit) return;
    try {
      this.#postCommit(roomId, outcome);
    } catch {
      // post-commit 失败不影响已提交事务
    }
  }

  /**
   * 在已存在房间上执行命令。
   * handler 在事务内执行；返回值序列化进幂等回执（不得含秘密数据）。
   * bumpSeq=false 用于聊天等不推动 roomSeq 的命令（§9.1），仍落幂等回执。
   */
  async executeOnRoom<T>(opts: {
    roomId: string;
    actorScope: string;
    requestId: string;
    bumpSeq?: boolean;
    /**
     * 幂等回执的安全投影。首次调用仍返回完整 outcome；重复 requestId 只需要恢复 ACK 所需字段，
     * 因此秘密事件等仅供首次提交后定向广播的数据必须在这里移除。
     */
    receiptOutcome?: (outcome: T) => T;
    handler: (tx: TxContext) => T;
  }): Promise<ExecuteResult<T>> {
    const db = this.#db;
    const bumpSeq = opts.bumpSeq ?? true;
    return this.#queues.enqueue(opts.roomId, () => {
      // 幂等：同一 (room, actor, requestId) 直接返回第一次的结果（SEC-007、§9.4）
      const receipt = db
        .prepare(
          'SELECT room_seq, outcome_json FROM command_receipts WHERE room_id = ? AND actor_scope = ? AND request_id = ?',
        )
        .get(opts.roomId, opts.actorScope, opts.requestId) as ReceiptRow | undefined;
      if (receipt) {
        return {
          roomSeq: receipt.room_seq,
          outcome: JSON.parse(receipt.outcome_json) as T,
          replayed: true,
        };
      }

      const room = db.prepare('SELECT seq, status FROM rooms WHERE id = ?').get(opts.roomId) as
        | { seq: number; status: string }
        | undefined;
      if (!room) throw new CommandError('ROOM_NOT_FOUND');
      if (room.status === 'CLOSED') throw new CommandError('ROOM_CLOSED');

      const now = Date.now();
      const roomSeq = bumpSeq ? room.seq + 1 : room.seq;
      const outcome = withTransaction(db, () => {
        const result = opts.handler({ db, now, roomSeq });
        if (bumpSeq) {
          db.prepare('UPDATE rooms SET seq = ?, updated_at = ? WHERE id = ?').run(
            roomSeq,
            now,
            opts.roomId,
          );
        }
        const receiptOutcome = opts.receiptOutcome?.(result) ?? result;
        db.prepare(
          'INSERT INTO command_receipts (room_id, actor_scope, request_id, room_seq, outcome_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          opts.roomId,
          opts.actorScope,
          opts.requestId,
          roomSeq,
          JSON.stringify(receiptOutcome ?? null),
          now,
        );
        return result;
      });
      this.#runPostCommit(opts.roomId, outcome);
      return { roomSeq, outcome, replayed: false };
    });
  }

  /**
   * 内部系统命令（断线标记、房主自动转让等）：无客户端 requestId，
   * 不走幂等回执；仍入队串行 + 事务 + seq 递增。
   * handler 返回 null 表示无需变更（不推进 seq，不提交写入）。
   */
  async executeInternal<T>(opts: {
    roomId: string;
    now?: number;
    handler: (tx: TxContext) => T | null;
  }): Promise<{ roomSeq: number; outcome: T } | null> {
    const db = this.#db;
    return this.#queues.enqueue(opts.roomId, () => {
      const room = db.prepare('SELECT seq, status FROM rooms WHERE id = ?').get(opts.roomId) as
        | { seq: number; status: string }
        | undefined;
      if (!room || room.status === 'CLOSED') return null;

      const now = opts.now ?? Date.now();
      const roomSeq = room.seq + 1;
      let applied = false;
      const outcome = withTransaction(db, () => {
        const result = opts.handler({ db, now, roomSeq });
        if (result === null) return null;
        applied = true;
        db.prepare('UPDATE rooms SET seq = ?, updated_at = ? WHERE id = ?').run(
          roomSeq,
          now,
          opts.roomId,
        );
        return result;
      });
      if (applied && outcome !== null) {
        this.#runPostCommit(opts.roomId, outcome);
        return { roomSeq, outcome };
      }
      return null;
    });
  }

  /**
   * 创建类命令：房间在 handler 内诞生（seq 从 1 开始），回执写入新房间。
   * 创建前无房间可查回执，重试语义由客户端负责（M2 细化）。
   */
  async executeCreate<T>(opts: {
    roomId: string;
    actorScope: string;
    requestId: string;
    handler: (tx: TxContext) => T;
  }): Promise<ExecuteResult<T>> {
    const db = this.#db;
    return this.#queues.enqueue(opts.roomId, () => {
      const now = Date.now();
      const roomSeq = 1;
      const outcome = withTransaction(db, () => {
        const result = opts.handler({ db, now, roomSeq });
        db.prepare(
          'INSERT INTO command_receipts (room_id, actor_scope, request_id, room_seq, outcome_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(opts.roomId, opts.actorScope, opts.requestId, roomSeq, JSON.stringify(result ?? null), now);
        return result;
      });
      return { roomSeq, outcome, replayed: false };
    });
  }
}
