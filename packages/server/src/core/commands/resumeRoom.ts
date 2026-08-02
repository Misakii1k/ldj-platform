/**
 * resume_room 命令（FR-ID-002/003、FR-REC-004/005）。
 * 校验 resumeToken 哈希后将成员置回 CONNECTED；会话接管在 gateway 层完成（FR-ID-004）。
 */
import type { ResumeRoomPayload, RoomSnapshotView } from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { hashResumeToken } from '../ids.ts';
import { buildRoomSnapshot } from '../snapshot.ts';

export interface ResumeRoomOutcome {
  roomId: string;
  roomCode: string;
  playerId: string;
  seatRole: 'player' | 'spectator';
  snapshot: RoomSnapshotView;
}

interface MemberRow {
  seat_role: string;
  connection_status: string;
  resume_token_hash: string;
  reserved_until: number | null;
}

export function applyResumeRoom(
  tx: TxContext,
  roomId: string,
  payload: ResumeRoomPayload,
): ResumeRoomOutcome {
  const { db, now } = tx;
  const room = db.prepare('SELECT code FROM rooms WHERE id = ?').get(roomId) as
    | { code: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');

  const member = db
    .prepare(
      `SELECT seat_role, connection_status, resume_token_hash, reserved_until
       FROM room_members WHERE room_id = ? AND player_id = ?`,
    )
    .get(roomId, payload.playerId) as MemberRow | undefined;

  // 成员不存在 / 被踢 / 凭证不符 → 统一 INVALID_RESUME_TOKEN（不泄露区分信息）
  if (!member || member.connection_status === 'KICKED') {
    throw new CommandError('INVALID_RESUME_TOKEN');
  }
  // 保留过期（FR-REC-005）先于 token 校验：到期清扫会作废 token 哈希（FR-ID-005），
  // 此时应引导客户端按 RESERVATION_EXPIRED 处理（可观战重新加入）而非当作凭证无效
  if (member.connection_status === 'EXPIRED') {
    throw new CommandError('RESERVATION_EXPIRED');
  }
  if (member.reserved_until !== null && member.reserved_until < now) {
    throw new CommandError('RESERVATION_EXPIRED');
  }
  if (member.resume_token_hash !== hashResumeToken(payload.resumeToken)) {
    throw new CommandError('INVALID_RESUME_TOKEN');
  }

  db.prepare(
    `UPDATE room_members SET connection_status = 'CONNECTED', reserved_until = NULL, ready = 0
     WHERE room_id = ? AND player_id = ?`,
  ).run(roomId, payload.playerId);
  db.prepare('UPDATE rooms SET empty_since = NULL WHERE id = ?').run(roomId);

  return {
    roomId,
    roomCode: room.code,
    playerId: payload.playerId,
    seatRole: member.seat_role as 'player' | 'spectator',
    snapshot: buildRoomSnapshot(db, roomId),
  };
}
