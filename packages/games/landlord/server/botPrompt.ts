/**
 * 斗地主的 LLM 决策材料。
 *
 * 候选项由 enumerateBotCombos 枚举（与规则策略同一份逻辑），
 * 模型只挑一个 id，因此不可能出现"牌型不合法"或"压不过"的动作。
 *
 * 手牌组合数很大，所以枚举结果做了截断：候选项超过 24 条时只留最便宜的那些。
 * 让模型在 200 个选项里挑，既费 token 也挑不准。
 */
import type { BotActionOption, BotDecisionInput, BotPromptContext } from '@ldj/shared';
import {
  canBeat,
  rankValue,
  sortCards,
  type LandlordCard,
  type LandlordCombo,
} from './cards.ts';
import { comboCost, enumerateCombos } from './bot.ts';
import type { LandlordAction, LandlordPlayerView } from './module.ts';

/** 候选项上限：超过就砍掉最贵的那些，保留小牌选择 */
const MAX_OPTIONS = 24;

const COMBO_NAMES: Record<LandlordCombo['type'], string> = {
  single: '单张',
  pair: '对子',
  triple: '三条',
  triple_single: '三带一',
  triple_pair: '三带二',
  straight: '顺子',
  pair_sequence: '连对',
  bomb: '炸弹',
  rocket: '王炸',
};

function cardName(card: LandlordCard): string {
  if (card.rank === 'SJ') return '小王';
  if (card.rank === 'BJ') return '大王';
  return card.rank;
}

function comboName(combo: LandlordCombo): string {
  const cards = combo.cards.map(cardName).join(' ');
  return `${COMBO_NAMES[combo.type] ?? combo.type}（${cards}）`;
}

function seatLabel(view: LandlordPlayerView, playerId: string): string {
  const index = view.players.findIndex((p) => p.playerId === playerId);
  return index < 0 ? '未知玩家' : `${index + 1} 号玩家`;
}

function roleOf(view: LandlordPlayerView, playerId: string): string {
  if (view.landlordId === null) return '身份未定';
  return view.landlordId === playerId ? '地主' : '农民';
}

const ROLE_BRIEF = `你在玩斗地主。叫分最高的人当地主，拿到 3 张底牌，独自对抗两个农民。
地主先出牌完就赢；任意一个农民出完牌，两个农民一起赢。
压牌必须同牌型同张数且点数更大，炸弹能压任何非炸弹牌型，王炸最大。`;

/** 桌上闲聊：让模型知道大家在说什么（斗地主无发言环节，仅作气氛与意图参考） */
function describeTableTalk(input: BotDecisionInput<LandlordPlayerView>): string {
  const chat = (input.recentChat ?? []).slice(-6);
  if (chat.length === 0) return '';
  const lines = chat.map((line) =>
    `${line.fromPlayerId ? seatLabel(input.view, line.fromPlayerId) : '系统'}：${line.text}`,
  );
  return ['桌上闲聊：', ...lines].join('\n');
}

export function buildLandlordBotPrompt(
  input: BotDecisionInput<LandlordPlayerView>,
): BotPromptContext<LandlordAction> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || view.phase === 'game_over') return null;

  if (view.phase === 'bidding') {
    if (view.currentBidderId !== playerId) return null;
    const hand = sortCards(me.hand);
    const bigCards = hand.filter((c) => rankValue(c.rank) >= rankValue('A')).map(cardName);
    const bidsSoFar =
      view.bids.length === 0
        ? '你是第一个叫分的。'
        : view.bids
            .map((b) => `${seatLabel(view, b.playerId)} 叫 ${b.score} 分`)
            .join('，') + '。';
    const highest = Math.max(0, ...view.bids.map((b) => b.score));

    return {
      roleBrief: ROLE_BRIEF,
      situation: [
        `你是${seatLabel(view, playerId)}，手牌 ${hand.length} 张：${hand.map(cardName).join(' ')}。`,
        bigCards.length > 0 ? `其中大牌：${bigCards.join(' ')}。` : '你手上没有 A 以上的大牌。',
        bidsSoFar,
        '现在轮到你叫分。叫得高更可能当地主，但地主要独自对抗两家；不叫（0 分）就稳当农民。',
        describeTableTalk(input),
      ].filter(Boolean).join('\n'),
      options: [
        { id: '0', label: '不叫（0 分）', action: { type: 'bid_score', score: 0 } },
        ...([1, 2, 3] as const)
          .filter((s) => s > highest)
          .map((s) => ({
            id: String(s),
            label: `叫 ${s} 分`,
            action: { type: 'bid_score' as const, score: s },
          })),
      ],
    };
  }

  if (view.phase !== 'playing' || view.currentPlayerId !== playerId) return null;

  const hand = sortCards(me.hand);
  if (hand.length === 0) return null;

  const current = view.currentTrick?.combo ?? null;
  const mustLead = current === null || view.currentTrick?.playerId === playerId;

  const others = view.players
    .filter((p) => p.playerId !== playerId)
    .map((p) => `${seatLabel(view, p.playerId)}（${roleOf(view, p.playerId)}）${p.handCount} 张`)
    .join('，');

  const header = [
    `你是${seatLabel(view, playerId)}，身份是${roleOf(view, playerId)}。`,
    `你的手牌 ${hand.length} 张：${hand.map(cardName).join(' ')}。`,
    `其他人：${others}。`,
    view.landlordId !== null && view.bottomCards.length > 0
      ? `底牌：${view.bottomCards.map(cardName).join(' ')}。`
      : '',
    `当前倍数 ${view.multiplier}。`,
  ]
    .filter(Boolean)
    .join('\n');

  const combos = enumerateCombos(hand)
    .filter((combo) => canBeat(combo, mustLead ? null : current))
    .sort((a, b) => comboCost(a) - comboCost(b));

  const options: BotActionOption<LandlordAction>[] = combos
    .slice(0, MAX_OPTIONS)
    .map((combo) => ({
      id: combo.cards.map((c) => c.id).join(','),
      label: `出 ${comboName(combo)}`,
      action: { type: 'play_combo', cardIds: combo.cards.map((c) => c.id) },
    }));

  if (mustLead) {
    if (options.length === 0) {
      // 有牌权必须出：兜底出最小单张（与规则策略一致）
      const smallest = hand[0]!;
      return {
        roleBrief: ROLE_BRIEF,
        situation: `${header}\n你有牌权但没找到成型的牌，只能出最小的单张。`,
        options: [
          {
            id: smallest.id,
            label: `出 单张（${cardName(smallest)}）`,
            action: { type: 'play_combo', cardIds: [smallest.id] },
          },
        ],
      };
    }
    return {
      roleBrief: ROLE_BRIEF,
      situation: `${header}\n你有牌权，随便出什么牌型都行。小牌先走，大牌留着压别人。`,
      options,
    };
  }

  const currentDesc = current ? comboName(current) : '无';
  const fromWho = view.currentTrick ? seatLabel(view, view.currentTrick.playerId) : '上家';
  options.push({ id: 'pass', label: '不出（过）', action: { type: 'pass_turn' } });

  return {
    roleBrief: ROLE_BRIEF,
    situation: [
      header,
      `${fromWho} 出的是 ${currentDesc}，轮到你决定压不压。`,
      '压牌会消耗手上的大牌；如果压牌的人是队友，通常应该过。',
      describeTableTalk(input),
    ].filter(Boolean).join('\n'),
    options,
  };
}
