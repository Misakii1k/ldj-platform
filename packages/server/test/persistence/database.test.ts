import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../../src/persistence/database.js';
import { discoverMigrations, runMigrations } from '../../src/persistence/migrations.js';
import { SqliteDatabase } from '../../src/persistence/sqlite-database.js';

const temporaryDirectories: string[] = [];
const openDatabases: SqliteDatabase[] = [];

function createFileDatabase(): { database: SqliteDatabase; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'lan-party-sqlite-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'platform.sqlite');
  const result = openDatabase(path);
  openDatabases.push(result.database);
  return { database: result.database, path };
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('SQLite persistence boundary', () => {
  it('enables durability pragmas and creates the ten logical tables', () => {
    const { database } = createFileDatabase();

    expect(database.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
    expect(database.get<{ journal_mode: string }>('PRAGMA journal_mode')).toEqual({
      journal_mode: 'wal',
    });

    const tables = database
      .all<{ name: string }>(
        `SELECT name FROM sqlite_schema
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .map((row) => row.name);

    expect(tables).toEqual([
      'audit_log',
      'chat_messages',
      'command_receipts',
      'game_events',
      'game_results',
      'game_sessions',
      'room_members',
      'rooms',
      'schema_migrations',
      'timers',
    ]);

    const indexes = database
      .all<{ name: string }>(
        `SELECT name FROM sqlite_schema
          WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`,
      )
      .map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'game_sessions_one_active_per_room',
        'game_events_session_seq',
        'chat_messages_room_cursor',
        'timers_pending_deadline',
      ]),
    );
  });

  it('runs migrations only once and reports the current version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lan-party-sqlite-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'platform.sqlite');

    const first = openDatabase(path);
    expect(first.migrations).toEqual({ appliedVersions: [1, 2], currentVersion: 2 });
    first.database.close();

    const second = openDatabase(path);
    openDatabases.push(second.database);
    expect(second.migrations).toEqual({ appliedVersions: [], currentVersion: 2 });
  });

  it('enforces foreign keys and rolls back failed transactions', () => {
    const { database } = createFileDatabase();

    expect(() =>
      database.run(
        `INSERT INTO room_members
          (room_id, player_id, identity_id, nickname, seat_role, seat,
           resume_token_hash, reserved_until, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['missing', 'p1', 'i1', '玩家', 'player', 0, 'hash', null, 1],
      ),
    ).toThrow();

    expect(() =>
      database.transaction(() => {
        database.run(
          `INSERT INTO rooms
            (id, code, status, config_json, seq, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['room-1', 'ABCD', 'LOBBY', '{}', 0, 1, 1],
        );
        throw new Error('simulated failure');
      }),
    ).toThrow('simulated failure');

    expect(database.get('SELECT id FROM rooms WHERE id = ?', ['room-1'])).toBeUndefined();
    expect(() => database.assertIntegrity()).not.toThrow();
  });

  it('supports nested transactions with savepoints', () => {
    const { database } = createFileDatabase();

    database.transaction(() => {
      database.run(
        `INSERT INTO rooms
          (id, code, status, config_json, seq, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['room-outer', 'OUTR', 'LOBBY', '{}', 0, 1, 1],
      );

      expect(() =>
        database.transaction(() => {
          database.run(
            `INSERT INTO rooms
              (id, code, status, config_json, seq, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['room-inner', 'INNR', 'LOBBY', '{}', 0, 1, 1],
          );
          throw new Error('rollback savepoint');
        }),
      ).toThrow('rollback savepoint');
    });

    expect(database.get('SELECT id FROM rooms WHERE id = ?', ['room-outer'])).toBeDefined();
    expect(database.get('SELECT id FROM rooms WHERE id = ?', ['room-inner'])).toBeUndefined();
  });

  it('enforces active-session uniqueness and the 300-character chat limit', () => {
    const { database } = createFileDatabase();
    database.run(
      `INSERT INTO rooms
        (id, code, status, config_json, seq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['room-1', 'RULE', 'LOBBY', '{}', 0, 1, 1],
    );
    database.run(
      `INSERT INTO game_sessions
        (id, room_id, module_id, module_version, state_schema_version, status,
         snapshot_json, seed, rng_state_json, last_seq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['session-1', 'room-1', 'undercover', '1.0.0', 1, 'PREPARING', '{}', 'seed', '{}', 0, 1, 1],
    );

    expect(() =>
      database.run(
        `INSERT INTO game_sessions
          (id, room_id, module_id, module_version, state_schema_version, status,
           snapshot_json, seed, rng_state_json, last_seq, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['session-2', 'room-1', 'undercover', '1.0.0', 1, 'ACTIVE', '{}', 'seed', '{}', 0, 1, 1],
      ),
    ).toThrow();

    database.run(
      `INSERT INTO chat_messages
        (room_id, session_id, from_player_id, kind, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['room-1', 'session-1', 'player-1', 'user', '字'.repeat(300), 1],
    );
    expect(() =>
      database.run(
        `INSERT INTO chat_messages
          (room_id, session_id, from_player_id, kind, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['room-1', 'session-1', 'player-1', 'user', '字'.repeat(301), 1],
      ),
    ).toThrow();
  });

  it('migrates legacy chat kinds and never reuses a deleted cursor', () => {
    const database = SqliteDatabase.open(':memory:');
    openDatabases.push(database);
    const migrations = discoverMigrations();
    expect(runMigrations(database, migrations.slice(0, 1), 1)).toEqual({
      appliedVersions: [1],
      currentVersion: 1,
    });

    database.run(
      `INSERT INTO rooms
        (id, code, status, config_json, seq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['legacy-room', 'LEGC', 'LOBBY', '{}', 0, 1, 1],
    );
    const legacy = database.run(
      `INSERT INTO chat_messages
        (room_id, from_player_id, kind, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['legacy-room', 'player-1', 'player', '旧消息', 1],
    );

    expect(runMigrations(database, migrations, 2)).toEqual({
      appliedVersions: [2],
      currentVersion: 2,
    });
    expect(database.get<{ id: number; kind: string }>(
      'SELECT id, kind FROM chat_messages',
    )).toEqual({ id: Number(legacy.lastInsertRowid), kind: 'user' });

    const deletedCursor = Number(legacy.lastInsertRowid);
    database.run('DELETE FROM chat_messages WHERE id = ?', [deletedCursor]);
    const inserted = database.run(
      `INSERT INTO chat_messages
        (room_id, from_player_id, kind, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['legacy-room', 'player-1', 'user', '新消息', 3],
    );
    expect(Number(inserted.lastInsertRowid)).toBeGreaterThan(deletedCursor);
    expect(() =>
      database.run(
        `INSERT INTO chat_messages
          (room_id, from_player_id, kind, text, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['legacy-room', 'player-1', 'player', '旧 kind', 4],
      ),
    ).toThrow();
  });
});
