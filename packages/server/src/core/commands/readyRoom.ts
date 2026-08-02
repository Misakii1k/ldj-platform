/**
 * ready 命令（房间级"准备"机制）：
 * LOBBY/POST_GAME 下全员可随时准备/取消准备；对局中与观战者不允许。
 * 全员就绪 + 在线人数达标的自动开局由 gateway 的 #checkAutoStart 负责。
 */
import type { RoomSnapshotView } from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { buildRoomSnapshot } from '../snapshot.ts';

export interface ReadyRoomOutcome {
  snapshot: RoomSnapshotView;
}

export function applyReadyRoom(
  tx: TxContext,
  roomId: string,
  playerId: string,
  ready: boolean,
): ReadyRoomOutcome {
  const { db } = tx;
  const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as
    | { status: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');

  const member = db
    .prepare('SELECT seat_role, connection_status FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, playerId) as { seat_role: string; connection_status: string } | undefined;
  if (!member || member.connection_status === 'KICKED' || member.connection_status === 'EXPIRED') {
    throw new CommandError('ACTION_NOT_ALLOWED', '不在该房间中');
  }
  if (member.seat_role !== 'player' || member.connection_status !== 'CONNECTED') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只有在线玩家可以准备');
  }
  if (room.status !== 'LOBBY' && room.status !== 'POST_GAME') {
    throw new CommandError('ACTION_NOT_ALLOWED', '当前状态不能准备');
  }

  db.prepare('UPDATE room_members SET ready = ? WHERE room_id = ? AND player_id = ?').run(
    ready ? 1 : 0,
    roomId,
    playerId,
  );

  return { snapshot: buildRoomSnapshot(db, roomId) };
}
