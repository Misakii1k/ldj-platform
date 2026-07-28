/**
 * UNO 的 LLM 决策材料。
 *
 * 候选项就是"此刻所有能打出的牌"——由这里枚举，模型只挑一个 id。
 * 万能牌需要同时宣色，所以每种颜色各占一个候选项，
 * 免得模型选完牌还要再答一次颜色（多一轮往返就多一次失败机会）。
 */
import type { BotDecisionInput, BotPromptContext, BotActionOption } from '@ldj/shared';
import type { UnoAction, UnoCard, UnoColor, UnoPlayerView } from './module.ts';

const COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue'];

const COLOR_NAMES: Record<UnoColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

function cardColor(card: UnoCard): UnoColor | null {
  return 'color' in card ? card.color : null;
}

function isWild(card: UnoCard): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

/** 牌面中文名："红 7"、"蓝 禁止"、"万能牌+4" */
function cardName(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return `${COLOR_NAMES[card.color]} ${card.value}`;
    case 'skip':
      return `${COLOR_NAMES[card.color]} 禁止`;
    case 'reverse':
      return `${COLOR_NAMES[card.color]} 反转`;
    case 'draw2':
      return `${COLOR_NAMES[card.color]} +2`;
    case 'wild':
      return '万能牌';
    case 'wild4':
      return '万能牌+4';
  }
}

/** 与模块内 isPlayable 同规则；策略只能看视角，所以这里独立实现一遍 */
function isPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  if (isWild(card)) return true;
  const color = cardColor(card);
  if (color === currentColor || color === cardColor(top)) return true;
  if (card.kind === 'number') {
    return top.kind === 'number' && card.value === top.value;
  }
  return card.kind === top.kind;
}

function seatLabel(view: UnoPlayerView, playerId: string): string {
  const index = view.players.findIndex((p) => p.playerId === playerId);
  return index < 0 ? '未知玩家' : `${index + 1} 号玩家`;
}

const ROLE_BRIEF = `你在玩 UNO。轮到你时，要打出一张与台面顶牌同色或同面值的牌，万能牌任何时候都能打。
打不出就摸一张，摸到能打的可以接着打，否则本回合结束。
谁先把手牌打完谁赢，所以尽量少留牌；手上只剩一张时要喊 UNO。`;

export function buildUnoBotPrompt(
  input: BotDecisionInput<UnoPlayerView>,
): BotPromptContext<UnoAction> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || view.phase === 'game_over') return null;

  const self = view.players.find((p) => p.playerId === playerId);

  // 剩 1 张先喊 UNO：这一步没有选择空间，不必问模型
  if (me.hand.length === 1 && self && !self.unoCalled) {
    return {
      roleBrief: ROLE_BRIEF,
      situation: '你只剩一张牌了，按规则要喊 UNO。',
      options: [{ id: 'uno', label: '喊 UNO', action: { type: 'call_uno' } }],
    };
  }

  if (view.currentPlayerId !== playerId) return null;

  const others = view.players
    .filter((p) => p.playerId !== playerId)
    .map((p) => `${seatLabel(view, p.playerId)} ${p.handCount} 张${p.unoCalled ? '（已喊 UNO）' : ''}`)
    .join('，');

  const header = [
    `你是${seatLabel(view, playerId)}，手上 ${me.hand.length} 张：${me.hand.map(cardName).join('、')}。`,
    `台面顶牌是「${cardName(view.topDiscard)}」，当前有效颜色是${COLOR_NAMES[view.currentColor]}。`,
    `其他人：${others}。`,
    view.direction === 1 ? '出牌顺序：正序。' : '出牌顺序：已反转。',
  ].join('\n');

  // 有罚牌只能摸，没有可选项
  if (view.pendingDraw > 0) {
    return {
      roleBrief: ROLE_BRIEF,
      situation: `${header}\n你被罚摸 ${view.pendingDraw} 张，只能摸牌。`,
      options: [{ id: 'draw', label: `摸 ${view.pendingDraw} 张牌`, action: { type: 'draw_card' } }],
    };
  }

  const options: BotActionOption<UnoAction>[] = [];
  for (const card of me.hand) {
    if (!isPlayable(card, view.topDiscard, view.currentColor)) continue;
    if (isWild(card)) {
      // 万能牌把"打哪张 + 宣什么色"合成一个选项
      for (const color of COLORS) {
        options.push({
          id: `${card.id}:${color}`,
          label: `打出 ${cardName(card)}，并宣布颜色为${COLOR_NAMES[color]}`,
          action: { type: 'play_card', cardId: card.id, declaredColor: color },
        });
      }
    } else {
      options.push({
        id: card.id,
        label: `打出 ${cardName(card)}`,
        action: { type: 'play_card', cardId: card.id },
      });
    }
  }

  if (options.length === 0) {
    // 一张都打不出：摸牌或（摸过之后）过牌，同样没有真正的选择
    return {
      roleBrief: ROLE_BRIEF,
      situation: `${header}\n你手上没有能打的牌。`,
      options: me.hasDrawnThisTurn
        ? [{ id: 'pass', label: '摸过了还是打不出，结束回合', action: { type: 'pass_after_draw' } }]
        : [{ id: 'draw', label: '摸一张牌', action: { type: 'draw_card' } }],
    };
  }

  // 打得出也允许选择摸牌（留牌等时机），但不鼓励，放在最后
  if (!me.hasDrawnThisTurn) {
    options.push({ id: 'draw', label: '不打，摸一张牌', action: { type: 'draw_card' } });
  }

  return {
    roleBrief: ROLE_BRIEF,
    situation: `${header}\n轮到你出牌。手牌越少越接近胜利，也要留意别人快出完了。`,
    options,
  };
}
