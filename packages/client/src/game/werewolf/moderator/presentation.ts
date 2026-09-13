/**
 * 狼人杀「真人主持」客户端表现层映射：把权威视角 + 房间成员翻译成纯展示数据。
 *
 * 座位号的唯一权威来源是房间成员席位（room_members.seat）：
 * 大厅成员列表、玩家端、法官控制台必须显示同一个号码，法官按座位点名才对得上。
 * 服务端 view.players[].seat 是「剔除主持人后重编的 1..N」，与线下座位不一致，
 * 因此本模块不读取该字段。
 *
 * 只做展示映射，不合成动作、不重算胜负；服务端 reducer 仍是唯一裁判。
 */
import type {
  RoomMemberView,
  WerewolfModeratorView,
  WerewolfRoleInfo,
} from '@ldj/shared';
import { resolveMemberAvatar } from '../../../user/avatar.ts';
import type { WerewolfPresentationModel, WerewolfSeatModel } from '../presentation.ts';

/** 主持台/玩家端统一席位模型 */
export interface ModeratorSeatModel {
  readonly playerId: string;
  /** 房间席位号；成员已离开时为 null */
  readonly seatNumber: number | null;
  /** 展示用座位标签，如「3 号」 */
  readonly seatLabel: string;
  readonly name: string;
  readonly avatar?: string;
  /** 成员连接状态非 CONNECTED（法官需要知道谁掉线） */
  readonly offline: boolean;
  readonly alive: boolean;
  readonly statusLabel: string;
  /** 角色名；玩家端在终局前恒为 null（防泄露） */
  readonly roleLabel: string | null;
  readonly camp: 'wolves' | 'village' | null;
  readonly isSelf: boolean;
}

export interface ModeratorSummary {
  readonly aliveWolves: number;
  readonly aliveGods: number;
  readonly aliveVillagers: number;
  readonly aliveTotal: number;
  readonly total: number;
}

export interface ModeratorSuggestion {
  readonly outcome: 'village_win' | 'wolves_win';
  readonly reason: string;
}

export interface ModeratorConsoleModel {
  readonly seats: readonly ModeratorSeatModel[];
  /** 法官本人占用的房间席位标签（法官不分角色，但占席位） */
  readonly moderatorSeatLabel: string;
  readonly summary: ModeratorSummary | null;
  readonly suggestion: ModeratorSuggestion | null;
  readonly gameEnded: boolean;
  readonly winner: 'werewolf' | 'good' | null;
}

export interface ModeratorPlayerModel {
  readonly seats: readonly WerewolfSeatModel[];
  readonly self: WerewolfRoleInfo | null;
  readonly selfAlive: boolean;
  readonly aliveCount: number;
  readonly total: number;
  readonly reveal: WerewolfPresentationModel['reveal'];
  readonly winner: 'werewolf' | 'good' | null;
  readonly gameEnded: boolean;
  readonly spectator: boolean;
}

export interface ModeratorModelOptions {
  readonly selfId?: string;
  readonly myAvatar?: string | null;
  readonly spectator?: boolean;
}

/** 成员已离开（房间快照里查不到）时的排序键，永远排在最后 */
const MISSING_MEMBER_SORT_KEY = 999;

function seatLabelOf(seatNumber: number | null): string {
  return seatNumber === null ? '—' : `${seatNumber} 号`;
}

/**
 * 把权威视角中的抽卡玩家映射为统一席位列表，按房间席位号升序。
 * 成员缺失（对局中离开）时使用不泄露内部 ID 的兜底文案。
 */
