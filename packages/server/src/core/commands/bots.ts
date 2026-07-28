/**
 * 机器人成员管理（测试用陪练）。
 *
 * 机器人在 room_members 里就是一行普通成员，只多一个 is_bot=1 标记：
 * 席位、昵称唯一性、开局筛选全部复用真人的那套规则，不开后门。
 * 区别只有两点——没有 WebSocket 连接，因此 resume_token_hash 存哨兵值
 * 'bot'（hashResumeToken 产出 64 位 hex，永远不可能撞上），
 * 且 connection_status 恒为 CONNECTED（没有连接可断，不参与保留期清扫）。
 */
import type { BotKind, RoomSnapshotView } from '@ldj/shared';
import {
  BOT_NICKNAME_PREFIX,
  LLM_BOT_NICKNAME_PREFIX,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS,
} from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';
import { newPlayerId } from '../ids.ts';
import { buildRoomSnapshot } from '../snapshot.ts';
import { getGameModule, DEFAULT_GAME_ID } from '../game/registry.ts';

/** resume_token_hash 哨兵：机器人不可恢复，与 'revoked' 同一套路 */
export const BOT_TOKEN_SENTINEL = 'bot';

/** 一个机器人的身份与决策方式（botRunner 据此选择策略） */
export interface BotMemberRow {
  playerId: string;
  kind: BotKind;
}

export interface AddBotOutcome {
  playerId: string;
  nickname: string;
  kind: BotKind;
  snapshot: RoomSnapshotView;
}

export interface RemoveBotOutcome {
  playerId: string;
  nickname: string;
  snapshot: RoomSnapshotView;
}

/**
 * 该房间的机器人成员（按席位排序，保证驱动顺序稳定）。
 * 供 botRunner 决策，也供房主转让与房间回收逻辑排除。
 */
export function listBotMembers(db: Db, roomId: string): BotMemberRow[] {
  const rows = db
    .prepare(
      `SELECT player_id, bot_kind FROM room_members
       WHERE room_id = ? AND is_bot = 1 AND connection_status NOT IN ('KICKED','EXPIRED')
       ORDER BY seat ASC`,
    )
    .all(roomId) as { player_id: string; bot_kind: string | null }[];
  // bot_kind 为空视为 rule：老数据与手工插入都不该让驱动器崩掉
  return rows.map((r) => ({
    playerId: r.player_id,
    kind: r.bot_kind === 'llm' ? 'llm' : 'rule',
  }));
}

/** 该房间的机器人 playerId 集合 */
export function listBotPlayerIds(db: Db, roomId: string): string[] {
  return listBotMembers(db, roomId).map((b) => b.playerId);
}

