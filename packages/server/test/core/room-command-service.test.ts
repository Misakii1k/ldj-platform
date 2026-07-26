import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RoomCommandService } from '../../src/core/room-command-service.js';
import { openDatabase } from '../../src/persistence/database.js';
import type { SqliteDatabase } from '../../src/persistence/sqlite-database.js';

let database: SqliteDatabase;
let service: RoomCommandService;

function insertRoom(id: string, code: string): void {
  database.run(
    `INSERT INTO rooms
      (id, code, status, config_json, seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, code, 'LOBBY', '{}', 0, 1, 1],
  );
}

beforeEach(() => {
  database = openDatabase(':memory:').database;
  service = new RoomCommandService(database);
  insertRoom('room-1', 'ROOM');
});

afterEach(() => {
  database.close();
});

describe('RoomCommandService', () => {
  it('serializes concurrent mutations and advances a durable sequence', async () => {
    const appliedAt: number[] = [];

    const commands = [0, 1, 2].map((index) =>
      service.execute({
        roomId: 'room-1',
        actorScope: `player-${index}`,
        requestId: `request-${index}`,
        stateDependent: false,
        now: 10 + index,
        apply: ({ currentSeq }) => {
          appliedAt.push(currentSeq);
          return { index };
        },
      }),
    );

    await expect(Promise.all(commands)).resolves.toEqual([
      { outcome: { index: 0 }, roomSeq: 1, replayed: false },
      { outcome: { index: 1 }, roomSeq: 2, replayed: false },
      { outcome: { index: 2 }, roomSeq: 3, replayed: false },
    ]);
    expect(appliedAt).toEqual([0, 1, 2]);
    expect(database.get<{ seq: number }>('SELECT seq FROM rooms WHERE id = ?', ['room-1']))
      .toEqual({ seq: 3 });
  });

  it('returns a persisted receipt without applying a duplicate request', async () => {
    let applyCount = 0;
    const command = {
      roomId: 'room-1',
      actorScope: 'player-1',
      requestId: 'same-request',
      expectedSeq: 0,
      now: 20,
      apply: () => {
        applyCount += 1;
        return { accepted: true };
      },
    };

    await expect(service.execute(command)).resolves.toEqual({
      outcome: { accepted: true },
      roomSeq: 1,
      replayed: false,
    });
    await expect(service.execute(command)).resolves.toEqual({
      outcome: { accepted: true },
      roomSeq: 1,
      replayed: true,
    });

    expect(applyCount).toBe(1);
    expect(database.get<{ count: number }>('SELECT count(*) AS count FROM command_receipts'))
      .toEqual({ count: 1 });
  });

  it('rejects stale state without changing sequence or writing a receipt', async () => {
    await service.execute({
      roomId: 'room-1',
      actorScope: 'player-1',
      requestId: 'first',
      expectedSeq: 0,
      apply: () => ({ accepted: true }),
    });

    const stale = service.execute({
      roomId: 'room-1',
      actorScope: 'player-2',
      requestId: 'stale',
      expectedSeq: 0,
      apply: () => ({ shouldNotRun: true }),
    });
    await expect(stale).rejects.toMatchObject({
      code: 'STALE_CLIENT_STATE',
      recoverable: true,
      currentSeq: 1,
    });

    expect(database.get<{ seq: number }>('SELECT seq FROM rooms WHERE id = ?', ['room-1']))
      .toEqual({ seq: 1 });
    expect(
      database.get('SELECT request_id FROM command_receipts WHERE request_id = ?', ['stale']),
    ).toBeUndefined();
  });

  it('rolls back partial writes and leaves the queue usable after failure', async () => {
    const failed = service.execute({
      roomId: 'room-1',
      actorScope: 'player-1',
      requestId: 'failed',
      expectedSeq: 0,
      apply: ({ database: transactionDatabase, now }) => {
        transactionDatabase.run(
          `INSERT INTO audit_log
            (room_id, actor_player_id, action, result, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          ['room-1', 'player-1', 'test', 'partial', now],
        );
        throw new Error('simulated reducer failure');
      },
    });

    await expect(failed).rejects.toMatchObject({
      code: 'PERSISTENCE_FAILED',
      recoverable: true,
    });
    expect(database.get<{ count: number }>('SELECT count(*) AS count FROM audit_log'))
      .toEqual({ count: 0 });
    expect(database.get<{ seq: number }>('SELECT seq FROM rooms WHERE id = ?', ['room-1']))
      .toEqual({ seq: 0 });

    await expect(
      service.execute({
        roomId: 'room-1',
        actorScope: 'player-1',
        requestId: 'retry',
        expectedSeq: 0,
        apply: () => ({ accepted: true }),
      }),
    ).resolves.toMatchObject({ roomSeq: 1, replayed: false });
  });
});
