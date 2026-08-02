import type { Db } from '../../src/persistence/db.ts';
import {
  hashResumeToken,
  hashRoomPassword,
  newPlayerId,
  newResumeToken,
  newRoomCode,
  newRoomId,
} from '../../src/core/ids.ts';

export interface SeedRoomOptions {
  nickname?: string;
  gameId?: string;
  password?: string;
  ready?: boolean;
  config?: Record<string, unknown>;
}

export interface SeededRoom {
  roomId: string;
  roomCode: string;
  hostId: string;
  hostResumeToken: string;
}

function unusedRoomCode(db: Db): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = newRoomCode();
    if (!db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(roomCode)) return roomCode;
  }
  throw new Error('测试房间码生成失败');
}

/**
 * 为 executor/session/gateway 测试写入一间符合当前迁移 schema 的历史房间。
 * 该夹具刻意绕过生产 create_room 准入，但后续行为仍走真实服务端链路。
 */
export function seedRoom(db: Db, options: SeedRoomOptions = {}): SeededRoom {
  const now = Date.now();
  const roomId = newRoomId();
  const roomCode = unusedRoomCode(db);
  const hostId = newPlayerId();
  const hostResumeToken = newResumeToken();
  const configJson = JSON.stringify(options.config ?? { gameConfig: {} });
  const passwordHash = options.password === undefined ? null : hashRoomPassword(options.password);

  db.prepare(
    `INSERT INTO rooms
       (id, code, status, host_player_id, game_id, config_json, password_hash, seq, created_at, updated_at, empty_since)
     VALUES (?, ?, 'LOBBY', ?, ?, ?, ?, 1, ?, ?, NULL)`,
  ).run(
    roomId,
    roomCode,
    hostId,
    options.gameId ?? 'undercover',
    configJson,
    passwordHash,
    now,
    now,
  );

  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status,
        resume_token_hash, reserved_until, joined_at, is_bot, bot_kind, ready)
     VALUES (?, ?, NULL, ?, 'player', 1, 'CONNECTED', ?, NULL, ?, 0, NULL, ?)`,
  ).run(
    roomId,
    hostId,
    options.nickname ?? '房主',
    hashResumeToken(hostResumeToken),
    now,
    options.ready === true ? 1 : 0,
  );

  return { roomId, roomCode, hostId, hostResumeToken };
}
