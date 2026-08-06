/**
 * uno_platform_house_v1 — 规则机器人（只读玩家视角，纯函数）。
 * 保守策略：能出就出（先普通牌留万能牌）；罚牌窗口不叠不加成；绝不质疑；不主动挑战。
 */
import type { BotDecisionInput } from '@ldj/shared';
import { isWild } from './deck.ts';
import type { UnoHouseAction, UnoHouseCard, UnoHouseColor, UnoHousePlayerView } from './types.ts';

const COLORS: readonly UnoHouseColor[] = ['red', 'yellow', 'green', 'blue'];

function cardColor(card: UnoHouseCard): UnoHouseColor | null {
  return 'color' in card ? card.color : null;
}

function bestColor(hand: readonly UnoHouseCard[]): UnoHouseColor {
  const tally = new Map<UnoHouseColor, number>();
  for (const card of hand) {
    const color = cardColor(card);
    if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  if (tally.size === 0) return COLORS[0]!;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export function pickUnoHouseBotAction(input: BotDecisionInput<UnoHousePlayerView>): UnoHouseAction | null {
  const { view } = input;
  const me = view.me;
  if (!me || view.phase === 'match_over' || view.phase === 'round_over') return null;

  const capabilities = new Set(me.capabilities);

  if (me.activeWindow === 'race' && capabilities.has('canCallUno')) {
    return { type: 'call_uno' };
  }
  if (me.activeWindow === 'penalty' || me.activeWindow === 'challenge') {
    // 保守：不叠牌、不质疑 → 直接接受罚牌。
    if (capabilities.has('canAcceptPenalty')) {
      return { type: 'accept_penalty', windowToken: view.pendingPenalty!.windowToken };
    }
    return null;
  }
  if (!me.isCurrentPlayer) return null;

  const playableIds = new Set(me.playableCardIds);
  const hand = me.hand;
  if (playableIds.size > 0) {
    // 普通牌优先，万能牌留到最后。
    const pool = hand
      .filter((card) => playableIds.has(card.id))
      .sort((a, b) => {
        const aWild = isWild(a) ? 1 : 0;
        const bWild = isWild(b) ? 1 : 0;
        return aWild - bWild || a.id.localeCompare(b.id);
      });
    const card = pool[0]!;
    return isWild(card)
      ? { type: 'play_card', cardId: card.id, declaredColor: bestColor(hand), preCallUno: hand.length === 2 }
      : { type: 'play_card', cardId: card.id, preCallUno: hand.length === 2 };
  }
  if (capabilities.has('canDraw')) return { type: 'draw_card' };
  if (capabilities.has('canPassAfterDraw')) return { type: 'pass_after_draw' };
  return null;
}
