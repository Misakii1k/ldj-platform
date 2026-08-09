export const LOVELETTER_ROLES = [
  'guard',
  'priest',
  'baron',
  'handmaid',
  'prince',
  'king',
  'countess',
  'princess',
] as const;

export type LoveLetterRole = (typeof LOVELETTER_ROLES)[number];
export type LoveLetterPhase = 'playing' | 'game_over';

export interface LoveLetterCard {
  id: string;
  role: LoveLetterRole;
  value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export interface LoveLetterConfig {
  rulesetId?: 'loveletter_classic16_v1';
  deckOrder?: LoveLetterCard[];
  futureDeckOrders?: LoveLetterCard[][];
}

export interface Inspection {
  viewerId: string;
  targetPlayerId: string;
  role: LoveLetterRole;
  round: number;
}

export interface LoveLetterState {
  schemaVersion: 1;
  phase: LoveLetterPhase;
  players: string[];
  round: number;
  deck: LoveLetterCard[];
  reserveCard: LoveLetterCard | null;
  removedCards: LoveLetterCard[];
  hands: Record<string, LoveLetterCard[]>;
  discardPiles: Record<string, LoveLetterCard[]>;
  eliminatedPlayers: string[];
  protectedPlayers: string[];
  currentPlayerId: string | null;
  affection: Record<string, number>;
  affectionTarget: number;
  inspections: Inspection[];
  roundWinners: string[];
  winners: string[];
  futureDeckOrders: LoveLetterCard[][];
}

export interface PlayCardAction {
  type: 'play_card';
  playerId: string;
  cardId: string;
  targetPlayerId?: string;
  guessedRole?: LoveLetterRole;
}

export type LoveLetterAction = PlayCardAction;

export type LoveLetterEvent =
  | { type: 'card_played'; playerId: string; role: LoveLetterRole }
  | { type: 'player_eliminated'; playerId: string; reason: LoveLetterRole }
  | { type: 'player_protected'; playerId: string }
  | { type: 'hands_swapped'; playerIds: [string, string] }
  | { type: 'hand_inspected'; viewerId: string; targetPlayerId: string }
  | { type: 'round_finished'; winners: string[] }
  | { type: 'round_started'; round: number; currentPlayerId: string }
  | { type: 'game_finished'; winners: string[] };

export type LoveLetterReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: LoveLetterState; events: LoveLetterEvent[] };

export interface LoveLetterPublicView {
  gameId: 'loveletter';
  rulesetId: 'loveletter_classic16_v1';
  schemaVersion: 1;
  phase: LoveLetterPhase;
  players: { playerId: string; handCount: number; discarded: LoveLetterCard[] }[];
  round: number;
  deckCount: number;
  removedCards: LoveLetterCard[];
  eliminatedPlayers: string[];
  protectedPlayers: string[];
  currentPlayerId: string | null;
  affection: Record<string, number>;
  affectionTarget: number;
  roundWinners: string[];
  winners: string[];
}

export interface LoveLetterPlayerView extends LoveLetterPublicView {
  me: { playerId: string; hand: LoveLetterCard[]; inspections: Inspection[] } | null;
}

export interface LoveLetterResult {
  winners: string[];
  affection: Record<string, number>;
}
