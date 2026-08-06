/**
 * uno_platform_house_v1 — 牌堆纯函数（无 I/O）。
 *
 * 覆盖 UNO-HOUSE-DECK-001..004：
 * - 每代 108 张唯一牌（r<round>:g<generation>:<baseId>）；
 * - 空牌堆时保留顶牌并回收其余弃牌；
 * - 仍不足时补发完整 108 张新 generation 并洗入可用牌池；
 * - 新回合重置回单代牌堆（由模块在回合边界调用 buildUnoHouseDeck(round, 0)）。
 */
import {
  dealCards,
  drawCards,
  recycleDiscardKeepingTop,
  shuffleCards,
  type CardZoneState,
  type RandomSource,
} from '@ldj/shared';
import type {
  UnoHouseCard,
  UnoHouseColor,
  UnoHouseRoundState,
} from './types.ts';

export const UNO_HOUSE_GENERATION_SIZE = 108;
export const UNO_HOUSE_HAND_SIZE = 7;

const DECK_ZONE = 'deck';
const DISCARD_ZONE = 'discardPile';
const COLORS: readonly UnoHouseColor[] = ['red', 'yellow', 'green', 'blue'];

export function handZone(playerId: string): string {
  return `hand:${playerId}`;
}

function zoneCards(
  zones: CardZoneState<string, UnoHouseCard>,
  zone: string,
): readonly UnoHouseCard[] {
  const cards = zones.zones[zone];
  if (!cards) throw new Error(`UNO house 缺少牌区：${zone}`);
  return cards;
}

/**
 * 构建一整代 108 张标准牌：每色 19 张号码牌（1 个 0 + 每个 1..9 两张）
 * + 6 张行动牌（skip/reverse/draw2 各两张）+ 4 wild + 4 wild4。
 * id 形如 `r${roundNumber}:g${generation}:${baseId}`，跨代/跨回合均唯一。
 */
export function buildUnoHouseDeck(roundNumber: number, generation: number): UnoHouseCard[] {
  const cards: UnoHouseCard[] = [];
  const id = (base: string): string => `r${roundNumber}:g${generation}:${base}`;
  for (const color of COLORS) {
    cards.push({ id: id(`${color}-0`), kind: 'number', color, value: 0 });
    for (let copy = 1; copy <= 2; copy += 1) {
      for (let value = 1; value <= 9; value += 1) {
        cards.push({ id: id(`${color}-${value}-${copy}`), kind: 'number', color, value });
      }
      cards.push(
        { id: id(`${color}-skip-${copy}`), kind: 'skip', color },
        { id: id(`${color}-reverse-${copy}`), kind: 'reverse', color },
        { id: id(`${color}-draw2-${copy}`), kind: 'draw2', color },
      );
    }
  }
  for (let index = 1; index <= 4; index += 1) {
    cards.push({ id: id(`wild-${index}`), kind: 'wild' }, { id: id(`wild4-${index}`), kind: 'wild4' });
  }
  return cards;
}

export function cardColor(card: UnoHouseCard): UnoHouseColor | null {
  return 'color' in card ? card.color : null;
}

export function isWild(card: UnoHouseCard): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

export function isPenaltyCard(card: UnoHouseCard): 'draw2' | 'wild4' | null {
  if (card.kind === 'draw2') return 'draw2';
  if (card.kind === 'wild4') return 'wild4';
  return null;
}

export function cardScore(card: UnoHouseCard): number {
  switch (card.kind) {
    case 'number':
      return card.value;
    case 'skip':
    case 'reverse':
    case 'draw2':
      return 20;
    case 'wild':
    case 'wild4':
      return 50;
  }
}

function sameFace(a: UnoHouseCard, b: UnoHouseCard): boolean {
  return a.kind === b.kind
    && (a.kind !== 'number' || (b.kind === 'number' && a.value === b.value))
    && a.kind !== 'wild'
    && a.kind !== 'wild4';
}

/** 合法出牌：同色 / 同面 / 万能牌（对应 legacy 出牌判定核心，UNO-HOUSE-BASE-001）。 */
export function isLegalPlay(
  card: UnoHouseCard,
  topDiscard: UnoHouseCard,
  currentColor: UnoHouseColor,
): boolean {
  const color = cardColor(card);
  return isWild(card)
    || color === currentColor
    || color === cardColor(topDiscard)
    || sameFace(card, topDiscard);
}

