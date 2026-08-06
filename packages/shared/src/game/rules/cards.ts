import type { RandomSource } from '../contract.ts';

export interface CardDefinition {
  readonly id: string;
  readonly count: number;
}

export interface IdentifiedCard {
  readonly id: string;
}

export interface CardInstance extends IdentifiedCard {
  readonly definitionId: string;
}

export interface CardZoneState<
  Zone extends string = string,
  Card extends IdentifiedCard = CardInstance,
> {
  readonly zones: Readonly<Record<Zone, readonly Card[]>>;
}

export type CardMoveError =
  | 'ZONE_NOT_FOUND'
  | 'SAME_ZONE'
  | 'EMPTY_REQUEST'
  | 'INVALID_COUNT'
  | 'EMPTY_ZONE'
  | 'INSUFFICIENT_CARDS'
  | 'CARD_NOT_FOUND'
  | 'DUPLICATE_REQUESTED_CARD'
  | 'DUPLICATE_CARD_ID'
  | 'DUPLICATE_DESTINATION'
  | 'DRAW_PILE_NOT_EMPTY'
  | 'NO_RECYCLABLE_CARDS';

export type CardMoveResult<Zone extends string, Card extends IdentifiedCard> =
  | { readonly ok: false; readonly error: CardMoveError }
  | {
      readonly ok: true;
      readonly state: CardZoneState<Zone, Card>;
      readonly cards: readonly Card[];
    };

function hasZone<Zone extends string, Card extends IdentifiedCard>(
  state: CardZoneState<Zone, Card>,
  zone: Zone,
): boolean {
  return Object.prototype.hasOwnProperty.call(state.zones, zone);
}

function hasUniqueCardIds<Zone extends string, Card extends IdentifiedCard>(
  state: CardZoneState<Zone, Card>,
): boolean {
  const ids = new Set<string>();
  for (const cards of Object.values(state.zones) as readonly (readonly Card[])[]) {
    for (const card of cards) {
      if (ids.has(card.id)) return false;
      ids.add(card.id);
    }
  }
  return true;
}

function invalidCount(count: number): boolean {
  return !Number.isSafeInteger(count) || count <= 0;
}

export function buildCardDeck(definitions: readonly CardDefinition[]): CardInstance[] {
  const definitionIds = new Set<string>();
  const cards: CardInstance[] = [];
  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) throw new Error(`卡牌定义 ID 重复：${definition.id}`);
    if (invalidCount(definition.count)) throw new RangeError('卡牌数量必须是正安全整数');
    definitionIds.add(definition.id);
    for (let copy = 1; copy <= definition.count; copy += 1) {
      cards.push({ id: `${definition.id}:${copy}`, definitionId: definition.id });
    }
  }
  return cards;
}

export function shuffleCards<Card>(
  cards: readonly Card[],
  random: Pick<RandomSource, 'shuffle'>,
): Card[] {
  return random.shuffle([...cards]);
}

export function drawCards<Zone extends string, Card extends IdentifiedCard>(
  state: CardZoneState<Zone, Card>,
  source: Zone,
  destination: Zone,
  count = 1,
): CardMoveResult<Zone, Card> {
  if (invalidCount(count)) return { ok: false, error: 'INVALID_COUNT' };
  if (!hasZone(state, source) || !hasZone(state, destination)) {
    return { ok: false, error: 'ZONE_NOT_FOUND' };
  }
  if (source === destination) return { ok: false, error: 'SAME_ZONE' };
  if (!hasUniqueCardIds(state)) return { ok: false, error: 'DUPLICATE_CARD_ID' };

  const sourceCards = state.zones[source];
  if (sourceCards.length === 0) return { ok: false, error: 'EMPTY_ZONE' };
  if (sourceCards.length < count) return { ok: false, error: 'INSUFFICIENT_CARDS' };
  return moveCards(
    state,
    source,
    destination,
    sourceCards.slice(0, count).map((card) => card.id),
  );
}

