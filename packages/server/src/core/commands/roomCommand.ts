/**
 * room_command 命令（§9.2、FR-HOST-001~004）：
 * kick_player / transfer_host / update_config / close_room /
 * start_game / abort_game / return_to_lobby。
 * 权限只信服务端连接上下文推导出的 actorPlayerId（FR-HOST-004）。
 */
import type { BotKind, ChatMessageView, RoomCommandPayload, RoomSnapshotView } from '@ldj/shared';
import { getGameCatalogEntry } from '@ldj/shared';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { parseRoomConfig } from '../roomConfig.ts';
import { buildRoomSnapshot } from '../snapshot.ts';
import { markEmptyIfNoActive } from './presence.ts';
import { applyAddBot, applyRemoveBot } from './bots.ts';
import { applyReadyRoom } from './readyRoom.ts';
import { startGame, abortGame, returnToLobby, type StartGameOutcome } from '../game/session.ts';

export interface RoomCommandOutcome {
  command: RoomCommandPayload['command'];
  snapshot: RoomSnapshotView;
  /** kick_player 时被踢者；gateway 据此断开其连接 */
  kickedPlayerId?: string;
  /** close_room 时为 true；gateway 据此清理订阅 */
  closed?: boolean;
  /** start_game 时的开局结果；gateway 据此广播视角与对表计时器 */
  gameStarted?: StartGameOutcome;
  /** abort_game 时被终止的会话与已落库的系统聊天提示 */
  gameAborted?: { sessionId: string; sysChat: ChatMessageView };
  /** add_bot / remove_bot 时的机器人信息；gateway 据此发系统提示 */
  bot?: { playerId: string; nickname: string; kind: BotKind | null };
}

interface RoomRow {
  status: string;
  host_player_id: string | null;
  config_json: string;
}

