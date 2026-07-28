/**
 * 斗地主机器人策略（测试用陪练）。
 *
 * 出牌思路刻意保守：能接就接，接就接最小的一手。
 * 首出（无当前牌）时挑手数最少、点数最小的合法牌型，把大牌留到后面；
 * 压牌时只找同型同长且刚好大过一点的那一手，炸弹和火箭留到接不上时才用。
 */
import type { BotDecisionInput } from '@ldj/shared';
import {
  canBeat,
  identifyCombo,
  rankValue,
  sortCards,
  type LandlordCard,
  type LandlordCombo,
} from './cards.ts';
import type { LandlordAction, LandlordPlayerView } from './module.ts';

/** 手牌按点数分组：点数值 → 该点数的牌 */
function groupByRank(hand: readonly LandlordCard[]): Map<number, LandlordCard[]> {
  const groups = new Map<number, LandlordCard[]>();
  for (const card of hand) {
    const value = rankValue(card.rank);
    const bucket = groups.get(value);
    if (bucket) bucket.push(card);
    else groups.set(value, [card]);
  }
  return groups;
}

/**
 * 枚举手牌中所有能被 identifyCombo 认可的牌型。
 * 不穷举顺子的每种切法（组合爆炸），只取每个起点的最短合法顺子——
 * 陪练够用，且避免在 12 张手牌上做上万次校验。
 */
export function enumerateCombos(hand: readonly LandlordCard[]): LandlordCombo[] {
  const combos: LandlordCombo[] = [];
  const groups = groupByRank(hand);
  const values = [...groups.keys()].sort((a, b) => a - b);

  // 单张 / 对子 / 三条 / 炸弹：同点数直接取前 n 张
  for (const value of values) {
    const cards = groups.get(value)!;
    for (let take = 1; take <= cards.length; take++) {
      const combo = identifyCombo(cards.slice(0, take));
      if (combo) combos.push(combo);
    }
  }

  // 火箭：双王
  const jokers = hand.filter((card) => card.rank === 'SJ' || card.rank === 'BJ');
  if (jokers.length === 2) {
    const rocket = identifyCombo(jokers);
    if (rocket) combos.push(rocket);
  }

  // 三带一 / 三带二：三条配最小的单张或对子
  for (const value of values) {
    const triple = groups.get(value)!;
    if (triple.length < 3) continue;
    const others = values.filter((v) => v !== value);
    const singleFrom = others.find((v) => groups.get(v)!.length >= 1);
    if (singleFrom !== undefined) {
      const combo = identifyCombo([...triple.slice(0, 3), ...groups.get(singleFrom)!.slice(0, 1)]);
      if (combo) combos.push(combo);
    }
    const pairFrom = others.find((v) => groups.get(v)!.length >= 2);
    if (pairFrom !== undefined) {
      const combo = identifyCombo([...triple.slice(0, 3), ...groups.get(pairFrom)!.slice(0, 2)]);
      if (combo) combos.push(combo);
    }
  }

  // 顺子：每个起点取最短的 5 张连牌（2 与王不入顺，由 identifyCombo 把关）
  for (let start = 0; start < values.length; start++) {
    const run: LandlordCard[] = [];
    for (let i = start; i < values.length; i++) {
      if (i > start && values[i] !== values[i - 1]! + 1) break;
      run.push(groups.get(values[i]!)![0]!);
      if (run.length >= 5) {
        const combo = identifyCombo(run);
        if (combo) combos.push(combo);
        break;
      }
    }
  }

  // 连对：每个起点取最短的 3 组连续对子
  for (let start = 0; start < values.length; start++) {
    const run: LandlordCard[] = [];
    for (let i = start; i < values.length; i++) {
      if (groups.get(values[i]!)!.length < 2) break;
      if (i > start && values[i] !== values[i - 1]! + 1) break;
      run.push(...groups.get(values[i]!)!.slice(0, 2));
      if (run.length >= 6) {
        const combo = identifyCombo(run);
        if (combo) combos.push(combo);
        break;
      }
    }
  }

  return combos;
}

/** 排序键：牌型越"贵"越靠后，同贵重度按点数升序 */
export function comboCost(combo: LandlordCombo): number {
  const typeWeight =
    combo.type === 'rocket' ? 3000 : combo.type === 'bomb' ? 2000 : combo.cards.length * 10;
  return typeWeight + combo.mainRank;
}

export function pickLandlordBotAction(
  input: BotDecisionInput<LandlordPlayerView>,
): LandlordAction | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || view.phase === 'game_over') return null;

  // 叫地主：固定叫 1 分。既不抢地主也不让流局，三家都是机器人时也能定出地主。
  if (view.phase === 'bidding') {
    if (view.currentBidderId !== playerId) return null;
    return { type: 'bid_score', score: 1 };
  }

  if (view.phase !== 'playing' || view.currentPlayerId !== playerId) return null;

  const hand = sortCards(me.hand);
  if (hand.length === 0) return null;

  const current = view.currentTrick?.combo ?? null;
  // 自己是上一手的出牌者时当作首出（其余两家都过了，牌权回到自己）
  const mustLead = current === null || view.currentTrick?.playerId === playerId;

  const playable = enumerateCombos(hand)
    .filter((combo) => canBeat(combo, mustLead ? null : current))
    .sort((a, b) => comboCost(a) - comboCost(b));

  const chosen = playable[0];
  if (chosen) {
    return { type: 'play_combo', cardIds: chosen.cards.map((card) => card.id) };
  }

  // 接不上：有牌权时不能过（规则不允许），只能出最小的单张兜底
  if (mustLead) {
    return { type: 'play_combo', cardIds: [hand[0]!.id] };
  }
  return { type: 'pass_turn' };
}