export function moveCards<Zone extends string, Card extends IdentifiedCard>(
  state: CardZoneState<Zone, Card>,
  source: Zone,
  destination: Zone,
  cardIds: readonly string[],
): CardMoveResult<Zone, Card> {
  if (!hasZone(state, source) || !hasZone(state, destination)) {
    return { ok: false, error: 'ZONE_NOT_FOUND' };
  }
  if (source === destination) return { ok: false, error: 'SAME_ZONE' };
  if (cardIds.length === 0) return { ok: false, error: 'EMPTY_REQUEST' };
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: 'DUPLICATE_REQUESTED_CARD' };
  }
  if (!hasUniqueCardIds(state)) return { ok: false, error: 'DUPLICATE_CARD_ID' };

  const sourceCards = state.zones[source];
  const cards = cardIds.map((id) => sourceCards.find((card) => card.id === id));
  if (cards.some((card) => card === undefined)) return { ok: false, error: 'CARD_NOT_FOUND' };

  const movedCards = cards as Card[];
  const requestedIds = new Set(cardIds);
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

export function dealCards<Zone extends string, Card extends IdentifiedCard>(
  state: CardZoneState<Zone, Card>,
  source: Zone,
  destinations: readonly Zone[],
  countPerDestination: number,
): CardMoveResult<Zone, Card> {
  if (invalidCount(countPerDestination)) return { ok: false, error: 'INVALID_COUNT' };
  if (destinations.length === 0) return { ok: false, error: 'EMPTY_REQUEST' };
  if (!hasZone(state, source) || destinations.some((zone) => !hasZone(state, zone))) {
    return { ok: false, error: 'ZONE_NOT_FOUND' };
  }
  if (destinations.some((zone) => zone === source)) return { ok: false, error: 'SAME_ZONE' };
  if (new Set(destinations).size !== destinations.length) {
    return { ok: false, error: 'DUPLICATE_DESTINATION' };
  }
  if (!hasUniqueCardIds(state)) return { ok: false, error: 'DUPLICATE_CARD_ID' };

  const total = destinations.length * countPerDestination;
  if (!Number.isSafeInteger(total)) return { ok: false, error: 'INVALID_COUNT' };
  const sourceCards = state.zones[source];
  if (sourceCards.length < total) return { ok: false, error: 'INSUFFICIENT_CARDS' };

  const dealt = sourceCards.slice(0, total);
  const additions = new Map<Zone, Card[]>(destinations.map((zone) => [zone, []]));
  for (let round = 0; round < countPerDestination; round += 1) {
    for (let index = 0; index < destinations.length; index += 1) {
      additions.get(destinations[index]!)!.push(dealt[round * destinations.length + index]!);
    }
  }

  const zones = { ...state.zones } as Record<Zone, readonly Card[]>;
  zones[source] = sourceCards.slice(total);
  for (const destination of destinations) {
    zones[destination] = [...state.zones[destination], ...additions.get(destination)!];
  }

  return { ok: true, state: { zones }, cards: dealt };
}

export function recycleDiscardKeepingTop<
  Zone extends string,
  Card extends IdentifiedCard,
>(
  state: CardZoneState<Zone, Card>,
  drawPile: Zone,
  discardPile: Zone,
  random: Pick<RandomSource, 'shuffle'>,
): CardMoveResult<Zone, Card> {
  if (!hasZone(state, drawPile) || !hasZone(state, discardPile)) {
    return { ok: false, error: 'ZONE_NOT_FOUND' };
  }
  if (drawPile === discardPile) return { ok: false, error: 'SAME_ZONE' };
  if (!hasUniqueCardIds(state)) return { ok: false, error: 'DUPLICATE_CARD_ID' };

  const drawCards = state.zones[drawPile];
  const discarded = state.zones[discardPile];
  if (drawCards.length > 0) return { ok: false, error: 'DRAW_PILE_NOT_EMPTY' };
  if (discarded.length === 0) return { ok: false, error: 'EMPTY_ZONE' };
  if (discarded.length === 1) return { ok: false, error: 'NO_RECYCLABLE_CARDS' };

  const top = discarded.at(-1)!;
  const recycled = shuffleCards(discarded.slice(0, -1), random);
  return {
    ok: true,
    state: {
      zones: {
        ...state.zones,
        [drawPile]: recycled,
        [discardPile]: [top],
      },
    },
    cards: recycled,
  };
}
