import { parseDurianAction, parseDurianConfig } from './schemas.ts';
import {
  DURIAN_FRUITS,
  type ChallengeDetails,
  type DurianAction,
  type DurianCard,
  type DurianConfig,
  type DurianEvent,
  type DurianFruit,
  type DurianReduceResult,
  type DurianState,
  type FruitCard,
  type MonkeyCard,
  type MonkeySpecial,
  type TablePlacement,
} from './types.ts';

const deny = (message: string): DurianReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

export function zeroFruitRecord(): Record<DurianFruit, number> {
  return {
    durian: 0,
    strawberry: 0,
    banana: 0,
    grape: 0,
    apple: 0,
  };
}

/** 生成全集 225 张全组合水果候选牌库 (5 水果 × 3 数量 × 5 水果 × 3 数量) */
export function buildDurianCandidateFruitDeck(): FruitCard[] {
  const cards: FruitCard[] = [];
  let id = 1;
  for (const f1 of DURIAN_FRUITS) {
    for (const q1 of [1, 2, 3] as const) {
      for (const f2 of DURIAN_FRUITS) {
        for (const q2 of [1, 2, 3] as const) {
          cards.push({
            id: `fc-all-${id++}`,
            kind: 'fruit',
            left: { fruit: f1, quantity: q1 },
            right: { fruit: f2, quantity: q2 },
          });
        }
      }
    }
  }
  return cards;
}

/** 预设 24 张水果牌（兼容既有基准样例） */
export function buildDurianFruitDeck(): FruitCard[] {
  const definitions: [DurianFruit, 1 | 2 | 3, DurianFruit, 1 | 2 | 3][] = [
    ['durian', 1, 'strawberry', 2],
    ['durian', 2, 'banana', 1],
    ['durian', 1, 'grape', 3],
    ['durian', 3, 'apple', 1],
    ['durian', 2, 'durian', 1],
    ['strawberry', 1, 'banana', 2],
    ['strawberry', 2, 'grape', 1],
    ['strawberry', 3, 'apple', 2],
    ['strawberry', 1, 'strawberry', 2],
    ['banana', 1, 'grape', 2],
    ['banana', 3, 'apple', 1],
    ['banana', 2, 'durian', 1],
    ['banana', 2, 'banana', 1],
    ['grape', 1, 'apple', 3],
    ['grape', 2, 'durian', 2],
    ['grape', 3, 'strawberry', 1],
    ['grape', 1, 'grape', 2],
    ['apple', 1, 'strawberry', 2],
    ['apple', 2, 'banana', 2],
    ['apple', 3, 'grape', 1],
    ['apple', 1, 'apple', 2],
    ['durian', 2, 'strawberry', 1],
    ['banana', 1, 'strawberry', 3],
    ['grape', 2, 'apple', 2],
  ];

  return definitions.map(([f1, q1, f2, q2], index) => ({
    id: `fc-${index + 1}`,
    kind: 'fruit',
    left: { fruit: f1, quantity: q1 },
    right: { fruit: f2, quantity: q2 },
  }));
}

/** 预设小猴功能牌（4 种功能各 1 张） */
export function buildDurianMonkeyDeck(): MonkeyCard[] {
  const specials: MonkeySpecial[] = ['flip', 'do_nothing', 'three_void', 'banana_void'];
  return specials.map((special) => ({
    id: `mc-${special}`,
    kind: 'monkey',
    special,
  }));
}

/** 完整 229 张候选牌库全集 (225 水果牌 + 4 功能牌) */
export function buildDurianMasterCandidatePool(): DurianCard[] {
  return [...buildDurianCandidateFruitDeck(), ...buildDurianMonkeyDeck()];
}

/**
 * 随机组牌：从 225+ 张全组合候选大牌库中随机抽取 24 张水果牌 + 4 张猴子功能牌组成 28 张牌堆。
 * 每一轮的水果种类、数量组合均具有高度多样性与不可预测性。
 */
