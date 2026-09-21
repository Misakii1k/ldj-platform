import type { PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import { nameFor, type MemberLike } from '../useGameAction.ts';
import type { WitsWagersPlayerView } from './types.ts';

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
): PlayerSeat[] {
  return view.players.map((player) => {
    const member = members.find((m) => m.playerId === player.playerId);

    let badge: string | undefined;
    if (player.forfeited) {
      badge = '已退席';
    } else if (view.phase === 'answering') {
      badge = player.hasSubmitted ? '已交牌' : '书写中';
    } else if (view.phase === 'settlement' || view.phase === 'game_over') {
      const ledger = view.revealed?.ledger.find((l) => l.playerId === player.playerId);
      if (ledger) {
        const delta = ledger.scoreAfter - ledger.scoreBefore;
        badge = delta === 0 ? '持平' : delta > 0 ? `+${delta}` : `${delta}`;
      }
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
      score: displayScores?.[player.playerId] ?? player.score,
      isEliminated: player.forfeited,
      isCurrentTurn: view.phase === 'answering' && !player.hasSubmitted && !player.forfeited,
      badge,
    } satisfies PlayerSeat;
  });
}

/** 我在座位表中的 id，观战者为 undefined。 */
export function mySeatId(view: WitsWagersPlayerView): string | undefined {
  return view.me?.playerId ?? undefined;
}
