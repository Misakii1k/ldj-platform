import type { RandomSource } from '../contract.ts';

export interface CardDefinition {
  readonly id: string;
  readonly count: number;
}

export interface CardInstance {
  readonly id: string;
  readonly definitionId: string;
}

export interface CardZoneState<Zone extends string = string, Card extends CardInstance = CardInstance> {
  readonly zones: Readonly<Record<Zone, readonly Card[]>>;
}

export type CardMoveError = 'EMPTY_ZONE' | 'INSUFFICIENT_CARDS' | 'CARD_NOT_FOUND' | 'DUPLICATE_CARD';

export type CardMoveResult<Zone extends string, Card extends CardInstance> =
  | { readonly ok: false; readonly error: CardMoveError }
  | { readonly ok: true; readonly state: CardZoneState<Zone, Card>; readonly cards: readonly Card[] };

export function buildCardDeck(definitions: readonly CardDefinition[]): CardInstance[] {
  const definitionIds = new Set<string>();
  const cards: CardInstance[] = [];
  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) throw new Error(`卡牌定义 ID 重复：${definition.id}`);
    if (!Number.isInteger(definition.count) || definition.count <= 0) throw new RangeError('卡牌数量必须是正整数');
    definitionIds.add(definition.id);
    for (let copy = 1; copy <= definition.count; copy += 1) {
      cards.push({ id: `${definition.id}:${copy}`, definitionId: definition.id });
    }
  }
  return cards;
}

export function shuffleCards<Card extends CardInstance>(
  cards: readonly Card[],
  random: Pick<RandomSource, 'shuffle'>,
): Card[] {
  return random.shuffle(cards);
}

export function drawCards<Zone extends string, Card extends CardInstance>(
  state: CardZoneState<Zone, Card>,
  source: Zone,
  destination: Zone,
  count = 1,
): CardMoveResult<Zone, Card> {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError('抽牌数量必须是正整数');
  const sourceCards = state.zones[source];
  if (sourceCards.length === 0) return { ok: false, error: 'EMPTY_ZONE' };
  if (sourceCards.length < count) return { ok: false, error: 'INSUFFICIENT_CARDS' };
  return moveCards(state, source, destination, sourceCards.slice(0, count).map((card) => card.id));
}

export function moveCards<Zone extends string, Card extends CardInstance>(
  state: CardZoneState<Zone, Card>,
  source: Zone,
  destination: Zone,
  cardIds: readonly string[],
): CardMoveResult<Zone, Card> {
  if (new Set(cardIds).size !== cardIds.length) return { ok: false, error: 'DUPLICATE_CARD' };
  const requestedIds = new Set(cardIds);
  const sourceCards = state.zones[source];
  const cards = cardIds.map((id) => sourceCards.find((card) => card.id === id));
  if (cards.some((card) => card === undefined)) return { ok: false, error: 'CARD_NOT_FOUND' };
  const movedCards = cards as Card[];
  if (source === destination) return { ok: true, state, cards: movedCards };
  return {
    ok: true,
    state: {
      zones: {
        ...state.zones,
        [source]: sourceCards.filter((card) => !requestedIds.has(card.id)),
        [destination]: [...state.zones[destination], ...movedCards],
      },
    },
    cards: movedCards,
  };
}