export function buildDurianDeck(rng?: () => number): DurianCard[] {
  const random = rng ?? Math.random;
  const allFruits = buildDurianCandidateFruitDeck();
  // Fisher-Yates 洗牌
  for (let i = allFruits.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [allFruits[i], allFruits[j]] = [allFruits[j]!, allFruits[i]!];
  }
  const selectedFruits = allFruits.slice(0, 24);
  const selectedMonkeys = buildDurianMonkeyDeck();

  const deck = [...selectedFruits, ...selectedMonkeys];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** 计算桌面上生效的各类水果总数（已计入小猴功能牌修正） */
export function computeActiveTableTotals(placements: readonly TablePlacement[]): {
  totals: Record<DurianFruit, number>;
  voidThreeActive: boolean;
  voidBananaActive: boolean;
} {
  const totals = zeroFruitRecord();
  let voidThreeActive = false;
  let voidBananaActive = false;

  for (const placement of placements) {
    if (placement.kind === 'monkey') {
      if (placement.data.card.special === 'three_void') voidThreeActive = true;
      if (placement.data.card.special === 'banana_void') voidBananaActive = true;
    }
  }

  for (const placement of placements) {
    if (placement.kind === 'fruit') {
      const { card, checkHalf } = placement.data;
      const checkedHalf = checkHalf === 'left' ? card.left : card.right;

      if (voidThreeActive && checkedHalf.quantity === 3) continue;
      if (voidBananaActive && checkedHalf.fruit === 'banana') continue;

      totals[checkedHalf.fruit] += checkedHalf.quantity;
    }
  }

  return { totals, voidThreeActive, voidBananaActive };
}

/** 计算所有人头顶牌中的水果真实总数 */
export function computeStockTotals(foreheadCards: Record<string, DurianCard>): Record<DurianFruit, number> {
  const totals = zeroFruitRecord();
  for (const card of Object.values(foreheadCards)) {
    if (card.kind === 'fruit') {
      totals[card.left.fruit] += card.left.quantity;
      totals[card.right.fruit] += card.right.quantity;
    }
  }
  return totals;
}

/** 获取顺时针下一位存活玩家 */
export function getNextAlivePlayer(state: DurianState, fromPlayerId: string): string {
  const alivePlayers = state.players.filter((id) => !state.eliminatedPlayers.includes(id));
  if (alivePlayers.length === 0) return state.players[0]!;
  const fromIndex = alivePlayers.indexOf(fromPlayerId);
  if (fromIndex === -1) return alivePlayers[0]!;
  return alivePlayers[(fromIndex + 1) % alivePlayers.length]!;
}

/** 发牌初始化一轮 */
export function prepareDurianRound(
  players: readonly string[],
  deck: DurianCard[],
  round: number,
  starterId: string,
  statePartial: Partial<DurianState> = {},
): DurianState {
  const availableDeck = [...deck];
  const foreheadCards: Record<string, DurianCard> = {};

  const eliminated = statePartial.eliminatedPlayers ?? [];
  const alivePlayers = players.filter((id) => !eliminated.includes(id));

  for (const id of alivePlayers) {
    const card = availableDeck.shift();
    if (card) foreheadCards[id] = card;
  }

  const validStarter = alivePlayers.includes(starterId) ? starterId : (alivePlayers[0] ?? players[0]!);

  return {
    schemaVersion: 1,
    phase: 'turn_action',
    players: [...players],
    round,
    maxRounds: statePartial.maxRounds ?? 7,
    mode: statePartial.mode ?? 'standard',
    deck: availableDeck,
    foreheadCards,
    tablePlacements: [],
    drawnCard: null,
    currentPlayerId: validStarter,
    previousPlayerId: null,
    lastChallenge: null,
    penalties: statePartial.penalties ?? Object.fromEntries(players.map((id) => [id, 0])),
    eliminatedPlayers: eliminated,
    winners: [],
  };
}

export function createDurianState(players: readonly string[], configInput: unknown = {}): DurianState {
  if (players.length < 2 || players.length > 7) throw new Error('Durian 需要 2 至 7 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) throw new Error('玩家列表无效');

  const config: DurianConfig = parseDurianConfig(configInput);
  const deck = (config.customDeck ?? buildDurianDeck()).map((card) => structuredClone(card));

  const state = prepareDurianRound(players, deck, 1, players[0]!, {
    maxRounds: config.maxRounds ?? 7,
    mode: config.mode ?? 'standard',
  });

  assertDurianInvariants(state);
  return state;
}

export function evaluateChallenge(state: DurianState, challengerId: string): ChallengeDetails {
  const accusedId = state.previousPlayerId;
  if (!accusedId) {
    throw new Error('当前没有可质疑的上家');
  }

  const { totals: tableTotals } = computeActiveTableTotals(state.tablePlacements);
  const stockTotals = computeStockTotals(state.foreheadCards);

  const oversoldFruits = DURIAN_FRUITS.filter((fruit) => tableTotals[fruit] > stockTotals[fruit]);
  const success = oversoldFruits.length > 0;
  const loserId = success ? accusedId : challengerId;
  const penaltyPoints = state.round;

  return {
    challengerId,
    accusedId,
    success,
    loserId,
    penaltyPoints,
    tableTotals,
    stockTotals,
    oversoldFruits,
  };
}

export function reduceDurianState(state: DurianState, actionInput: DurianAction | unknown): DurianReduceResult {
  let action: DurianAction;
  try {
    action = parseDurianAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  if (action.type === 'begin') return { ok: true, nextState: state, events: [] };
  if (state.phase === 'game_over') return deny('本局已经结束');
  if (!state.players.includes(action.playerId)) return deny('只有参局玩家可以操作');

  const next = structuredClone(state);
  const events: DurianEvent[] = [];

  // 物理按铃模拟动作（不影响游戏流程推进）
  if (action.type === 'ring_bell_sim') {
    events.push({ type: 'bell_rung_sim', playerId: action.playerId });
    return { ok: true, nextState: next, events };
  }

  if (action.type === 'draw_card') {
    if (state.phase !== 'turn_action') return deny('当前不能摸牌');
    if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');
    if (state.deck.length === 0) return deny('牌堆已空');

    const card = next.deck.shift()!;
    events.push({ type: 'card_drawn', playerId: action.playerId, cardKind: card.kind });

    if (card.kind === 'fruit') {
      next.drawnCard = card;
      next.phase = 'choose_placement';
    } else {
      // 猴子功能牌
      if (card.special === 'flip') {
        const hasFruit = next.tablePlacements.some((p) => p.kind === 'fruit');
        if (hasFruit) {
          next.drawnCard = card;
          next.phase = 'choose_flip';
        } else {
          // 桌上无水果牌时，直接打出无目标
          next.tablePlacements.push({
            kind: 'monkey',
            data: { placementId: `tp-${next.tablePlacements.length + 1}`, card, placedBy: action.playerId },
          });
          next.previousPlayerId = action.playerId;
          next.currentPlayerId = getNextAlivePlayer(next, action.playerId);
          next.phase = 'turn_action';
          events.push({ type: 'monkey_played', playerId: action.playerId, special: 'flip' });
        }
      } else {
        // do_nothing, three_void, banana_void
        next.tablePlacements.push({
          kind: 'monkey',
          data: { placementId: `tp-${next.tablePlacements.length + 1}`, card, placedBy: action.playerId },
        });
        next.previousPlayerId = action.playerId;
        next.currentPlayerId = getNextAlivePlayer(next, action.playerId);
        next.phase = 'turn_action';
        events.push({ type: 'monkey_played', playerId: action.playerId, special: card.special });
      }
    }
  } else if (action.type === 'place_fruit') {
    if (state.phase !== 'choose_placement' || !state.drawnCard || state.drawnCard.kind !== 'fruit') {
      return deny('当前不是放置水果卡牌阶段');
    }
    if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');

    const card = next.drawnCard as FruitCard;
    const checked = action.checkHalf === 'left' ? card.left : card.right;

    next.tablePlacements.push({
      kind: 'fruit',
      data: {
        placementId: `tp-${next.tablePlacements.length + 1}`,
        card,
        checkHalf: action.checkHalf,
        placedBy: action.playerId,
      },
    });
    next.drawnCard = null;
    next.previousPlayerId = action.playerId;
    next.currentPlayerId = getNextAlivePlayer(next, action.playerId);
    next.phase = 'turn_action';

    events.push({
      type: 'fruit_placed',
      playerId: action.playerId,
      checkFruit: checked.fruit,
      checkQuantity: checked.quantity,
    });
  } else if (action.type === 'select_flip_target') {
    if (state.phase !== 'choose_flip' || !state.drawnCard || state.drawnCard.kind !== 'monkey') {
      return deny('当前不是选择翻转卡牌阶段');
    }
    if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');

    const target = next.tablePlacements.find(
      (p) => p.kind === 'fruit' && p.data.placementId === action.targetPlacementId,
    );
    if (!target || target.kind !== 'fruit') return deny('选择的翻转目标无效');

    target.data.checkHalf = target.data.checkHalf === 'left' ? 'right' : 'left';

    const card = next.drawnCard as MonkeyCard;
    next.tablePlacements.push({
      kind: 'monkey',
      data: {
        placementId: `tp-${next.tablePlacements.length + 1}`,
        card,
        placedBy: action.playerId,
        targetPlacementId: action.targetPlacementId,
      },
    });

    next.drawnCard = null;
    next.previousPlayerId = action.playerId;
    next.currentPlayerId = getNextAlivePlayer(next, action.playerId);
    next.phase = 'turn_action';

    events.push({ type: 'card_flipped', playerId: action.playerId, targetPlacementId: action.targetPlacementId });
  } else if (action.type === 'challenge') {
    if (state.phase !== 'turn_action') return deny('当前不能质疑');
    if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');
    if (!state.previousPlayerId) return deny('当前没有可质疑的上家');

    const details = evaluateChallenge(state, action.playerId);
    next.lastChallenge = details;
    next.penalties[details.loserId] = (next.penalties[details.loserId] ?? 0) + details.penaltyPoints;

    events.push({
      type: 'challenge_resolved',
      challengerId: details.challengerId,
      accusedId: details.accusedId,
      success: details.success,
      loserId: details.loserId,
      penalty: details.penaltyPoints,
    });

    // 淘汰检查：累计扣分 > 7 淘汰
    if (next.penalties[details.loserId]! > 7 && !next.eliminatedPlayers.includes(details.loserId)) {
      next.eliminatedPlayers.push(details.loserId);
      events.push({ type: 'player_eliminated', playerId: details.loserId });
    }

    const alivePlayers = next.players.filter((id) => !next.eliminatedPlayers.includes(id));
    const isGameOver =
      next.round >= next.maxRounds ||
      alivePlayers.length <= 1 ||
      next.eliminatedPlayers.length === next.players.length;

    if (isGameOver) {
      next.phase = 'game_over';
      next.currentPlayerId = null;

      // 获胜者为存活玩家中扣分最少者（若都淘汰则所有人中扣分最少者）
      const candidatePool = alivePlayers.length > 0 ? alivePlayers : next.players;
      const minPenalty = Math.min(...candidatePool.map((id) => next.penalties[id]!));
      next.winners = candidatePool.filter((id) => next.penalties[id] === minPenalty);
      events.push({ type: 'game_finished', winners: [...next.winners] });
    } else {
      next.phase = 'challenge_result';
    }
  } else if (action.type === 'next_round') {
    if (state.phase !== 'challenge_result') return deny('当前不能开始下一轮');

    const lastLoser = state.lastChallenge?.loserId ?? state.currentPlayerId ?? state.players[0]!;
    const nextStarter = getNextAlivePlayer(state, lastLoser);
    const newDeck = buildDurianDeck();

    const prepared = prepareDurianRound(state.players, newDeck, state.round + 1, nextStarter, {
      maxRounds: state.maxRounds,
      mode: state.mode,
      penalties: state.penalties,
      eliminatedPlayers: state.eliminatedPlayers,
    });

    Object.assign(next, prepared);
    events.push({ type: 'round_started', round: next.round, starterId: nextStarter });
  }

  assertDurianInvariants(next);
  return { ok: true, nextState: next, events };
}

export function assertDurianInvariants(state: DurianState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.players.length < 2 || state.players.length > 7 || new Set(state.players).size !== state.players.length) {
    throw new Error('玩家列表无效');
  }
  if (!Number.isInteger(state.round) || state.round < 1) throw new Error('轮次无效');
  if (!Number.isInteger(state.maxRounds) || state.maxRounds < 1) throw new Error('最大轮次无效');
  if (state.mode !== 'standard' && state.mode !== 'simulator') throw new Error('游戏模式无效');

  for (const id of state.players) {
    if (!Number.isInteger(state.penalties[id]) || state.penalties[id]! < 0) {
      throw new Error('罚分记录无效');
    }
  }

  if (state.phase === 'game_over') {
    if (state.winners.length === 0) throw new Error('终局必须产生获胜者');
  }
}
