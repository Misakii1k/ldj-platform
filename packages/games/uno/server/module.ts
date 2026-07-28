import type { Actor, GameContext, GameModule, ReduceResult } from '@ldj/shared';
import { UNO_MANIFEST } from '../shared/manifest.ts';

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';
export type UnoCard =
  | { id: string; kind: 'number'; color: UnoColor; value: number }
  | { id: string; kind: 'skip' | 'reverse' | 'draw2'; color: UnoColor }
  | { id: string; kind: 'wild' | 'wild4' };
export interface UnoConfig { variant: 'standard' }
export type UnoPhase = 'playing' | 'game_over';
export type UnoDirection = 1 | -1;
export interface UnoPlayerState { unoCalled: boolean }
export interface UnoResult { winnerId: string }
export interface UnoState {
  schemaVersion: 1; phase: UnoPhase; players: string[];
  deck: UnoCard[]; discardPile: UnoCard[];
  hands: Record<string, UnoCard[]>;
  playerState: Record<string, UnoPlayerState>;
  currentPlayerId: string; direction: UnoDirection; currentColor: UnoColor;
  pendingDraw: number; hasDrawnThisTurn: boolean; winnerId: string | null;
}
export type UnoAction =
  | { type: 'begin' }
  | { type: 'play_card'; cardId: string; declaredColor?: UnoColor }
  | { type: 'draw_card' }
  | { type: 'call_uno' }
  | { type: 'pass_after_draw' };
export interface UnoPlayerSummary { playerId: string; handCount: number; unoCalled: boolean }
export interface UnoPublicView {
  gameId: 'uno'; phase: UnoPhase; players: UnoPlayerSummary[];
  topDiscard: UnoCard; currentColor: UnoColor; currentPlayerId: string;
  direction: UnoDirection; pendingDraw: number; winnerId: string | null;
}
export interface UnoPlayerView extends UnoPublicView { me: { playerId: string; hand: UnoCard[]; hasDrawnThisTurn: boolean } | null }
export type UnoEvent =
  | { type: 'card_played'; playerId: string; card: UnoCard }
  | { type: 'card_drawn'; playerId: string; count: number }
  | { type: 'uno_called'; playerId: string }
  | { type: 'game_finished'; winnerId: string };
