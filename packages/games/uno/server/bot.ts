/**
 * UNO 的机器人策略（测试用陪练）。
 *
 * 打法："能出就出，先出普通牌留着万能牌；出不了就摸，摸完还不能出就过。"
 * 只读玩家视角，纯函数。不做记牌或算计，够把一局跑到有人清空手牌为止。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { UnoAction, UnoCard, UnoColor, UnoPlayerView } from './module.ts';

const COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue'];

function cardColor(card: UnoCard): UnoColor | null {
  return 'color' in card ? card.color : null;
}

function isWild(card: UnoCard): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

/**
 * 与模块内 isPlayable 同规则：同色、同面值，或万能牌。
 * 这里重写一遍而不导出复用，是因为策略只能看视角（topDiscard + currentColor），
 * 拿不到内部状态；两处规则若将来分叉，module.test 的合法性校验会先炸出来。
 */
function isPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  if (isWild(card)) return true;
  const color = cardColor(card);
  if (color === currentColor || color === cardColor(top)) return true;
  if (card.kind === 'number') {
    return top.kind === 'number' && card.value === top.value;
  }
  return card.kind === top.kind;
}

/** 手里最多的颜色，用作万能牌宣色；手上全是万能牌时随便挑一个 */
function bestColor(hand: readonly UnoCard[], random: BotDecisionInput<UnoPlayerView>['random']): UnoColor {
  const tally = new Map<UnoColor, number>();
  for (const card of hand) {
    const color = cardColor(card);
    if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  if (tally.size === 0) return COLORS[random.nextInt(0, COLORS.length)]!;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export function pickUnoBotAction(input: BotDecisionInput<UnoPlayerView>): UnoAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me || view.phase === 'game_over') return null;

  // 剩 1 张先喊 UNO，避免规则补上惩罚后机器人成为唯一受害者
  if (me.hand.length === 1 && !view.players.find((p) => p.playerId === playerId)?.unoCalled) {
    return { type: 'call_uno' };
  }

  if (view.currentPlayerId !== playerId) return null;

  // 有罚牌必须先摸，摸完这一手就结束（reduce 里会自动轮到下一家）
  if (view.pendingDraw > 0) return { type: 'draw_card' };

  const playable = me.hand.filter((card) => isPlayable(card, view.topDiscard, view.currentColor));
  if (playable.length > 0) {
    // 普通牌优先，把万能牌留到实在出不了的时候
    const plain = playable.filter((card) => !isWild(card));
    const pool = plain.length > 0 ? plain : playable;
    const card = pool[random.nextInt(0, pool.length)]!;
    return isWild(card)
      ? { type: 'play_card', cardId: card.id, declaredColor: bestColor(me.hand, random) }
      : { type: 'play_card', cardId: card.id };
  }

  // 一张都出不了：本回合还没摸就摸一张，摸过了就过
  return me.hasDrawnThisTurn ? { type: 'pass_after_draw' } : { type: 'draw_card' };
}
