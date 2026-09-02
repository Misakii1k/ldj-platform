/**
 * E2E 数据库夹具：在服务端启动后的临时 DB 上直接插入「历史房间」，
 * 复刻 packages/server/tests/helpers/seedRoom.ts 的成熟模式
 * （房间 → 房主成员，绕过建房准入；后续 resume/join 全走真实 WS 链路）。
 * 游戏准入（availability !== 'playable'）只挡 create_room，seed 不受影响。
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function newRoomId(): string {
  return `room_${randomUUID()}`;
}

export function newPlayerId(): string {
  return `p_${randomUUID()}`;
}

export function newResumeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashResumeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(existing?: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(5);
    let code = '';
    for (const b of bytes) {
      code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
    }
    if (!existing || !existing(code)) return code;
  }
  throw new Error('E2E 房间码生成失败');
}

export interface SeededPlayer {
  playerId: string;
  resumeToken: string;
  seat: number;
}

export interface SeededRoom {
  roomId: string;
  roomCode: string;
  hostId: string;
  hostResumeToken: string;
  /** 与 players 数组对齐；第 0 位是房主 */
  players: SeededPlayer[];
}

export interface SeedOptions {
  gameId?: string;
  count?: number;
  nickname?: string;
  ready?: boolean;
  /** 建房时携带的 gameConfig（含 rulesetId）；开局时由模块 parseConfig 校验 */
  config?: Record<string, unknown>;
}

/**
 * 向已由服务端迁移好的 DB 写入一间 LOBBY 房间 + count 名玩家（第 1 位房主，全 CONNECTED）。
 * 调用方负责：服务端已就绪（/health/live 通过）、DB 文件存在。
 */
export function seedRoom(dbPath: string, options: SeedOptions = {}): SeededRoom {
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    const now = Date.now();
    const count = Math.max(1, options.count ?? 1);
    const roomId = newRoomId();
    const roomCode = newRoomCode((code) =>
      Boolean(db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)),
    );
    const players: SeededPlayer[] = [];
    for (let seat = 1; seat <= count; seat += 1) {
      players.push({ playerId: newPlayerId(), resumeToken: newResumeToken(), seat });
    }
    const hostId = players[0]!.playerId;

    const configJson = JSON.stringify({
      gameConfig: options.config ?? {},
    });
    const ready = options.ready === true ? 1 : 0;

    db.prepare(
      `INSERT INTO rooms
         (id, code, status, host_player_id, game_id, config_json, password_hash, seq, created_at, updated_at, empty_since)
       VALUES (?, ?, 'LOBBY', ?, ?, ?, NULL, 1, ?, ?, NULL)`,
    ).run(roomId, roomCode, hostId, options.gameId ?? 'undercover', configJson, now, now);

    for (const player of players) {
      db.prepare(
        `INSERT INTO room_members
           (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status,
            resume_token_hash, reserved_until, joined_at, is_bot, bot_kind, ready)
         VALUES (?, ?, NULL, ?, 'player', ?, 'CONNECTED', ?, NULL, ?, 0, NULL, ?)`,
      ).run(
        roomId,
        player.playerId,
        player.seat === 1 ? (options.nickname ?? '房主') : `玩家${player.seat}`,
        player.seat,
        hashResumeToken(player.resumeToken),
        now,
        ready,
      );
    }

    return {
      roomId,
      roomCode,
      hostId,
      hostResumeToken: players[0]!.resumeToken,
      players,
    };
  } finally {
    db.close();
  }
}
