/**
 * 在场状态与房主自动转让的内部操作（FR-REC-004、FR-HOST-005/006）。
 * applyMarkDisconnected 供 gateway 断线回调经 executeInternal 调用；
 * 其余为 leave/kick 等命令复用的事务内工具函数。
 */
import type { Db } from '../../persistence/db.ts';
import type { TxContext } from '../executor.ts';
import { parseRoomConfig } from '../roomConfig.ts';
import { buildRoomSnapshot } from '../snapshot.ts';
import { forfeitPlayers, type GameActionOutcome } from '../game/session.ts';
import { insertSystemChat } from './chat.ts';
import { purgeBotsIfNoHumans } from './bots.ts';
import type { ChatMessageView, RoomSnapshotView } from '@ldj/shared';

/** 活跃成员数（占用房间的成员：CONNECTED / 断线保留中） */
export function countActiveMembers(db: Db, roomId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM room_members
       WHERE room_id = ? AND connection_status IN ('CONNECTED','DISCONNECTED_RESERVED')`,
    )
    .get(roomId) as { n: number };
  return row.n;
}

/**
 * 无活跃成员时记录空置时间（FR-ROOM-007 清理依据）。
 *
 * 先清机器人：机器人恒为 CONNECTED 会一直被 countActiveMembers 计入，
 * 真人全走之后房间就永远不满足"空置"条件，也就永不回收。
 */
export function markEmptyIfNoActive(db: Db, roomId: string, now: number): void {
  purgeBotsIfNoHumans(db, roomId);
  if (countActiveMembers(db, roomId) === 0) {
    db.prepare('UPDATE rooms SET empty_since = ? WHERE id = ?').run(now, roomId);
  }
}

/**
 * 房主转让目标：joined_at 最早的 CONNECTED 玩家（排除指定成员）；
 * 同毫秒加入时按席位号确定性平局。
 * 无人在线返回 null（房主位空缺，下个入座玩家接任）。
 *
 * 机器人被排除在外：它恒为 CONNECTED，一旦接任房主就没人能再开局或关房间。
 */
export function pickNextHost(db: Db, roomId: string, excludePlayerId: string | null): string | null {
  const row = db
    .prepare(
      `SELECT player_id FROM room_members
       WHERE room_id = ? AND seat_role = 'player' AND connection_status = 'CONNECTED'
         AND is_bot = 0
         AND (? IS NULL OR player_id != ?)
       ORDER BY joined_at ASC, seat ASC LIMIT 1`,
    )
    .get(roomId, excludePlayerId, excludePlayerId) as { player_id: string } | undefined;
  return row?.player_id ?? null;
}

/** 若 leavingPlayerId 是房主则转让；返回新房主（可能为 null=空缺） */
export function transferHostIfLeaving(
  db: Db,
  roomId: string,
  leavingPlayerId: string,
): { transferred: boolean; newHostId: string | null } {
  const room = db.prepare('SELECT host_player_id FROM rooms WHERE id = ?').get(roomId) as
    | { host_player_id: string | null }
    | undefined;
  if (!room || room.host_player_id !== leavingPlayerId) {
    return { transferred: false, newHostId: room?.host_player_id ?? null };
  }
  const newHostId = pickNextHost(db, roomId, leavingPlayerId);
  db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(newHostId, roomId);
  return { transferred: true, newHostId };
}

export interface MarkDisconnectedOutcome {
  snapshot: RoomSnapshotView;
  /** 断线者是否为当前房主（gateway 据此安排 30 秒自动转让计时器） */
  wasHost: boolean;
}

/**
 * 断线标记（FR-REC-004）：CONNECTED → DISCONNECTED_RESERVED + 保留期限。
 * 返回 null 表示无需变更（成员不存在或已非 CONNECTED）。
 */
export function applyMarkDisconnected(
  tx: TxContext,
  roomId: string,
  playerId: string,
): MarkDisconnectedOutcome | null {
  const { db, now } = tx;
  const member = db
    .prepare(
      'SELECT connection_status, seat_role FROM room_members WHERE room_id = ? AND player_id = ?',
    )
    .get(roomId, playerId) as { connection_status: string; seat_role: string } | undefined;
  if (!member || member.connection_status !== 'CONNECTED') return null;

  const room = db.prepare('SELECT host_player_id, config_json FROM rooms WHERE id = ?').get(roomId) as {
    host_player_id: string | null;
    config_json: string;
  };
  const config = parseRoomConfig(room.config_json);
  const reservedUntil = now + config.reservationMinutes * 60_000;

  db.prepare(
    `UPDATE room_members SET connection_status = 'DISCONNECTED_RESERVED', reserved_until = ?, ready = 0
     WHERE room_id = ? AND player_id = ?`,
  ).run(reservedUntil, roomId, playerId);

  return {
    snapshot: buildRoomSnapshot(db, roomId),
    wasHost: room.host_player_id === playerId,
  };
}

/**
 * 房主断线超时自动转让（FR-HOST-005）：断线 30 秒后由 gateway 计时器经 executeInternal 触发。
 * 返回 null 表示无需变更（房主已回归 / 已转让 / 无可转让对象）。
 */
export function applyAutoTransferHost(
  tx: TxContext,
  roomId: string,
  disconnectedHostId: string,
): { snapshot: RoomSnapshotView; newHostId: string } | null {
  const { db } = tx;
  const room = db.prepare('SELECT host_player_id FROM rooms WHERE id = ?').get(roomId) as
    | { host_player_id: string | null }
    | undefined;
  if (!room || room.host_player_id !== disconnectedHostId) return null;

  const member = db
    .prepare('SELECT connection_status FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, disconnectedHostId) as { connection_status: string } | undefined;
  if (member?.connection_status === 'CONNECTED') return null; // 已重连，无需转让

  const newHostId = pickNextHost(db, roomId, disconnectedHostId);
  if (newHostId === null) return null; // 无在线玩家：保持现状，等下个连接接任

  db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(newHostId, roomId);
  return { snapshot: buildRoomSnapshot(db, roomId), newHostId };
}

export interface ExpireReservationsOutcome {
  expiredPlayerIds: string[];
  snapshot: RoomSnapshotView;
  sysChats: ChatMessageView[];
  /** 若房间有活动对局：player_forfeited 系统动作的落库结果 */
  forfeit: GameActionOutcome | null;
}

/**
 * 席位保留期满清理（FR-ID-005、FR-REC-006、§6.7）：
 * DISCONNECTED_RESERVED 且 reserved_until 已过 → EXPIRED + 释放席位 + 作废恢复凭证；
 * 若在对局中则投递 player_forfeited（安全点顺延由命令队列间隙天然保证）。
 * 返回 null 表示无到期成员。由 gateway 定时扫描经 executeInternal 调用。
 */
export function applyExpireReservations(
  tx: TxContext,
  roomId: string,
): ExpireReservationsOutcome | null {
  const { db, now } = tx;
  const expired = db
    .prepare(
      `SELECT player_id, nickname FROM room_members
       WHERE room_id = ? AND connection_status = 'DISCONNECTED_RESERVED'
         AND reserved_until IS NOT NULL AND reserved_until < ?`,
    )
    .all(roomId, now) as { player_id: string; nickname: string }[];
  if (expired.length === 0) return null;

  const sysChats: ChatMessageView[] = [];
  for (const m of expired) {
    db.prepare(
      `UPDATE room_members
       SET connection_status = 'EXPIRED', seat = NULL, resume_token_hash = 'revoked', reserved_until = NULL
       WHERE room_id = ? AND player_id = ?`,
    ).run(roomId, m.player_id);
    sysChats.push(insertSystemChat(tx, roomId, `${m.nickname} 席位保留到期，已退出房间`));
  }

  // 房主在过期名单中 → 立即转让（不等 30 秒计时器）
  const room = db.prepare('SELECT host_player_id FROM rooms WHERE id = ?').get(roomId) as {
    host_player_id: string | null;
  };
  if (room.host_player_id !== null && expired.some((m) => m.player_id === room.host_player_id)) {
    transferHostIfLeaving(db, roomId, room.host_player_id);
  }

  // 对局中的过期玩家批量退出（无活动对局时为 no-op）
  const forfeit = forfeitPlayers(
    tx,
    roomId,
    expired.map((m) => m.player_id),
  );

  markEmptyIfNoActive(db, roomId, now);
  return {
    expiredPlayerIds: expired.map((m) => m.player_id),
    snapshot: buildRoomSnapshot(db, roomId),
    sysChats,
    forfeit,
  };
}
