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
import type { Db } from '../persistence/db.ts';

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
}

export function buildRoomSnapshot(db: Db, roomId: string): RoomSnapshotView {
  const room = db
    .prepare('SELECT code, status, seq, game_id, config_json, host_player_id FROM rooms WHERE id = ?')
    .get(roomId) as RoomRow | undefined;
  if (!room) {
    throw new Error(`房间不存在：${roomId}`);
  }

  const memberRows = db
    .prepare(
      `SELECT player_id, nickname, seat_role, seat, connection_status
       FROM room_members WHERE room_id = ? AND connection_status != 'KICKED'
       ORDER BY joined_at ASC`,
    )
    .all(roomId) as unknown as MemberRow[];

  const members: RoomMemberView[] = memberRows.map((m) => ({
    playerId: m.player_id,
    nickname: m.nickname,
    seatRole: m.seat_role as SeatRole,
    seat: m.seat,
    isHost: m.player_id === room.host_player_id,
    connectionStatus: m.connection_status as MemberConnectionStatus,
  }));

  return {
    roomCode: room.code,
    status: room.status as RoomStatus,
    seq: room.seq,
    gameId: room.game_id,
    config: JSON.parse(room.config_json),
    members,
  };
}
