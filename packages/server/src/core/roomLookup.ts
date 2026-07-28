/**
 * 房间码 → roomId 查找（入队前需要队列键，故在执行链外只读查询）。
 * 房间码在校验层已归一化为大写（roomCodeSchema）。
 */
import type { Db } from '../persistence/db.ts';

export function findRoomIdByCode(db: Db, roomCode: string): string | null {
  const row = db.prepare('SELECT id FROM rooms WHERE code = ?').get(roomCode) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}
