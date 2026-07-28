/**
 * join_room 命令（FR-ROOM-003/004/005、FR-SPEC-001/002、FR-HOST-006）。
 * 在执行链事务内调用；房间行已由 executor 确认存在且未 CLOSED。
 */
import type { JoinRoomPayload, RoomSnapshotView } from '@ldj/shared';
import { MAX_PLAYERS, MAX_SPECTATORS } from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { newPlayerId, newResumeToken, hashResumeToken, verifyRoomPassword } from '../ids.ts';
import { parseRoomConfig } from '../roomConfig.ts';
import { buildRoomSnapshot } from '../snapshot.ts';

export interface JoinRoomOutcome {
  roomId: string;
  roomCode: string;
  playerId: string;
  seatRole: 'player' | 'spectator';
  /** 仅在加入成功时返回一次（FR-ID-001）；回执中会重放同一值，不入日志 */
  resumeToken: string;
  snapshot: RoomSnapshotView;
}

interface RoomRow {
  code: string;
  status: string;
  host_player_id: string | null;
  config_json: string;
  password_hash: string | null;
}

export function applyJoinRoom(tx: TxContext, roomId: string, payload: JoinRoomPayload): JoinRoomOutcome {
  const { db, now } = tx;
  const room = db
    .prepare('SELECT code, status, host_player_id, config_json, password_hash FROM rooms WHERE id = ?')
    .get(roomId) as RoomRow | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');

  // 密码校验（FR-ROOM-002）：有密码的房间必须先过密码，再暴露其他状态信息
  if (room.password_hash !== null) {
    if (payload.password === undefined || !verifyRoomPassword(payload.password, room.password_hash)) {
      throw new CommandError('INVALID_PASSWORD');
    }
  }

  const config = parseRoomConfig(room.config_json);

  // 状态判定（FR-ROOM-005）：LOBBY 可加玩家/观战；IN_GAME/POST_GAME 仅观战
  let seatRole: 'player' | 'spectator' = payload.asSpectator ? 'spectator' : 'player';
  if (room.status !== 'LOBBY') {
    if (!payload.asSpectator) {
      seatRole = 'spectator'; // 对局中加入自动降级为观战（FR-ROOM-005）
    }
  }
  if (seatRole === 'spectator' && !config.spectatorsAllowed) {
    throw new CommandError('ACTION_NOT_ALLOWED', '该房间未开启观战');
  }

  // 活跃成员：占用昵称与席位的集合（KICKED/EXPIRED 已释放）
  const activeMembers = db
    .prepare(
      `SELECT player_id, nickname, seat_role, seat FROM room_members
       WHERE room_id = ? AND connection_status NOT IN ('KICKED','EXPIRED')`,
    )
    .all(roomId) as unknown as {
    player_id: string;
    nickname: string;
    seat_role: string;
    seat: number | null;
  }[];

  // 重名检查（FR-ROOM-003）：仅对活跃成员
  if (activeMembers.some((m) => m.nickname === payload.nickname)) {
    throw new CommandError('NICKNAME_TAKEN');
  }

  // 容量检查（FR-ROOM-004 / FR-SPEC-002）
  const players = activeMembers.filter((m) => m.seat_role === 'player');
  const spectators = activeMembers.filter((m) => m.seat_role === 'spectator');
  let seat: number | null = null;
  if (seatRole === 'player') {
    if (players.length >= MAX_PLAYERS) throw new CommandError('ROOM_FULL');
    const used = new Set(players.map((m) => m.seat));
    for (let s = 1; s <= MAX_PLAYERS; s++) {
      if (!used.has(s)) {
        seat = s;
        break;
      }
    }
  } else {
    if (spectators.length >= MAX_SPECTATORS) throw new CommandError('ROOM_FULL', '观战席已满');
  }

  const playerId = newPlayerId();
  const resumeToken = newResumeToken();
  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status, resume_token_hash, reserved_until, joined_at)
     VALUES (?, ?, NULL, ?, ?, ?, 'CONNECTED', ?, NULL, ?)`,
  ).run(roomId, playerId, payload.nickname, seatRole, seat, hashResumeToken(resumeToken), now);

  // 房间不再空置
  db.prepare('UPDATE rooms SET empty_since = NULL WHERE id = ?').run(roomId);

  // 房主空缺且新成员为玩家 → 接任房主（FR-HOST-006 待转让态收敛）
  if (room.host_player_id === null && seatRole === 'player') {
    db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(playerId, roomId);
  }

  return {
    roomId,
    roomCode: room.code,
    playerId,
    seatRole,
    resumeToken,
    snapshot: buildRoomSnapshot(db, roomId),
  };
}
