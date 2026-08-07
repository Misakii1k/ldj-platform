/** landlord_platform_v1 — 纯类型声明（LOC 测量排除）。 */
import type { LandlordCard, LandlordCombo } from '../cards.ts';

export type PlatformPhase = 'bidding' | 'playing' | 'game_over';

export interface PlatformBid {
  playerId: string;
  score: 0 | 1 | 2 | 3;
}

export interface PlatformConfig {
  variant: 'standard';
}

export interface PlatformTrick {
  playerId: string;
  combo: LandlordCombo;
}

export interface PlatformState {
  schemaVersion: 1;
  phase: PlatformPhase;
  players: string[];
  hands: Record<string, LandlordCard[]>;
  bottomCards: LandlordCard[];
  bids: PlatformBid[];
  currentBidderId: string | null;
  landlordId: string | null;
  currentPlayerId: string | null;
  currentTrick: PlatformTrick | null;
  passCount: number;
  multiplier: number;
  winnerTeam: 'landlord' | 'farmers' | null;
  winnerId: string | null;
  deadlineAt: number | null;
  phaseToken: string | null;
  aborted: boolean;
}

export type PlatformAction =
  | { type: 'begin' }
  | { type: 'bid_score'; score: 0 | 1 | 2 | 3 }
  | { type: 'play_combo'; cardIds: string[] }
  | { type: 'pass_turn' }
  | { type: 'phase_timeout'; phase: 'bidding' | 'playing'; token: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export interface PlatformPublicView {
  gameId: 'landlord';
  rulesetId: 'landlord_platform_v1';
  schemaVersion: 1;
  phase: PlatformPhase;
  players: { playerId: string; handCount: number }[];
  /** 底牌仅在房主（地主）的玩家视角中可见；其余视角恒为空数组。 */
  bottomCards: LandlordCard[];
  bids: PlatformBid[];
  currentBidderId: string | null;
  landlordId: string | null;
  currentPlayerId: string | null;
  currentTrick: PlatformTrick | null;
  passCount: number;
  multiplier: number;
  winnerTeam: PlatformState['winnerTeam'];
  winnerId: string | null;
  deadlineAt: number | null;
  aborted: boolean;
}

export interface PlatformPlayerView extends PlatformPublicView {
  me: { playerId: string; hand: LandlordCard[] } | null;
}

export type PlatformResult =
  | { winnerTeam: 'landlord' | 'farmers'; winnerId: string; aborted?: false }
  | { winnerTeam: null; winnerId: null; aborted: true };

export type PlatformEvent =
  | { type: 'bid'; playerId: string; score: 0 | 1 | 2 | 3 }
  | { type: 'landlord_decided'; playerId: string }
  | { type: 'combo_played'; playerId: string; combo: LandlordCombo }
  | { type: 'passed'; playerId: string }
  | { type: 'game_finished'; winnerTeam: 'landlord' | 'farmers'; winnerId: string }
  | { type: 'game_aborted'; reason: 'player_forfeited' };
