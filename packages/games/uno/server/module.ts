import {
  canObserve,
  dealCards,
  drawCards as drawZoneCards,
  moveCards,
  nextTurnParticipant,
  recycleDiscardKeepingTop,
  shuffleCards,
  type Actor,
  type CardMoveResult,
  type CardZoneState,
  type GameContext,
  type GameModule,
  type ReduceResult,
} from '@ldj/shared';
import { UNO_MANIFEST } from '../shared/manifest.ts';
import { pickUnoBotAction } from './bot.ts';
import { buildUnoBotPrompt } from './botPrompt.ts';

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';
export type UnoCard =
  | { id: string; kind: 'number'; color: UnoColor; value: number }
  | { id: string; kind: 'skip' | 'reverse' | 'draw2'; color: UnoColor }
  | { id: string; kind: 'wild' | 'wild4' };
export interface UnoConfig { variant: 'standard' }
export type UnoPhase = 'playing' | 'game_over';
export type UnoDirection = 1 | -1;
export interface UnoPlayerState { unoCalled: boolean }
export interface UnoLastPlayed {
  playerId: string;
  card: UnoCard;
  declaredColor: UnoColor | null;
  resultingColor: UnoColor;
}
export interface UnoResult { winnerId: string }
export interface UnoState {
  schemaVersion: 1;
  phase: UnoPhase;
  players: string[];
  deck: UnoCard[];
  discardPile: UnoCard[];
  hands: Record<string, UnoCard[]>;
  playerState: Record<string, UnoPlayerState>;
  currentPlayerId: string;
  direction: UnoDirection;
  currentColor: UnoColor;
  pendingDraw: number;
  hasDrawnThisTurn: boolean;
  winnerId: string | null;
  /** Optional for compatibility with snapshots created before this field existed. */
  lastPlayed?: UnoLastPlayed | null;
}
export type UnoAction =
  | { type: 'begin' }
  | { type: 'play_card'; cardId: string; declaredColor?: UnoColor }
  | { type: 'draw_card' }
  | { type: 'call_uno' }
  | { type: 'pass_after_draw' };
export interface UnoPlayerSummary {
  playerId: string;
  handCount: number;
  unoCalled: boolean;
  isCurrentPlayer: boolean;
}
export interface UnoPublicView {
  gameId: 'uno';
  phase: UnoPhase;
  players: UnoPlayerSummary[];
  topDiscard: UnoCard;
  currentColor: UnoColor;
  currentPlayerId: string;
  currentPlayerIndex: number;
  nextPlayerId: string;
  direction: UnoDirection;
  pendingDraw: number;
  winnerId: string | null;
  deckCount: number;
  discardCount: number;
  lastPlayed: UnoLastPlayed | null;
  lastPlayedCard: UnoCard | null;
  lastPlayedBy: string | null;
}
export interface UnoPlayerView extends UnoPublicView {
  me: {
    playerId: string;
    hand: UnoCard[];
    hasDrawnThisTurn: boolean;
    isCurrentPlayer: boolean;
    playableCardIds: string[];
  } | null;
}
export type UnoEvent =
  | { type: 'card_played'; playerId: string; card: UnoCard }
  | { type: 'card_drawn'; playerId: string; count: number }
  | { type: 'uno_called'; playerId: string }
  | { type: 'game_finished'; winnerId: string };
type Result = ReduceResult<UnoState, UnoEvent>;

const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

function deny(message: string): Result {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

function clone(state: UnoState): UnoState {
  return {
    ...state,
    deck: [...state.deck],
    discardPile: [...state.discardPile],
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]])),
    playerState: Object.fromEntries(Object.entries(state.playerState).map(([id, player]) => [id, { ...player }])),
    lastPlayed: state.lastPlayed ? { ...state.lastPlayed } : null,
  };
}

const DECK_ZONE = 'deck';
const DISCARD_ZONE = 'discardPile';

function handZone(playerId: string): string {
  return `hand:${playerId}`;
}

function toCardZones(
  deck: readonly UnoCard[],
  discardPile: readonly UnoCard[],
  hands: Readonly<Record<string, readonly UnoCard[]>>,
): CardZoneState<string, UnoCard> {
  return {
    zones: {
      [DECK_ZONE]: deck,
      [DISCARD_ZONE]: discardPile,
      ...Object.fromEntries(
        Object.entries(hands).map(([playerId, hand]) => [handZone(playerId), hand]),
      ),
    },
  };
}

