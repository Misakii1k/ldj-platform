/**
 * game_state 视角分发（SPEC §9.3、FR-REC-003、G-04）：
 * 针对单一接收者生成完整游戏视角——参局玩家用 getPlayerView（含自己的词），
 * 观战者与非参局成员用 getSpectatorView；秘密数据永不出服务端白名单。
 */
import type { Db } from '../../persistence/db.ts';
import { getGameModule } from './registry.ts';
import type { SessionRow } from './session.ts';

export interface GameStatePayload {
  sessionId: string;
  moduleId: string;
  /** ACTIVE / FINISHED / ABORTED（RECOVERING 恢复完成前不下发） */
  status: string;
  /** 接收者身份：决定客户端渲染玩家视角还是观战视角 */
  role: 'player' | 'spectator';
  view: unknown;
}

/**
 * 房间最近一局的接收者视角；LOBBY（含 return_to_lobby 之后）不下发游戏状态。
 * POST_GAME 时仍返回已结束会话，供结算页展示（FR-RESULT-001）。
 */
export function buildGameStatePayload(
  db: Db,
  roomId: string,
  playerId: string | null,
): GameStatePayload | null {
  const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as
    | { status: string }
    | undefined;
  if (!room || (room.status !== 'IN_GAME' && room.status !== 'POST_GAME')) return null;

  const session = db
    .prepare(
      `SELECT * FROM game_sessions WHERE room_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(roomId) as SessionRow | undefined;
  if (!session || session.status === 'RECOVERING') return null;

  const module = getGameModule(session.module_id);
  if (!module) return null;
  const state: unknown = JSON.parse(session.snapshot_json);

  const seatRole =
    playerId === null
      ? null
      : ((
          db
            .prepare('SELECT seat_role FROM room_members WHERE room_id = ? AND player_id = ?')
            .get(roomId, playerId) as { seat_role: string } | undefined
        )?.seat_role ?? null);
  const asPlayer = seatRole === 'player' && playerId !== null;

  return {
    sessionId: session.id,
    moduleId: session.module_id,
    status: session.status,
    role: asPlayer ? 'player' : 'spectator',
    view: asPlayer ? module.getPlayerView(state, playerId) : module.getSpectatorView(state),
  };
}
