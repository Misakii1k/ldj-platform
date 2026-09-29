import type { PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import { nameFor, type MemberLike } from '../useGameAction.ts';
import { formatPoints, type WitsWagersPlayerView } from './types.ts';

/**
 * 玩家色板（01-CONTRACT.md §3）：筹码、座位章、作者色点共用。
 * 成员系统没有头像色，按玩家身份哈希到方向稿的六色调色板，
 * 同一玩家在任何画面都是同一颜色。
 */
export const PLAYER_COLORS = [
  '#e0795b',
  '#e8c35a',
  '#6fb89a',
  '#9d8ad6',
  '#6fa3d6',
  '#d98bb0',
] as const;

/** 稳定取色：同一 playerId 永远拿到同一颜色（7、8 人局会复用色板，见计划 Q1）。 */
export function playerColorFor(playerId: string | null | undefined): string {
  if (!playerId) return PLAYER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
}

/** 贵宾厅席位卡用的扩展字段（01-CONTRACT.md §4.1；全部由已有 view 字段派生，旧字段含义不变） */
export interface WitsSeat extends PlayerSeat {
  /** 1-based 座位号（view.players 的顺序），座位章上的字 */
  readonly seatNo: number;
  /** 玩家色：座位章 / 筹码 / 作者色点同色 */
  readonly color: string;
  readonly hasSubmitted: boolean;
  readonly forfeited: boolean;
  /** settlement 账本派生；非结算阶段为 null */
  readonly delta: number | null;
  readonly authorBonus: number;
  /** settlement 按 scoreAfter 排名（并列同名次，分数高者小）；非结算阶段为 null */
  readonly rank: number | null;
  readonly scoreBefore: number | null;
  readonly scoreAfter: number | null;
  /** 当前应显示的分数值（结算演出期间被 displayScores 钉在 scoreBefore） */
  readonly scoreValue: number;
}

/**
 * 把服务端的 players 投影为牌桌座位。
 *
 * 只读公开字段：answering 阶段唯一能公开的进度信号是 hasSubmitted，
 * 绝不能从 board/publicBets 反推任何人的未公开估数。
 */
export function buildSeats(
  view: WitsWagersPlayerView,
  members: readonly MemberLike[],
  displayScores?: Readonly<Record<string, number>>,
): WitsSeat[] {
  const inSettlement = view.phase === 'settlement' || view.phase === 'game_over';
  // 名次：按结算后分数降序，并列同名次（分数严格更高者数量 + 1）
  const afterScores = inSettlement
    ? view.players.map(
        (p) => view.revealed?.ledger.find((l) => l.playerId === p.playerId)?.scoreAfter ?? p.score,
      )
    : [];

  return view.players.map((player, index) => {
    const member = members.find((m) => m.playerId === player.playerId);
    const ledger = inSettlement
      ? view.revealed?.ledger.find((l) => l.playerId === player.playerId)
      : undefined;

    let badge: string | undefined;
    if (player.forfeited) {
      badge = '已退席';
    } else if (view.phase === 'answering') {
      badge = player.hasSubmitted ? '已交牌' : '书写中';
    } else if (inSettlement && ledger) {
      const delta = ledger.scoreAfter - ledger.scoreBefore;
      badge = delta === 0 ? '持平' : `${delta > 0 ? '+' : ''}${formatPoints(delta)}`;
    } else if (view.phase === 'betting') {
      const bets = view.publicBets[player.playerId];
      const placed = bets ? bets.filter((chip) => chip.targetId !== null).length : 0;
      badge = placed > 0 ? `已押 ${placed} 枚` : undefined;
    }

    return {
      id: player.playerId,
      name: nameFor(members, player.playerId),
      avatar: member?.avatar,
      // 结算演出期间显示正在推进中的分数，让派彩与数字变化是同一件事
      score: formatPoints(displayScores?.[player.playerId] ?? player.score),
      isEliminated: player.forfeited,
      isCurrentTurn: view.phase === 'answering' && !player.hasSubmitted && !player.forfeited,
      badge,
      seatNo: index + 1,
      color: playerColorFor(player.playerId),
      hasSubmitted: player.hasSubmitted,
      forfeited: player.forfeited,
      delta: ledger ? ledger.scoreAfter - ledger.scoreBefore : null,
      authorBonus: ledger?.authorBonus ?? 0,
      rank:
        inSettlement && afterScores.length > 0
          ? 1 + afterScores.filter((s) => s > (ledger?.scoreAfter ?? player.score)).length
          : null,
      scoreBefore: ledger?.scoreBefore ?? null,
      scoreAfter: ledger?.scoreAfter ?? null,
      scoreValue: displayScores?.[player.playerId] ?? player.score,
    } satisfies WitsSeat;
  });
}

/** 我在座位表中的 id，观战者为 undefined。 */
export function mySeatId(view: WitsWagersPlayerView): string | undefined {
  return view.me?.playerId ?? undefined;
}
