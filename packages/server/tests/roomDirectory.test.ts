import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';

function testConfig(): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    publicBaseUrl: null,
    logLevel: 'error',
    allowedOrigins: [],
    allowPrivateLlmUpstream: false,
    llm: { provider: 'openai', baseUrl: null, apiKey: null, model: 'test-model', thinkingDepth: 'off', timeoutMs: 5000 },
    adminToken: null,
  };
}

async function startApp(): Promise<App> {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(testConfig(), logger);
  await app.listen();
  return app;
}

interface RoomSeed {
  id: string;
  code: string;
  status: 'LOBBY' | 'IN_GAME' | 'POST_GAME' | 'CLOSED';
  updatedAt: number;
  passwordHash?: string | null;
  gameId?: string;
}

function insertRoom(app: App, seed: RoomSeed): void {
  app.db
    .prepare(
      "INSERT INTO rooms (id, code, status, host_player_id, game_id, config_json, password_hash, seq, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, '{}', ?, 0, ?, ?)",
    )
    .run(
      seed.id,
      seed.code,
      seed.status,
      seed.gameId ?? 'undercover',
      seed.passwordHash ?? null,
      seed.updatedAt,
      seed.updatedAt,
    );
}

function insertMember(
  app: App,
  roomId: string,
  playerId: string,
  seatRole: 'player' | 'spectator',
  connectionStatus: 'CONNECTED' | 'DISCONNECTED_RESERVED' | 'EXPIRED' | 'KICKED',
  seat: number | null,
  nickname: string,
): void {
  app.db
    .prepare(
      "INSERT INTO room_members (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status, resume_token_hash, reserved_until, joined_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 'not-a-secret-for-this-test', NULL, ?)",
    )
    .run(roomId, playerId, nickname, seatRole, seat, connectionStatus, Date.now());
}

async function getRooms(app: App): Promise<{ rooms: Array<Record<string, unknown>> }> {
  const response = await fetch('http://127.0.0.1:' + app.port() + '/api/rooms');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  return (await response.json()) as { rooms: Array<Record<string, unknown>> };
}

test('GET /api/rooms lists only open rooms with aggregate public fields', async () => {
  const app = await startApp();
  try {
    insertRoom(app, {
      id: 'room-open-lobby',
      code: 'OPEN1',
      status: 'LOBBY',
      passwordHash: 'hashed-password-never-exposed',
      updatedAt: 200,
    });
    insertMember(app, 'room-open-lobby', 'player-secret-1', 'player', 'CONNECTED', 1, 'secret-nickname-1');
    insertMember(app, 'room-open-lobby', 'player-secret-2', 'player', 'CONNECTED', 2, 'secret-nickname-2');
    insertMember(app, 'room-open-lobby', 'spectator-secret', 'spectator', 'CONNECTED', null, 'secret-spectator');
    insertMember(app, 'room-open-lobby', 'kicked-secret', 'player', 'KICKED', 3, 'kicked-nickname');
    insertMember(app, 'room-open-lobby', 'expired-secret', 'player', 'EXPIRED', 4, 'expired-nickname');

    insertRoom(app, {
      id: 'room-open-game',
      code: 'OPEN2',
      status: 'IN_GAME',
      updatedAt: 100,
    });
    insertMember(app, 'room-open-game', 'reserved-player', 'player', 'DISCONNECTED_RESERVED', 1, 'reserved-nickname');
    insertMember(app, 'room-open-game', 'live-spectator', 'spectator', 'CONNECTED', null, 'live-spectator-nickname');

    insertRoom(app, { id: 'room-post-game', code: 'POST1', status: 'POST_GAME', updatedAt: 300 });
    insertRoom(app, { id: 'room-closed', code: 'CLOSE', status: 'CLOSED', updatedAt: 400 });
    insertRoom(app, {
      id: 'room-removed-game',
      code: 'OLD01',
      status: 'LOBBY',
      gameId: 'removed-game',
      updatedAt: 500,
    });

    const body = await getRooms(app);
    assert.deepEqual(
      body.rooms.map((room) => room.roomCode),
      ['OPEN1', 'OPEN2'],
    );

    const lobby = body.rooms.find((room) => room.roomCode === 'OPEN1');
    assert.deepEqual(lobby, {
      roomCode: 'OPEN1',
      gameId: 'undercover',
      gameName: '\u8c01\u662f\u5367\u5e95',
      status: 'LOBBY',
      playerCount: 2,
      maxPlayers: 12,
      spectatorCount: 1,
      requiresPassword: true,
      updatedAt: 200,
    });

    const inGame = body.rooms.find((room) => room.roomCode === 'OPEN2');
    assert.deepEqual(inGame, {
      roomCode: 'OPEN2',
      gameId: 'undercover',
      gameName: '\u8c01\u662f\u5367\u5e95',
      status: 'IN_GAME',
      playerCount: 1,
      maxPlayers: 12,
      spectatorCount: 1,
      requiresPassword: false,
      updatedAt: 100,
    });

    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /secret-nickname|player-secret|hashed-password/);
    for (const room of body.rooms) {
      assert.deepEqual(Object.keys(room).sort(), [
        'gameId',
        'gameName',
        'maxPlayers',
        'playerCount',
        'requiresPassword',
        'roomCode',
        'spectatorCount',
        'status',
        'updatedAt',
      ]);
      assert.equal(typeof room.requiresPassword, 'boolean');
    }
  } finally {
    await app.shutdown();
  }
});

test('GET /api/rooms returns an empty array when there are no open rooms', async () => {
  const app = await startApp();
  try {
    assert.deepEqual(await getRooms(app), { rooms: [] });
  } finally {
    await app.shutdown();
  }
});