export function buildModeratorSeats(
  view: WerewolfModeratorView,
  members: readonly RoomMemberView[],
  options: ModeratorModelOptions = {},
): ModeratorSeatModel[] {
  const { selfId, myAvatar } = options;

  const seats = view.players.map((player, index): ModeratorSeatModel & { sortKey: number } => {
    const member = members.find((entry) => entry.playerId === player.playerId);
    const seatNumber = member?.seat ?? null;
    const fallbackName = `第 ${index + 1} 位抽卡玩家`;
    const isSelf = player.playerId === selfId;

    return {
      playerId: player.playerId,
      seatNumber,
      seatLabel: seatLabelOf(seatNumber),
      name: member?.nickname?.trim() || fallbackName,
      avatar: member
        ? resolveMemberAvatar(member, { isMe: isSelf, myAvatar, seat: member.seat, playerId: player.playerId })
        : undefined,
      offline: member === undefined || member.connectionStatus !== 'CONNECTED',
      alive: !player.isEliminated,
      statusLabel: player.isEliminated ? '已出局' : '存活',
      roleLabel: player.roleInfo?.name ?? null,
      camp: player.roleInfo?.camp ?? null,
      isSelf,
      sortKey: seatNumber ?? MISSING_MEMBER_SORT_KEY,
    };
  });

  seats.sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  return seats.map(({ sortKey: _sortKey, ...seat }) => seat);
}

function moderatorSeatLabelOf(
  view: WerewolfModeratorView,
  members: readonly RoomMemberView[],
): string {
  const member = members.find((entry) => entry.playerId === view.moderatorPlayerId);
  return seatLabelOf(member?.seat ?? null);
}

export function buildModeratorConsoleModel(
  view: WerewolfModeratorView,
  members: readonly RoomMemberView[],
  options: ModeratorModelOptions = {},
): ModeratorConsoleModel {
  const stats = view.statistics;
  const reason = view.suggestedOutcomeReason?.trim();

  return {
    seats: buildModeratorSeats(view, members, options),
    moderatorSeatLabel: moderatorSeatLabelOf(view, members),
    summary: stats === undefined
      ? null
      : {
          aliveWolves: stats.aliveWolves,
          aliveGods: stats.aliveGods,
          aliveVillagers: stats.aliveVillagers,
          aliveTotal: stats.totalAlive,
          total: stats.totalPlayers,
        },
    suggestion: view.suggestedOutcome && reason
      ? { outcome: view.suggestedOutcome, reason }
      : null,
    gameEnded: view.gameEnded,
    winner: view.winner,
  };
}

function toWerewolfSeatModel(seat: ModeratorSeatModel): WerewolfSeatModel {
  return {
    playerId: seat.playerId,
    name: seat.name,
    seatLabel: seat.seatLabel,
    alive: seat.alive,
    statusLabel: seat.statusLabel,
    isSelf: seat.isSelf,
    isSpeaking: false,
    isWolfTeammate: false,
    idiotRevealed: false,
    revealedRoleLabel: seat.roleLabel,
    ...(seat.avatar === undefined ? {} : { avatar: seat.avatar }),
    targetActions: [],
  };
}

function buildReveal(
  view: WerewolfModeratorView,
  seats: readonly ModeratorSeatModel[],
): WerewolfPresentationModel['reveal'] {
  if (!view.gameEnded) return null;

  const nameOf = new Map(seats.map((seat) => [seat.playerId, seat.name]));
  const rows = view.players
    .filter((player) => player.roleInfo !== undefined)
    .map((player) => ({
      name: nameOf.get(player.playerId) ?? '未知玩家',
      roleLabel: player.roleInfo!.name,
    }));

  const headline = view.winner === 'werewolf'
    ? '狼人阵营获胜'
    : view.winner === 'good'
      ? '好人阵营获胜'
      : '对局已结束';

  return { headline, rows };
}

export function buildModeratorPlayerModel(
  view: WerewolfModeratorView,
  members: readonly RoomMemberView[],
  options: ModeratorModelOptions = {},
): ModeratorPlayerModel {
  const seats = buildModeratorSeats(view, members, options);
  const aliveCount = seats.filter((seat) => seat.alive).length;

  return {
    seats: seats.map(toWerewolfSeatModel),
    self: view.myRole ?? null,
    selfAlive: view.isMeEliminated !== true,
    aliveCount,
    total: seats.length,
    reveal: buildReveal(view, seats),
    winner: view.winner,
    gameEnded: view.gameEnded,
    spectator: options.spectator === true,
  };
}
