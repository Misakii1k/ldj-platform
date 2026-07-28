/**
 * leave_room 命令（FR-ROOM-006、FR-HOST-006）。
 * LOBBY/POST_GAME：删除成员行（释放昵称与席位）；
 * IN_GAME：按断线处理（保留席位，FR-REC-004）。
 */
import type { RoomSnapshotView } from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { parseRoomConfig } from '../roomConfig.ts';
import { buildRoomSnapshot } from '../snapshot.ts';
import { transferHostIfLeaving, markEmptyIfNoActive } from './presence.ts';

export interface LeaveRoomOutcome {
  left: true;
  /** IN_GAME 离开转为断线保留而非移除 */
  mode: 'removed' | 'reserved';
  newHostId: string | null;
  snapshot: RoomSnapshotView;
}

export function applyLeaveRoom(tx: TxContext, roomId: string, playerId: string): LeaveRoomOutcome {
  const { db, now } = tx;
  const room = db.prepare('SELECT status, config_json FROM rooms WHERE id = ?').get(roomId) as
    | { status: string; config_json: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');

  const member = db
    .prepare('SELECT connection_status, seat_role FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, playerId) as { connection_status: string; seat_role: string } | undefined;
  if (!member || member.connection_status === 'KICKED' || member.connection_status === 'EXPIRED') {
    throw new CommandError('ACTION_NOT_ALLOWED', '不在该房间中');
  }

  let mode: 'removed' | 'reserved';
  if (room.status === 'IN_GAME' && member.seat_role === 'player') {
    // 对局中玩家离开：席位保留，等待重连（FR-REC-004）
    const config = parseRoomConfig(room.config_json);
    db.prepare(
      `UPDATE room_members SET connection_status = 'DISCONNECTED_RESERVED', reserved_until = ?
       WHERE room_id = ? AND player_id = ?`,
    ).run(now + config.reservationMinutes * 60_000, roomId, playerId);
    mode = 'reserved';
  } else {
    db.prepare('DELETE FROM room_members WHERE room_id = ? AND player_id = ?').run(roomId, playerId);
    mode = 'removed';
  }

  // 房主离开 → 立即转让给最早加入的在线玩家（FR-HOST-006）
  const { newHostId } = transferHostIfLeaving(db, roomId, playerId);
  markEmptyIfNoActive(db, roomId, now);

  return { left: true, mode, newHostId, snapshot: buildRoomSnapshot(db, roomId) };
}
