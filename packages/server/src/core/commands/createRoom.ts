/**
 * create_room 命令（FR-ROOM-001/002/003/008）。
 * 在执行链事务内调用：创建房间 + 创建者成为房主玩家。
 */
import {
  DEFAULT_PLAYABLE_GAME_ID,
  getPlayableGameCatalogEntry,
  type CreateRoomPayload,
  type RoomSnapshotView,
} from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import {
  newRoomId,
  newPlayerId,
  newRoomCode,
  newResumeToken,
  hashResumeToken,
  hashRoomPassword,
} from '../ids.ts';
import { buildRoomSnapshot } from '../snapshot.ts';
import { getGameModule } from '../game/registry.ts';

export interface CreateRoomOutcome {
  roomId: string;
  roomCode: string;
  playerId: string;
  /** 仅在首次加入成功时返回一次（FR-ID-001）；不落回执，不入日志 */
  resumeToken: string;
  snapshot: RoomSnapshotView;
}

const CODE_MAX_ATTEMPTS = 10;

/** 预生成 roomId（入队需要队列键） */
export function prepareCreateRoom(): { roomId: string } {
  return { roomId: newRoomId() };
}

export function applyCreateRoom(
  tx: TxContext,
  roomId: string,
  payload: CreateRoomPayload,
): CreateRoomOutcome {
  const { db, now } = tx;

  // 房间码唯一性必须在事务内检查；碰撞则重新生成（FR-ROOM-008）
  let roomCode: string | null = null;
  for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
    const candidate = newRoomCode();
    const exists = db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(candidate);
    if (!exists) {
      roomCode = candidate;
      break;
    }
  }
  if (roomCode === null) {
    throw new CommandError('INTERNAL_ERROR', '房间码生成失败，请重试');
  }

  const playerId = newPlayerId();
  const resumeToken = newResumeToken();
  const passwordHash = payload.password === undefined ? null : hashRoomPassword(payload.password);
  // 兼容没有 gameId 的旧客户端；目录与实际模块必须同时存在才允许建房。
  const gameId = payload.gameId ?? DEFAULT_PLAYABLE_GAME_ID;
  if (!getPlayableGameCatalogEntry(gameId) || !getGameModule(gameId)) {
    throw new CommandError('ACTION_NOT_ALLOWED', '所选游戏暂未开放');
  }

  db.prepare(
    `INSERT INTO rooms (id, code, status, host_player_id, game_id, config_json, password_hash, seq, created_at, updated_at)
     VALUES (?, ?, 'LOBBY', ?, ?, '{}', ?, ?, ?, ?)`,
  ).run(roomId, roomCode, playerId, gameId, passwordHash, tx.roomSeq, now, now);

  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status, resume_token_hash, reserved_until, joined_at)
     VALUES (?, ?, NULL, ?, 'player', 1, 'CONNECTED', ?, NULL, ?)`,
  ).run(roomId, playerId, payload.nickname, hashResumeToken(resumeToken), now);

  return {
    roomId,
    roomCode,
    playerId,
    resumeToken,
    snapshot: buildRoomSnapshot(db, roomId),
  };
}