type Result = ReduceResult<UnoState, UnoEvent>;
const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];
function deny(message: string): Result { return { ok: false, code: 'ACTION_NOT_ALLOWED', message }; }
function clone(state: UnoState): UnoState { return { ...state, deck: [...state.deck], discardPile: [...state.discardPile], hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]])), playerState: Object.fromEntries(Object.entries(state.playerState).map(([id, p]) => [id, { ...p }])) }; }
function actorPlayer(actor: Actor): string | null { return actor.kind === 'player' ? actor.playerId : null; }
function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0`, kind: 'number', color, value: 0 });
    for (let copy = 1; copy <= 2; copy++) {
      for (let value = 1; value <= 9; value++) deck.push({ id: `${color}-${value}-${copy}`, kind: 'number', color, value });
      deck.push({ id: `${color}-skip-${copy}`, kind: 'skip', color }, { id: `${color}-reverse-${copy}`, kind: 'reverse', color }, { id: `${color}-draw2-${copy}`, kind: 'draw2', color });
    }
  }
  for (let i = 1; i <= 4; i++) deck.push({ id: `wild-${i}`, kind: 'wild' }, { id: `wild4-${i}`, kind: 'wild4' });
  return deck;
}
function cardColor(card: UnoCard): UnoColor | null { return 'color' in card ? card.color : null; }
function sameFace(a: UnoCard, b: UnoCard): boolean { return a.kind === b.kind && (a.kind !== 'number' || (b.kind === 'number' && a.value === b.value)) && a.kind !== 'wild' && a.kind !== 'wild4'; }
function isPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean { const color = cardColor(card); return card.kind === 'wild' || card.kind === 'wild4' || color === currentColor || color === cardColor(top) || sameFace(card, top); }
function nextPlayer(state: UnoState, steps = 1): string { const at = state.players.indexOf(state.currentPlayerId); return state.players[(at + steps * state.direction + state.players.length * 10) % state.players.length]!; }
function drawCards(state: UnoState, playerId: string, count: number, random: GameContext['random']): { state: UnoState; drawn: UnoCard[] } {
  const s = clone(state); const drawn: UnoCard[] = []; let deck = [...s.deck]; let discard = [...s.discardPile];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && discard.length > 1) { const top = discard.at(-1)!; deck = random.shuffle(discard.slice(0, -1)); discard = [top]; }
    const card = deck.shift(); if (!card) break; drawn.push(card);
  }
  s.deck = deck; s.discardPile = discard; s.hands[playerId] = [...(s.hands[playerId] ?? []), ...drawn]; return { state: s, drawn };
}
function resetUnoIfNeeded(s: UnoState, playerId: string): void { if ((s.hands[playerId]?.length ?? 0) !== 1) s.playerState[playerId] = { unoCalled: false }; }
function publicView(state: UnoState): UnoPublicView { return { gameId: 'uno', phase: state.phase, players: state.players.map((playerId) => ({ playerId, handCount: state.hands[playerId]?.length ?? 0, unoCalled: state.playerState[playerId]?.unoCalled ?? false })), topDiscard: state.discardPile.at(-1)!, currentColor: state.currentColor, currentPlayerId: state.currentPlayerId, direction: state.direction, pendingDraw: state.pendingDraw, winnerId: state.winnerId }; }
function parseColor(value: unknown): UnoColor | undefined { return COLORS.includes(value as UnoColor) ? value as UnoColor : undefined; }
export const unoModule: GameModule<UnoConfig, UnoState, UnoAction, UnoPlayerView, UnoPublicView, UnoEvent, UnoResult> = {
  manifest: UNO_MANIFEST,
  parseConfig(): UnoConfig { return { variant: 'standard' }; },
  parseAction(input: unknown): UnoAction {
    if (typeof input !== 'object' || input === null || !('type' in input)) throw new Error('Invalid UNO action');
    const raw = input as Record<string, unknown>;
    if (raw.type === 'begin' || raw.type === 'draw_card' || raw.type === 'call_uno' || raw.type === 'pass_after_draw') return { type: raw.type };
    if (raw.type === 'play_card' && typeof raw.cardId === 'string') { const declaredColor = parseColor(raw.declaredColor); return declaredColor ? { type: 'play_card', cardId: raw.cardId, declaredColor } : { type: 'play_card', cardId: raw.cardId }; }
    throw new Error('Invalid UNO action');
  },
  createInitialState(ctx: GameContext, players: string[]): UnoState {
    if (players.length < UNO_MANIFEST.minPlayers || players.length > UNO_MANIFEST.maxPlayers) throw new Error('UNO 人数不合法');
    const deck = ctx.random.shuffle(buildDeck()); const hands: Record<string, UnoCard[]> = Object.fromEntries(players.map((id) => [id, []]));
    for (let round = 0; round < 7; round++) for (const playerId of players) hands[playerId]!.push(deck.shift()!);
    let firstIndex = deck.findIndex((card) => card.kind === 'number'); if (firstIndex < 0) firstIndex = 0; const [first] = deck.splice(firstIndex, 1);
    return { schemaVersion: 1, phase: 'playing', players: [...players], deck, discardPile: [first!], hands, playerState: Object.fromEntries(players.map((id) => [id, { unoCalled: false }])), currentPlayerId: players[0]!, direction: 1, currentColor: cardColor(first!) ?? 'red', pendingDraw: 0, hasDrawnThisTurn: false, winnerId: null };
  },
  reduce(ctx: GameContext, state: UnoState, actor: Actor, action: UnoAction): Result {
    if (action.type === 'begin') return { ok: true, state, events: [], effects: [] }; if (state.phase === 'game_over') return deny('本局已经结束');
    const playerId = actorPlayer(actor); if (!playerId || !state.players.includes(playerId)) return deny('只有参局玩家可以操作');
    if (action.type === 'call_uno') { if ((state.hands[playerId]?.length ?? 0) !== 1) return deny('只剩 1 张牌时才能喊 UNO'); const s = clone(state); s.playerState[playerId] = { unoCalled: true }; return { ok: true, state: s, events: [{ type: 'uno_called', playerId }], effects: [] }; }
    if (playerId !== state.currentPlayerId) return deny('还没轮到你');
    if (action.type === 'draw_card') { if (state.hasDrawnThisTurn && state.pendingDraw === 0) return deny('本回合已经摸过牌'); const count = state.pendingDraw > 0 ? state.pendingDraw : 1; const { state: s, drawn } = drawCards(state, playerId, count, ctx.random); s.pendingDraw = 0; s.hasDrawnThisTurn = state.pendingDraw === 0; if (state.pendingDraw > 0) { resetUnoIfNeeded(s, playerId); s.currentPlayerId = nextPlayer(s); s.hasDrawnThisTurn = false; } return { ok: true, state: s, events: [{ type: 'card_drawn', playerId, count: drawn.length }], effects: [] }; }
    if (action.type === 'pass_after_draw') { if (!state.hasDrawnThisTurn) return deny('摸牌后才能跳过'); const s = clone(state); resetUnoIfNeeded(s, playerId); s.currentPlayerId = nextPlayer(s); s.hasDrawnThisTurn = false; return { ok: true, state: s, events: [], effects: [] }; }
    if (action.type === 'play_card') {
      if (state.pendingDraw > 0) return deny('需要先摸罚牌'); const hand = state.hands[playerId] ?? []; const card = hand.find((c) => c.id === action.cardId); if (!card) return deny('手牌中没有这张牌'); const top = state.discardPile.at(-1)!; if (!isPlayable(card, top, state.currentColor)) return deny('这张牌现在不能出'); if ((card.kind === 'wild' || card.kind === 'wild4') && !action.declaredColor) return deny('万能牌需要指定颜色');
      const s = clone(state); s.hands[playerId] = s.hands[playerId]!.filter((c) => c.id !== card.id); s.discardPile = [...s.discardPile, card]; s.currentColor = action.declaredColor ?? cardColor(card)!; s.hasDrawnThisTurn = false; resetUnoIfNeeded(s, playerId); const events: UnoEvent[] = [{ type: 'card_played', playerId, card }];
      if (s.hands[playerId]!.length === 0) { s.phase = 'game_over'; s.winnerId = playerId; events.push({ type: 'game_finished', winnerId: playerId }); return { ok: true, state: s, events, effects: [] }; }
      if (card.kind === 'reverse') { s.direction = s.direction === 1 ? -1 : 1; s.currentPlayerId = nextPlayer(s, s.players.length === 2 ? 2 : 1); }
      else if (card.kind === 'skip') s.currentPlayerId = nextPlayer(s, 2); else if (card.kind === 'draw2') { s.pendingDraw = 2; s.currentPlayerId = nextPlayer(s); } else if (card.kind === 'wild4') { s.pendingDraw = 4; s.currentPlayerId = nextPlayer(s); } else s.currentPlayerId = nextPlayer(s);
      return { ok: true, state: s, events, effects: [] };
    }
    return deny('未知动作');
  },
  getPlayerView(state: UnoState, playerId: string): UnoPlayerView { return { ...publicView(state), me: state.players.includes(playerId) ? { playerId, hand: state.hands[playerId] ?? [], hasDrawnThisTurn: state.hasDrawnThisTurn } : null }; },
  getSpectatorView(state: UnoState): UnoPublicView { return publicView(state); },
  getResult(state: UnoState): UnoResult | null { return state.winnerId ? { winnerId: state.winnerId } : null; },
};