function zoneCards(
  zones: CardZoneState<string, UnoCard>,
  zone: string,
): readonly UnoCard[] {
  const cards = zones.zones[zone];
  if (!cards) throw new Error(`UNO 缺少牌区：${zone}`);
  return cards;
}

function applyCardZones(state: UnoState, zones: CardZoneState<string, UnoCard>): void {
  state.deck = [...zoneCards(zones, DECK_ZONE)];
  state.discardPile = [...zoneCards(zones, DISCARD_ZONE)];
  state.hands = Object.fromEntries(
    state.players.map((playerId) => [playerId, [...zoneCards(zones, handZone(playerId))]]),
  );
}

function requireCardMove(
  result: CardMoveResult<string, UnoCard>,
  operation: string,
): Extract<CardMoveResult<string, UnoCard>, { readonly ok: true }> {
  if (!result.ok) throw new Error(`UNO ${operation}违反牌区不变量：${result.error}`);
  return result;
}

function actorPlayer(actor: Actor): string | null {
  return actor.kind === 'player' ? actor.playerId : null;
}

function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0`, kind: 'number', color, value: 0 });
    for (let copy = 1; copy <= 2; copy++) {
      for (let value = 1; value <= 9; value++) {
        deck.push({ id: `${color}-${value}-${copy}`, kind: 'number', color, value });
      }
      deck.push(
        { id: `${color}-skip-${copy}`, kind: 'skip', color },
        { id: `${color}-reverse-${copy}`, kind: 'reverse', color },
        { id: `${color}-draw2-${copy}`, kind: 'draw2', color },
      );
    }
  }
  for (let index = 1; index <= 4; index++) {
    deck.push({ id: `wild-${index}`, kind: 'wild' }, { id: `wild4-${index}`, kind: 'wild4' });
  }
  return deck;
}

function cardColor(card: UnoCard): UnoColor | null {
  return 'color' in card ? card.color : null;
}

function sameFace(a: UnoCard, b: UnoCard): boolean {
  return a.kind === b.kind
    && (a.kind !== 'number' || (b.kind === 'number' && a.value === b.value))
    && a.kind !== 'wild'
    && a.kind !== 'wild4';
}

function isPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  const color = cardColor(card);
  return card.kind === 'wild'
    || card.kind === 'wild4'
    || color === currentColor
    || color === cardColor(top)
    || sameFace(card, top);
}

function nextPlayer(state: UnoState, steps = 1): string {
  return nextTurnParticipant(state.players, state.currentPlayerId, {
    direction: state.direction,
    steps,
  });
}

function drawCards(
  state: UnoState,
  playerId: string,
  count: number,
  random: GameContext['random'],
): { state: UnoState; drawn: UnoCard[] } {
  const nextState = clone(state);
  const drawn: UnoCard[] = [];
  let zones = toCardZones(nextState.deck, nextState.discardPile, nextState.hands);

  for (let index = 0; index < count; index += 1) {
    if (zoneCards(zones, DECK_ZONE).length === 0) {
      const recycled = recycleDiscardKeepingTop(
        zones,
        DECK_ZONE,
        DISCARD_ZONE,
        random,
      );
      if (!recycled.ok) {
        if (recycled.error === 'NO_RECYCLABLE_CARDS') break;
        throw new Error(`UNO 回收违反牌区不变量：${recycled.error}`);
      }
      zones = recycled.state;
    }

    const moved = requireCardMove(
      drawZoneCards(zones, DECK_ZONE, handZone(playerId), 1),
      '摸牌',
    );
    zones = moved.state;
    drawn.push(...moved.cards);
  }

  applyCardZones(nextState, zones);
  return { state: nextState, drawn };
}

function resetUnoIfNeeded(state: UnoState, playerId: string): void {
  if ((state.hands[playerId]?.length ?? 0) !== 1) {
    state.playerState[playerId] = { unoCalled: false };
  }
}

function publicView(state: UnoState): UnoPublicView {
  const currentPlayerIndex = Math.max(0, state.players.indexOf(state.currentPlayerId));
  const lastPlayed = state.lastPlayed ?? null;
  return {
    gameId: 'uno',
    phase: state.phase,
    players: state.players.map((playerId) => ({
      playerId,
      handCount: state.hands[playerId]?.length ?? 0,
      unoCalled: state.playerState[playerId]?.unoCalled ?? false,
      isCurrentPlayer: playerId === state.currentPlayerId,
    })),
    topDiscard: state.discardPile.at(-1)!,
    currentColor: state.currentColor,
    currentPlayerId: state.currentPlayerId,
    currentPlayerIndex,
    nextPlayerId: nextPlayer(state),
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    winnerId: state.winnerId,
    deckCount: state.deck.length,
    discardCount: state.discardPile.length,
    lastPlayed,
    lastPlayedCard: lastPlayed?.card ?? null,
    lastPlayedBy: lastPlayed?.playerId ?? null,
  };
}

function parseColor(value: unknown): UnoColor | undefined {
  return COLORS.includes(value as UnoColor) ? value as UnoColor : undefined;
}

export const unoModule: GameModule<
  UnoConfig,
  UnoState,
  UnoAction,
  UnoPlayerView,
  UnoPublicView,
  UnoEvent,
  UnoResult
> = {
  manifest: UNO_MANIFEST,
  parseConfig(): UnoConfig {
    return { variant: 'standard' };
  },
  parseAction(input: unknown): UnoAction {
    if (typeof input !== 'object' || input === null || !('type' in input)) {
      throw new Error('Invalid UNO action');
    }
    const raw = input as Record<string, unknown>;
    if (raw.type === 'begin' || raw.type === 'draw_card' || raw.type === 'call_uno' || raw.type === 'pass_after_draw') {
      return { type: raw.type };
    }
    if (raw.type === 'play_card' && typeof raw.cardId === 'string') {
      const declaredColor = parseColor(raw.declaredColor);
      return declaredColor
        ? { type: 'play_card', cardId: raw.cardId, declaredColor }
        : { type: 'play_card', cardId: raw.cardId };
    }
    throw new Error('Invalid UNO action');
  },
  createInitialState(ctx: GameContext, players: string[]): UnoState {
    if (players.length < UNO_MANIFEST.minPlayers || players.length > UNO_MANIFEST.maxPlayers) {
      throw new Error('UNO 人数不合法');
    }
    if (new Set(players).size !== players.length) throw new Error('UNO 玩家不能重复');
    const shuffledDeck = shuffleCards(buildDeck(), ctx.random);
    const emptyHands: Record<string, UnoCard[]> = Object.fromEntries(
      players.map((id) => [id, []]),
    );
    let zones = toCardZones(shuffledDeck, [], emptyHands);
    zones = requireCardMove(
      dealCards(zones, DECK_ZONE, players.map(handZone), 7),
      '初始发牌',
    ).state;

    const deckAfterDeal = zoneCards(zones, DECK_ZONE);
    let firstIndex = deckAfterDeal.findIndex((card) => card.kind === 'number');
    if (firstIndex < 0) firstIndex = 0;
    const first = deckAfterDeal[firstIndex]!;
    zones = requireCardMove(
      moveCards(zones, DECK_ZONE, DISCARD_ZONE, [first.id]),
      '建立首弃牌',
    ).state;

    return {
      schemaVersion: 1,
      phase: 'playing',
      players: [...players],
      deck: [...zoneCards(zones, DECK_ZONE)],
      discardPile: [...zoneCards(zones, DISCARD_ZONE)],
      hands: Object.fromEntries(
        players.map((playerId) => [playerId, [...zoneCards(zones, handZone(playerId))]]),
      ),
      playerState: Object.fromEntries(players.map((id) => [id, { unoCalled: false }])),
      currentPlayerId: players[0]!,
      direction: 1,
      currentColor: cardColor(first) ?? 'red',
      pendingDraw: 0,
      hasDrawnThisTurn: false,
      winnerId: null,
      lastPlayed: null,
    };
  },
  reduce(ctx: GameContext, state: UnoState, actor: Actor, action: UnoAction): Result {
    // The generic session layer can replay begin during retries/recovery. Keep it idempotent.
    if (action.type === 'begin') return { ok: true, state, events: [], effects: [] };
    if (state.phase === 'game_over') return deny('本局已经结束');

    const playerId = actorPlayer(actor);
    if (!playerId || !state.players.includes(playerId)) return deny('只有参局玩家可以操作');

    if (action.type === 'call_uno') {
      if ((state.hands[playerId]?.length ?? 0) !== 1) return deny('只剩 1 张牌时才能喊 UNO');
      const nextState = clone(state);
      nextState.playerState[playerId] = { unoCalled: true };
      return { ok: true, state: nextState, events: [{ type: 'uno_called', playerId }], effects: [] };
    }

    if (playerId !== state.currentPlayerId) return deny('还没轮到你');

    if (action.type === 'draw_card') {
      if (state.hasDrawnThisTurn && state.pendingDraw === 0) return deny('本回合已经摸过牌');
      const count = state.pendingDraw > 0 ? state.pendingDraw : 1;
      const { state: nextState, drawn } = drawCards(state, playerId, count, ctx.random);
      nextState.pendingDraw = 0;
      nextState.hasDrawnThisTurn = state.pendingDraw === 0;
      if (state.pendingDraw > 0) {
        resetUnoIfNeeded(nextState, playerId);
        nextState.currentPlayerId = nextPlayer(nextState);
        nextState.hasDrawnThisTurn = false;
      }
      return {
        ok: true,
        state: nextState,
        events: [{ type: 'card_drawn', playerId, count: drawn.length }],
        effects: [],
      };
    }

    if (action.type === 'pass_after_draw') {
      if (!state.hasDrawnThisTurn) return deny('摸牌后才能跳过');
      const nextState = clone(state);
      resetUnoIfNeeded(nextState, playerId);
      nextState.currentPlayerId = nextPlayer(nextState);
      nextState.hasDrawnThisTurn = false;
      return { ok: true, state: nextState, events: [], effects: [] };
    }

    if (action.type === 'play_card') {
      if (state.pendingDraw > 0) return deny('需要先摸罚牌');
      const hand = state.hands[playerId] ?? [];
      const card = hand.find((candidate) => candidate.id === action.cardId);
      if (!card) return deny('手牌中没有这张牌');
      const top = state.discardPile.at(-1)!;
      if (!isPlayable(card, top, state.currentColor)) return deny('这张牌现在不能出');
      if ((card.kind === 'wild' || card.kind === 'wild4') && !action.declaredColor) {
        return deny('万能牌需要指定颜色');
      }

      const nextState = clone(state);
      const moved = requireCardMove(
        moveCards(
          toCardZones(nextState.deck, nextState.discardPile, nextState.hands),
          handZone(playerId),
          DISCARD_ZONE,
          [card.id],
        ),
        '出牌',
      );
      applyCardZones(nextState, moved.state);
      nextState.currentColor = action.declaredColor ?? cardColor(card)!;
      nextState.lastPlayed = {
        playerId,
        card,
        declaredColor: action.declaredColor ?? null,
        resultingColor: nextState.currentColor,
      };
      nextState.hasDrawnThisTurn = false;
      resetUnoIfNeeded(nextState, playerId);
      const events: UnoEvent[] = [{ type: 'card_played', playerId, card }];

      if (nextState.hands[playerId]!.length === 0) {
        nextState.phase = 'game_over';
        nextState.winnerId = playerId;
        events.push({ type: 'game_finished', winnerId: playerId });
        return { ok: true, state: nextState, events, effects: [] };
      }

      if (card.kind === 'reverse') {
        nextState.direction = nextState.direction === 1 ? -1 : 1;
        nextState.currentPlayerId = nextPlayer(nextState, nextState.players.length === 2 ? 2 : 1);
      } else if (card.kind === 'skip') {
        nextState.currentPlayerId = nextPlayer(nextState, 2);
      } else if (card.kind === 'draw2') {
        nextState.pendingDraw = 2;
        nextState.currentPlayerId = nextPlayer(nextState);
      } else if (card.kind === 'wild4') {
        nextState.pendingDraw = 4;
        nextState.currentPlayerId = nextPlayer(nextState);
      } else {
        nextState.currentPlayerId = nextPlayer(nextState);
      }
      return { ok: true, state: nextState, events, effects: [] };
    }

    return deny('未知动作');
  },
  getPlayerView(state: UnoState, playerId: string): UnoPlayerView {
    const recipient = { role: 'participant' as const, playerId, revealed: state.phase === 'game_over' };
    const ownsPrivateView = canObserve('owner_only', recipient, playerId)
      && state.players.includes(playerId);
    const hand = ownsPrivateView ? state.hands[playerId] ?? [] : [];
    const top = state.discardPile.at(-1)!;
    return {
      ...publicView(state),
      me: ownsPrivateView
        ? {
            playerId,
            hand,
            hasDrawnThisTurn: state.hasDrawnThisTurn,
            isCurrentPlayer: state.currentPlayerId === playerId,
            playableCardIds: state.pendingDraw > 0
              ? []
              : hand.filter((card) => isPlayable(card, top, state.currentColor)).map((card) => card.id),
          }
        : null,
    };
  },
  getSpectatorView(state: UnoState): UnoPublicView {
    return publicView(state);
  },
  getResult(state: UnoState): UnoResult | null {
    return state.winnerId ? { winnerId: state.winnerId } : null;
  },
  pickBotAction(input) {
    return pickUnoBotAction(input);
  },
  buildBotPrompt(input) {
    return buildUnoBotPrompt(input);
  },
};
