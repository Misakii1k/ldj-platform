import type { SqliteDatabase } from '../persistence/sqlite-database.js';
import { RoomCommandQueue } from './room-command-queue.js';

export type RoomCommandErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'STALE_CLIENT_STATE'
  | 'PERSISTENCE_FAILED';

export class RoomCommandError extends Error {
  readonly code: RoomCommandErrorCode;
  readonly recoverable: boolean;
  readonly currentSeq?: number;

  constructor(
    code: RoomCommandErrorCode,
    message: string,
    options: { recoverable: boolean; currentSeq?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'RoomCommandError';
    this.code = code;
    this.recoverable = options.recoverable;
    if (options.currentSeq !== undefined) {
      this.currentSeq = options.currentSeq;
    }
  }
}

export interface ExecuteRoomCommand<TResult> {
  roomId: string;
  actorScope: string;
  requestId: string;
  expectedSeq?: number;
  stateDependent?: boolean;
  now?: number;
  apply: (context: RoomCommandContext) => TResult;
}

export interface RoomCommandContext {
  database: SqliteDatabase;
  roomId: string;
  currentSeq: number;
  nextSeq: number;
  now: number;
}

export interface RoomCommandOutcome<TResult> {
  outcome: TResult;
  roomSeq: number;
  replayed: boolean;
}

interface RoomSequenceRow {
  seq: number;
}

interface ReceiptRow {
  room_seq: number;
  outcome_json: string;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value
  );
}

export class RoomCommandService {
  readonly #database: SqliteDatabase;
  readonly #queue: RoomCommandQueue;

  constructor(database: SqliteDatabase, queue = new RoomCommandQueue()) {
    this.#database = database;
    this.#queue = queue;
  }

  execute<TResult>(command: ExecuteRoomCommand<TResult>): Promise<RoomCommandOutcome<TResult>> {
    return this.#queue.enqueue(command.roomId, () => this.#executeTransaction(command));
  }

  waitForIdle(roomId?: string): Promise<void> {
    return this.#queue.waitForIdle(roomId);
  }

  #executeTransaction<TResult>(
    command: ExecuteRoomCommand<TResult>,
  ): RoomCommandOutcome<TResult> {
    try {
      return this.#database.transaction(() => {
        const receipt = this.#database.get<ReceiptRow>(
          `SELECT room_seq, outcome_json
             FROM command_receipts
            WHERE room_id = ? AND actor_scope = ? AND request_id = ?`,
          [command.roomId, command.actorScope, command.requestId],
        );

        if (receipt !== undefined) {
          return {
            outcome: JSON.parse(receipt.outcome_json) as TResult,
            roomSeq: receipt.room_seq,
            replayed: true,
          };
        }

        const room = this.#database.get<RoomSequenceRow>(
          'SELECT seq FROM rooms WHERE id = ?',
          [command.roomId],
        );
        if (room === undefined) {
          throw new RoomCommandError('ROOM_NOT_FOUND', 'Room does not exist', {
            recoverable: false,
          });
        }

        const stateDependent = command.stateDependent ?? command.expectedSeq !== undefined;
        if (
          stateDependent &&
          (command.expectedSeq === undefined || command.expectedSeq !== room.seq)
        ) {
          throw new RoomCommandError(
            'STALE_CLIENT_STATE',
            'Command was based on an out-of-date room state',
            { recoverable: true, currentSeq: room.seq },
          );
        }

        const now = command.now ?? Date.now();
        const nextSeq = room.seq + 1;
        const outcome = command.apply({
          database: this.#database,
          roomId: command.roomId,
          currentSeq: room.seq,
          nextSeq,
          now,
        });

        if (isPromiseLike(outcome)) {
          throw new TypeError('Room command apply callbacks must be synchronous');
        }

        const outcomeJson = JSON.stringify(outcome);
        if (outcomeJson === undefined) {
          throw new TypeError('Room command outcomes must be JSON serializable');
        }

        const update = this.#database.run(
          'UPDATE rooms SET seq = ?, updated_at = ? WHERE id = ? AND seq = ?',
          [nextSeq, now, command.roomId, room.seq],
        );
        if (Number(update.changes) !== 1) {
          throw new Error('Room sequence changed while applying a serialized command');
        }

        this.#database.run(
          `INSERT INTO command_receipts
             (room_id, actor_scope, request_id, room_seq, outcome_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            command.roomId,
            command.actorScope,
            command.requestId,
            nextSeq,
            outcomeJson,
            now,
          ],
        );

        return { outcome, roomSeq: nextSeq, replayed: false };
      });
    } catch (error) {
      if (error instanceof RoomCommandError) {
        throw error;
      }
      throw new RoomCommandError(
        'PERSISTENCE_FAILED',
        'Room command could not be persisted',
        { recoverable: true, cause: error },
      );
    }
  }
}