export function isBotMember(db: Db, roomId: string, playerId: string): boolean {
  const row = db
    .prepare('SELECT is_bot FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, playerId) as { is_bot: number } | undefined;
  return row?.is_bot === 1;
}

/** 起一个未被占用的机器人昵称：机器人1、机器人2……／AI1、AI2…… */
function pickBotNickname(db: Db, roomId: string, prefix: string): string {
  const taken = new Set(
    (
      db
        .prepare(
          `SELECT nickname FROM room_members
           WHERE room_id = ? AND connection_status NOT IN ('KICKED','EXPIRED')`,
        )
        .all(roomId) as { nickname: string }[]
    ).map((r) => r.nickname),
  );
  for (let i = 1; i <= MAX_PLAYERS + MAX_BOTS_PER_ROOM; i++) {
    const candidate = `${prefix}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new CommandError('ACTION_NOT_ALLOWED', '没有可用的机器人昵称');
}

export interface AddBotOptions {
  /** 决策方式；默认 rule */
  kind?: BotKind;
  /**
   * LLM 是否已配置可用（由 roomCommand 从 ServerConfig 传入）。
   * 事务内不该读进程配置，所以这个判断由调用方给出。
   */
  llmAvailable?: boolean;
}

/**
 * 添加一个机器人（房主权限由 roomCommand 校验）。
 * 只允许在 LOBBY 加入：对局中新增成员会打乱已发牌的状态。
 */
export function applyAddBot(
  tx: TxContext,
  roomId: string,
  options: AddBotOptions = {},
): AddBotOutcome {
  const { db, now } = tx;
  const kind: BotKind = options.kind ?? 'rule';
  const room = db.prepare('SELECT status, game_id FROM rooms WHERE id = ?').get(roomId) as
    | { status: string; game_id: string | null }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'LOBBY') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只能在大厅中添加机器人');
  }

  // 该游戏必须实现 pickBotAction：它既是规则机器人的策略，
  // 也是 LLM 机器人在模型不可用时的兜底，缺了它机器人进场即卡住整局。
  const moduleId = room.game_id ?? DEFAULT_GAME_ID;
  const module = getGameModule(moduleId);
  if (!module) throw new CommandError('INTERNAL_ERROR', `未注册的游戏模块：${moduleId}`);
  if (!module.pickBotAction) {
    throw new CommandError('ACTION_NOT_ALLOWED', `${module.manifest.displayName} 暂不支持机器人`);
  }
  if (kind === 'llm') {
    // 宁可在加入时就说清楚，也不要等开局后才发现每一步都在回落规则策略
    if (options.llmAvailable !== true) {
      throw new CommandError(
        'ACTION_NOT_ALLOWED',
        '未配置大模型接口（LLM_BASE_URL），只能添加普通机器人',
      );
    }
    if (!module.buildBotPrompt) {
      throw new CommandError(
        'ACTION_NOT_ALLOWED',
        `${module.manifest.displayName} 暂不支持 AI 玩家`,
      );
    }
  }

  const activePlayers = db
    .prepare(
      `SELECT player_id, seat, is_bot FROM room_members
       WHERE room_id = ? AND seat_role = 'player' AND connection_status NOT IN ('KICKED','EXPIRED')`,
    )
    .all(roomId) as { player_id: string; seat: number | null; is_bot: number }[];

  if (activePlayers.length >= MAX_PLAYERS) throw new CommandError('ROOM_FULL');
  if (activePlayers.length >= module.manifest.maxPlayers) {
    throw new CommandError(
      'ACTION_NOT_ALLOWED',
      `${module.manifest.displayName} 最多 ${module.manifest.maxPlayers} 人`,
    );
  }
  if (activePlayers.filter((m) => m.is_bot === 1).length >= MAX_BOTS_PER_ROOM) {
    throw new CommandError('ACTION_NOT_ALLOWED', `机器人最多 ${MAX_BOTS_PER_ROOM} 个`);
  }

  // 席位分配与真人同一套：取最小空位
  const used = new Set(activePlayers.map((m) => m.seat));
  let seat: number | null = null;
  for (let s = 1; s <= MAX_PLAYERS; s++) {
    if (!used.has(s)) {
      seat = s;
      break;
    }
  }
  if (seat === null) throw new CommandError('ROOM_FULL');

  const playerId = newPlayerId();
  const prefix = kind === 'llm' ? LLM_BOT_NICKNAME_PREFIX : BOT_NICKNAME_PREFIX;
  const nickname = pickBotNickname(db, roomId, prefix);
  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status, resume_token_hash, reserved_until, joined_at, is_bot, bot_kind)
     VALUES (?, ?, NULL, ?, 'player', ?, 'CONNECTED', ?, NULL, ?, 1, ?)`,
  ).run(roomId, playerId, nickname, seat, BOT_TOKEN_SENTINEL, now, kind);

  return { playerId, nickname, kind, snapshot: buildRoomSnapshot(db, roomId) };
}

/**
 * 移除一个机器人（房主权限由 roomCommand 校验）。
 * 未指定目标时移除席位号最大的那个，便于"多加了就点几下减掉"。
 */
export function applyRemoveBot(
  tx: TxContext,
  roomId: string,
  targetPlayerId?: string,
): RemoveBotOutcome {
  const { db } = tx;
  const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as
    | { status: string }
    | undefined;
  if (!room) throw new CommandError('ROOM_NOT_FOUND');
  if (room.status !== 'LOBBY') {
    throw new CommandError('ACTION_NOT_ALLOWED', '只能在大厅中移除机器人');
  }

  const target = (
    targetPlayerId === undefined
      ? db
          .prepare(
            `SELECT player_id, nickname FROM room_members
             WHERE room_id = ? AND is_bot = 1 AND connection_status NOT IN ('KICKED','EXPIRED')
             ORDER BY seat DESC LIMIT 1`,
          )
          .get(roomId)
      : db
          .prepare(
            `SELECT player_id, nickname FROM room_members
             WHERE room_id = ? AND player_id = ? AND is_bot = 1
               AND connection_status NOT IN ('KICKED','EXPIRED')`,
          )
          .get(roomId, targetPlayerId)
  ) as { player_id: string; nickname: string } | undefined;

  if (!target) throw new CommandError('ACTION_NOT_ALLOWED', '没有可移除的机器人');

  // 机器人无恢复凭证也无战绩，直接删行（与 LOBBY 中真人 leave 一致）
  db.prepare('DELETE FROM room_members WHERE room_id = ? AND player_id = ?').run(
    roomId,
    target.player_id,
  );

  return {
    playerId: target.player_id,
    nickname: target.nickname,
    snapshot: buildRoomSnapshot(db, roomId),
  };
}

/**
 * 真人全部离场时清掉房间里的机器人。
 * 否则 countActiveMembers 永远大于 0，房间不会被标记空置，也就永不回收。
 * 返回被清掉的机器人数量。
 */
export function purgeBotsIfNoHumans(db: Db, roomId: string): number {
  const humans = db
    .prepare(
      `SELECT COUNT(*) AS n FROM room_members
       WHERE room_id = ? AND is_bot = 0
         AND connection_status IN ('CONNECTED','DISCONNECTED_RESERVED')`,
    )
    .get(roomId) as { n: number };
  if (humans.n > 0) return 0;

  const info = db.prepare('DELETE FROM room_members WHERE room_id = ? AND is_bot = 1').run(roomId);
  return Number(info.changes);
}