function writeAudit(
  tx: TxContext,
  roomId: string,
  actorPlayerId: string,
  action: string,
  result: string,
): void {
  tx.db
    .prepare(
      'INSERT INTO audit_log (room_id, actor_player_id, action, result, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(roomId, actorPlayerId, action, result, tx.now);
}

export interface RoomCommandOptions {
  /**
   * LLM 是否已配置可用（由 gateway 从 ServerConfig 判定后传入）。
   * 事务内不读进程配置，保持 handler 只依赖入参与数据库。
   */
  llmAvailable?: boolean;
}

export function applyRoomCommand(
  tx: TxContext,
  roomId: string,
  actorPlayerId: string,
  payload: RoomCommandPayload,
  options: RoomCommandOptions = {},
): RoomCommandOutcome {
  const { db, now } = tx;
  const room = db
    .prepare('SELECT status, host_player_id, config_json FROM rooms WHERE id = ?')
    .get(roomId) as RoomRow | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');

  // 房主权限校验（FR-HOST-001/004）；ready 是全员命令，不需要房主身份
  if (payload.command === 'ready') {
    const readyOutcome = applyReadyRoom(tx, roomId, actorPlayerId, payload.ready);
    writeAudit(tx, roomId, actorPlayerId, `ready:${payload.ready ? 'yes' : 'no'}`, 'ok');
    return { command: payload.command, snapshot: readyOutcome.snapshot };
  }

  // 席位切换（玩家可自由将自己切为公共大屏或加入玩家席；房主亦可协助操作）
  if (payload.command === 'switch_seat_role') {
    if (room.status !== 'LOBBY' && room.status !== 'POST_GAME') {
      throw new CommandError('ACTION_NOT_ALLOWED', '只能在大厅或结算阶段切换席位身份');
    }
    const targetPlayerId = payload.targetPlayerId ?? actorPlayerId;
    if (targetPlayerId !== actorPlayerId && room.host_player_id !== actorPlayerId) {
      throw new CommandError('NOT_AUTHORIZED', '无权更改他人席位身份');
    }
    const target = db
      .prepare(
        'SELECT connection_status, seat_role, seat, is_bot FROM room_members WHERE room_id = ? AND player_id = ?',
      )
      .get(roomId, targetPlayerId) as
      | { connection_status: string; seat_role: string; seat: number | null; is_bot: number }
      | undefined;
    if (!target || target.connection_status === 'KICKED') {
      throw new CommandError('ACTION_NOT_ALLOWED', '目标成员不在房间中');
    }
    if (target.is_bot) {
      throw new CommandError('ACTION_NOT_ALLOWED', '机器人席位不能切换为公共大屏');
    }
    if (target.seat_role === payload.role) {
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId) };
    }
    if (payload.role === 'spectator') {
      db.prepare(
        'UPDATE room_members SET seat_role = ?, seat = NULL, ready = 0 WHERE room_id = ? AND player_id = ?',
      ).run('spectator', roomId, targetPlayerId);
    } else {
      const roomRow = db.prepare('SELECT game_id FROM rooms WHERE id = ?').get(roomId) as { game_id: string | null } | undefined;
      const gameEntry = getGameCatalogEntry(roomRow?.game_id ?? undefined);
      const maxPlayers = gameEntry?.maxPlayers ?? 12;
      const currentPlayers = db
        .prepare("SELECT seat FROM room_members WHERE room_id = ? AND seat_role = 'player' AND connection_status != 'KICKED'")
        .all(roomId) as { seat: number }[];
      if (currentPlayers.length >= maxPlayers) {
        throw new CommandError('ACTION_NOT_ALLOWED', `玩家席位已满（上限 ${maxPlayers} 人）`);
      }
      const usedSeats = new Set(currentPlayers.map((p) => p.seat));
      let nextSeat = 0;
      while (usedSeats.has(nextSeat)) nextSeat++;
      db.prepare(
        'UPDATE room_members SET seat_role = ?, seat = ?, ready = 0 WHERE room_id = ? AND player_id = ?',
      ).run('player', nextSeat, roomId, targetPlayerId);
    }
    writeAudit(tx, roomId, actorPlayerId, `switch_seat_role:${targetPlayerId}:${payload.role}`, 'ok');
    return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId) };
  }

  if (room.host_player_id !== actorPlayerId) {
    throw new CommandError('NOT_AUTHORIZED');
  }

  switch (payload.command) {
    case 'kick_player': {
      if (payload.targetPlayerId === actorPlayerId) {
        throw new CommandError('ACTION_NOT_ALLOWED', '不能踢出自己');
      }
      const target = db
        .prepare(
          'SELECT connection_status, seat_role FROM room_members WHERE room_id = ? AND player_id = ?',
        )
        .get(roomId, payload.targetPlayerId) as
        | { connection_status: string; seat_role: string }
        | undefined;
      if (!target || target.connection_status === 'KICKED') {
        throw new CommandError('ACTION_NOT_ALLOWED', '目标玩家不在房间中');
      }
      // IN_GAME 中不得踢出仍参与本局的玩家（FR-HOST-002）；观战者不受限
      if (room.status === 'IN_GAME' && target.seat_role === 'player') {
        throw new CommandError('ACTION_NOT_ALLOWED', '对局进行中不能踢出参与本局的玩家');
      }
      // 标记 KICKED：释放席位与昵称，作废恢复凭证（FR-HOST-002/003）
      db.prepare(
        `UPDATE room_members
         SET connection_status = 'KICKED', seat = NULL, resume_token_hash = 'revoked', reserved_until = NULL
         WHERE room_id = ? AND player_id = ?`,
      ).run(roomId, payload.targetPlayerId);
      writeAudit(tx, roomId, actorPlayerId, `kick_player:${payload.targetPlayerId}`, 'ok');
      markEmptyIfNoActive(db, roomId, now);
      return {
        command: payload.command,
        snapshot: buildRoomSnapshot(db, roomId),
        kickedPlayerId: payload.targetPlayerId,
      };
    }
    case 'transfer_host': {
      // 机器人 seat_role 也是 'player'，但永远不会操作/断线，转移给它会永久锁死房间
      const target = db
        .prepare(
          'SELECT connection_status, seat_role FROM room_members WHERE room_id = ? AND player_id = ? AND is_bot = 0',
        )
        .get(roomId, payload.targetPlayerId) as
        | { connection_status: string; seat_role: string }
        | undefined;
      if (
        !target ||
        target.seat_role !== 'player' ||
        !['CONNECTED', 'DISCONNECTED_RESERVED'].includes(target.connection_status)
      ) {
        throw new CommandError('ACTION_NOT_ALLOWED', '目标必须是房间内的玩家');
      }
      db.prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?').run(payload.targetPlayerId, roomId);
      writeAudit(tx, roomId, actorPlayerId, `transfer_host:${payload.targetPlayerId}`, 'ok');
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId) };
    }
    case 'select_game': {
      let aborted = undefined;
      if (room.status === 'IN_GAME') {
        try {
          aborted = abortGame(tx, roomId);
        } catch {
          // 忽略无 session 或已终止的报错
        }
      }
      const newGameId = payload.gameId;
      const gameEntry = getGameCatalogEntry(newGameId);
      if (!gameEntry) {
        throw new CommandError('ACTION_NOT_ALLOWED', '指定的游戏不存在');
      }
      db.prepare("UPDATE rooms SET game_id = ?, status = 'LOBBY', config_json = '{}', updated_at = ? WHERE id = ?").run(newGameId, now, roomId);
      db.prepare('UPDATE room_members SET ready = 0 WHERE room_id = ? AND is_bot = 0').run(roomId);
      writeAudit(tx, roomId, actorPlayerId, `select_game:${newGameId}`, 'ok');
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId), gameAborted: aborted };
    }
    case 'update_config': {
      const merged = { ...parseRoomConfig(room.config_json), ...payload.config };
      db.prepare('UPDATE rooms SET config_json = ? WHERE id = ?').run(JSON.stringify(merged), roomId);
      // 配置变更影响下一局：重置全员准备状态
      db.prepare('UPDATE room_members SET ready = 0 WHERE room_id = ?').run(roomId);
      writeAudit(tx, roomId, actorPlayerId, 'update_config', 'ok');
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId) };
    }
    case 'close_room': {
      if (room.status === 'IN_GAME') {
        abortGame(tx, roomId);
      }
      db.prepare('UPDATE rooms SET status = ?, empty_since = ? WHERE id = ?').run('CLOSED', now, roomId);
      writeAudit(tx, roomId, actorPlayerId, 'close_room', 'ok');
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId), closed: true };
    }
    case 'start_game': {
      const started = startGame(tx, roomId, payload.gameConfig);
      writeAudit(tx, roomId, actorPlayerId, `start_game:${started.sessionId}`, 'ok');
      return {
        command: payload.command,
        snapshot: buildRoomSnapshot(db, roomId),
        gameStarted: started,
      };
    }
    case 'abort_game': {
      if (room.status !== 'IN_GAME') {
        throw new CommandError('ACTION_NOT_ALLOWED', '当前没有进行中的对局');
      }
      const aborted = abortGame(tx, roomId);
      writeAudit(tx, roomId, actorPlayerId, `abort_game:${aborted.sessionId}`, 'ok');
      return {
        command: payload.command,
        snapshot: buildRoomSnapshot(db, roomId),
        gameAborted: aborted,
      };
    }
    case 'return_to_lobby': {
      returnToLobby(tx, roomId);
      writeAudit(tx, roomId, actorPlayerId, 'return_to_lobby', 'ok');
      return { command: payload.command, snapshot: buildRoomSnapshot(db, roomId) };
    }
    case 'add_bot': {
      const added = applyAddBot(tx, roomId, {
        kind: payload.kind,
        llmAvailable: options.llmAvailable,
      });
      writeAudit(tx, roomId, actorPlayerId, `add_bot:${payload.kind}:${added.nickname}`, 'ok');
      return {
        command: payload.command,
        snapshot: added.snapshot,
        bot: { playerId: added.playerId, nickname: added.nickname, kind: added.kind },
      };
    }
    case 'remove_bot': {
      const removed = applyRemoveBot(tx, roomId, payload.targetPlayerId);
      writeAudit(tx, roomId, actorPlayerId, `remove_bot:${removed.nickname}`, 'ok');
      return {
        command: payload.command,
        snapshot: removed.snapshot,
        bot: { playerId: removed.playerId, nickname: removed.nickname, kind: null },
      };
    }
  }
}
