/**
 * 房间公开快照构造（room_snapshot）。
 * 白名单式构造：只放入公开字段，绝不携带凭证哈希或密码哈希（SEC-003）。
 */
import type {
  RoomSnapshotView,
  RoomMemberView,
  RoomStatus,
  SeatRole,
  MemberConnectionStatus,
} from '@ldj/shared';
import { DEFAULT_PLAYABLE_GAME_ID, getGameCatalogEntry } from '@ldj/shared';
import type { Db } from '../persistence/db.ts';

export interface PublicRoomSummary {
  roomCode: string;
  gameId: string;
  gameName: string;
  status: 'LOBBY' | 'IN_GAME';
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  requiresPassword: boolean;
  updatedAt: number;
}

interface RoomRow {
  code: string;
  status: string;
  seq: number;
  game_id: string | null;
  config_json: string;
  host_player_id: string | null;
}

interface MemberRow {
  player_id: string;
  nickname: string;
  seat_role: string;
  seat: number | null;
  connection_status: string;
  is_bot: number;
  bot_kind: string | null;
  ready: number;
}

interface PublicRoomRow {
  room_code: string;
  game_id: string | null;
  status: 'LOBBY' | 'IN_GAME';
  player_count: number;
  spectator_count: number;
  requires_password: number;
  updated_at: number;
}

const ACTIVE_MEMBER_STATUSES = "('CONNECTED', 'DISCONNECTED_RESERVED')";

/**
 * Return only the aggregate, non-sensitive fields needed by the LAN lobby.
 * Active reservations remain counted while expired and kicked members do not.
 */
export function listOpenRoomSummaries(db: Db): PublicRoomSummary[] {
  const rows = db
    .prepare(
      `SELECT
         r.code AS room_code,
         r.game_id AS game_id,
         r.status AS status,
         COUNT(CASE WHEN m.seat_role = 'player'
                    AND m.connection_status IN ${ACTIVE_MEMBER_STATUSES} THEN 1 END) AS player_count,
         COUNT(CASE WHEN m.seat_role = 'spectator'
                    AND m.connection_status IN ${ACTIVE_MEMBER_STATUSES} THEN 1 END) AS spectator_count,
         CASE WHEN r.password_hash IS NULL THEN 0 ELSE 1 END AS requires_password,
         r.updated_at AS updated_at
       FROM rooms r
       LEFT JOIN room_members m ON m.room_id = r.id
       WHERE r.status IN ('LOBBY', 'IN_GAME')
       GROUP BY r.id
       ORDER BY r.updated_at DESC, r.created_at DESC, r.id ASC`,
    )
    .all() as unknown as PublicRoomRow[];

  return rows.flatMap((row) => {
    const gameId = row.game_id ?? DEFAULT_PLAYABLE_GAME_ID;
    const game = getGameCatalogEntry(gameId);
    if (!game) return [];

    return [{
      roomCode: row.room_code,
      gameId: game.id,
      gameName: game.displayName,
      status: row.status,
      playerCount: row.player_count,
      maxPlayers: game.maxPlayers,
      spectatorCount: row.spectator_count,
      requiresPassword: row.requires_password === 1,
      updatedAt: row.updated_at,
    }];
  });
}

export function buildRoomSnapshot(db: Db, roomId: string): RoomSnapshotView {
  const room = db
    .prepare('SELECT code, status, seq, game_id, config_json, host_player_id FROM rooms WHERE id = ?')
    .get(roomId) as RoomRow | undefined;
  if (!room) {
    throw new Error(`房间不存在：${roomId}`);
  }

  const game = getGameCatalogEntry(room.game_id);
  if (!game) {
    throw new Error(`房间游戏不存在：${String(room.game_id)}`);
  }

  const memberRows = db
    .prepare(
      `SELECT player_id, nickname, seat_role, seat, connection_status, is_bot, bot_kind, ready
       FROM room_members WHERE room_id = ? AND connection_status != 'KICKED'
       ORDER BY joined_at ASC`,
    )
    .all(roomId) as unknown as MemberRow[];

  let parsedConfig: Record<string, unknown> = {};
  try {
    parsedConfig = JSON.parse(room.config_json);
  } catch {
    parsedConfig = {};
  }

  const members: RoomMemberView[] = memberRows.map((m) => ({
    playerId: m.player_id,
    nickname: m.nickname,
    seatRole: m.seat_role as SeatRole,
    seat: m.seat,
    isHost: m.player_id === room.host_player_id,
    connectionStatus: m.connection_status as MemberConnectionStatus,
    // 真人为 null；机器人缺失 bot_kind 时按 rule 处理（与 listBotMembers 一致）
    botKind: m.is_bot === 1 ? (m.bot_kind === 'llm' ? 'llm' : 'rule') : null,
    ready: m.ready === 1,
  }));

  return {
    roomCode: room.code,
    status: room.status as RoomStatus,
    seq: room.seq,
    gameId: game.id,
    config: parsedConfig,
    members,
  };
}