/** 把 round 状态映射为 CardZoneState：deck / discardPile / hand:<playerId>。 */
export function createHouseZones(round: UnoHouseRoundState): CardZoneState<string, UnoHouseCard> {
  return {
    zones: {
      [DECK_ZONE]: round.deck,
      [DISCARD_ZONE]: round.discardPile,
      ...Object.fromEntries(
        round.players.map((playerId) => [handZone(playerId), round.hands[playerId] ?? []]),
      ),
    },
  };
}

/** 共享 recycleDiscardKeepingTop 的 house 包装：失败即抛不变量错误。 */
export function recycleKeepTop(
  zones: CardZoneState<string, UnoHouseCard>,
  random: Pick<RandomSource, 'shuffle'>,
): CardZoneState<string, UnoHouseCard> {
  const result = recycleDiscardKeepingTop(zones, DECK_ZONE, DISCARD_ZONE, random);
  if (!result.ok) throw new Error(`UNO house 回收违反牌区不变量：${result.error}`);
  return result.state;
}

/** 共享 dealCards 的 house 包装：每人 7 张，失败即抛不变量错误。 */
export function dealInitialHands(
  zones: CardZoneState<string, UnoHouseCard>,
  players: readonly string[],
): CardZoneState<string, UnoHouseCard> {
  const result = dealCards(zones, DECK_ZONE, players.map(handZone), UNO_HOUSE_HAND_SIZE);
  if (!result.ok) throw new Error(`UNO house 初始发牌违反牌区不变量：${result.error}`);
  return result.state;
}

function generationOf(cardId: string, roundNumber: number): number {
  const prefix = `r${roundNumber}:g`;
  if (!cardId.startsWith(prefix)) return -1;
  const rest = cardId.slice(prefix.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return -1;
  const parsed = Number.parseInt(rest.slice(0, colon), 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

function maxGeneration(zones: CardZoneState<string, UnoHouseCard>, roundNumber: number): number {
  let max = -1;
  for (const cards of Object.values(zones.zones)) {
    for (const card of cards) {
      max = Math.max(max, generationOf(card.id, roundNumber));
    }
  }
  return max;
}

export interface DrawWithExpansionResult {
  readonly zones: CardZoneState<string, UnoHouseCard>;
  readonly drawn: readonly UnoHouseCard[];
  readonly deckGenerationsUsed: number;
}

/**
 * 带动态补牌的摸牌（UNO-HOUSE-DECK-002/003/004）：
 * 1) 从牌堆摸 count 张；
 * 2) 牌堆空时先回收弃牌（保留顶牌）再摸；
 * 3) 仍不足时补发一整代 108 张唯一牌并洗入可用牌池，重复直到满足；
 * 4) 无法满足（非法数量等）时抛不变量错误。
 */
export function drawWithExpansion(
  zones: CardZoneState<string, UnoHouseCard>,
  playerId: string,
  count: number,
  random: RandomSource,
  roundNumber: number,
): DrawWithExpansionResult {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`UNO house 摸牌数量不合法：${count}`);
  }
  let current: CardZoneState<string, UnoHouseCard> = { ...zones, zones: { ...zones.zones } };
  const drawn: UnoHouseCard[] = [];
  const destination = handZone(playerId);
  let remaining = count;
  let deckGenerationsUsed = 0;

  while (remaining > 0) {
    if (zoneCards(current, DECK_ZONE).length === 0) {
      const recycled = recycleDiscardKeepingTop(current, DECK_ZONE, DISCARD_ZONE, random);
      if (recycled.ok) {
        current = recycled.state;
      } else if (recycled.error === 'NO_RECYCLABLE_CARDS') {
        // 弃牌区只剩顶牌，无法回收；落到下方补发 generation。
      } else {
        throw new Error(`UNO house 回收违反牌区不变量：${recycled.error}`);
      }
    }

    if (zoneCards(current, DECK_ZONE).length === 0) {
      const nextGeneration = maxGeneration(current, roundNumber) + 1;
      const pool = [...zoneCards(current, DECK_ZONE), ...buildUnoHouseDeck(roundNumber, nextGeneration)];
      current = {
        ...current,
        zones: { ...current.zones, [DECK_ZONE]: shuffleCards(pool, random) },
      };
      deckGenerationsUsed += 1;
      if (pool.length === 0) {
        throw new Error('UNO house 无法补牌：新增 generation 为空');
      }
    }

    const take = Math.min(remaining, zoneCards(current, DECK_ZONE).length);
    const moved = drawCards(current, DECK_ZONE, destination, take);
    if (!moved.ok) throw new Error(`UNO house 摸牌违反牌区不变量：${moved.error}`);
    current = moved.state;
    drawn.push(...moved.cards);
    remaining -= take;
  }

  return { zones: current, drawn, deckGenerationsUsed };
}
