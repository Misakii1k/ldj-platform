import type { TargetId, Slot, ChipId, GuessOrigin, ChipBet, BetPair, BoardTarget } from './board.ts';
import type { PlayerRoundLedger, PlayerRanking } from './scoring.ts';

export type { TargetId, Slot, ChipId, GuessOrigin, ChipBet, BetPair, BoardTarget };
export type { PlayerRoundLedger, PlayerRanking };

export type WitsWagersPhase =
  | 'created'
  | 'answering'
  | 'arranging'
  | 'betting'
  | 'settlement'
  | 'game_over';

export interface Guess {
  value: number;
  origin: GuessOrigin;
}

export interface Question {
  id: string;
  prompt: string;
  unit: string;
  answer: number;
  sourceUrl: string;
  sourceNote: string;
  asOf: string;
  explanation: string;
  reviewed: boolean;
}

export interface RoundResult {
  round: number;
  question: Question;
  board: BoardTarget[];
  bets: Record<string, BetPair>;
  winningTargetId: TargetId;
  awardedAuthors: string[];
  ledger: PlayerRoundLedger[];
}

export interface FinalResult {
  rankings: PlayerRanking[];
  winners: string[];
  roundsPlayed: 7;
}

export interface WitsWagersConfig {
  rulesetId?: 'wits_wagers_platform_v1';
  answerSeconds?: number;
  betSeconds?: number;
  arrangingSeconds?: number;
  settlementSeconds?: number;
}

export interface WitsWagersResolvedConfig {
  answerSeconds: number;
  betSeconds: number;
  /** 版图翻牌展示时长，需容纳客户端逐张翻面演出 */
  arrangingSeconds: number;
  /** 结算展示时长，需容纳银行收付与积分滚动演出 */
  settlementSeconds: number;
}

export interface WitsWagersState {
  schemaVersion: 1;
  rulesetId: 'wits_wagers_platform_v1';
  config: WitsWagersResolvedConfig;
  phase: WitsWagersPhase;
  round: number; // 0..7
  phaseEpoch: number;
  roundToken: string;
  deadlineAt: number | null;
  players: string[]; // 3..7
  forfeitedIds: string[];
  scores: Record<string, number>;
  winningGuesses: Record<string, number>;
  questionPlan: Question[]; // 7道题
  bankVersion?: string;
  guesses: Record<string, Guess | null>;
  guessRevisions: Record<string, number>;
  bets: Record<string, BetPair>;
  betRevisions: Record<string, number>;
  board: BoardTarget[];
  history: RoundResult[];
  result: FinalResult | null;
}

export type WitsWagersAction =
  | { type: 'submit_guess'; roundToken: string; expectedRevision: number; value: number }
  | { type: 'set_bets'; roundToken: string; expectedRevision: number; chips: BetPair }
  | { type: 'begin' }
  | { type: 'phase_timeout'; roundToken: string; phaseEpoch: number; phase: WitsWagersPhase }
  | { type: 'player_forfeited'; playerIds: string[] };

export type WitsWagersPublicEvent =
  | { type: 'round_started'; round: number; question: { prompt: string; unit: string } }
  | { type: 'guess_submitted'; playerId: string }
  | { type: 'board_revealed'; board: BoardTarget[] }
  | { type: 'bets_changed'; bets: Record<string, BetPair> }
  | { type: 'round_settled'; result: RoundResult }
  | { type: 'game_finished'; result: FinalResult };
