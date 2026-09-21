export { witsWagersModule, WITS_WAGERS_VERSIONED_IDENTITY } from './module.ts';
export { WITS_WAGERS_MANIFEST } from '../shared/manifest.ts';
export { buildBoard, pickWinningTargets, isEdgeTarget, targetLabel, EDGE_ODDS } from './board.ts';
export { settlePlayer, settleRound, computeRankings, winningOddsMap } from './scoring.ts';
export { createInitialState, createState, generateRoundToken, TOTAL_ROUNDS, QUESTION_PLAN_SIZE } from './state.ts';
export { parseConfig, parseAction, MIN_GUESS, MAX_GUESS } from './schemas.ts';
export { assertInvariants } from './invariants.ts';
export { reduce } from './reducer.ts';
export {
  buildPublicView,
  buildPlayerView,
  buildSpectatorView,
  parsePlayerView,
  parseSpectatorView,
} from './views.ts';
export { ALL_QUESTIONS, selectQuestions } from './questions.ts';

export type {
  TargetId,
  Slot,
  ChipId,
  GuessOrigin,
  ChipBet,
  BetPair,
  BoardTarget,
} from './board.ts';

export type {
  PlayerRoundLedger,
  PlayerRanking,
} from './scoring.ts';

export type {
  WitsWagersPhase,
  WitsWagersConfig,
  WitsWagersResolvedConfig,
  WitsWagersState,
  WitsWagersAction,
  WitsWagersPublicEvent,
  Question,
  RoundResult,
  FinalResult,
  Guess,
} from './types.ts';

export type {
  QuestionBriefView,
  PlayerSummaryView,
  WitsWagersPublicView,
  WitsWagersMeView,
  WitsWagersPlayerView,
  WitsWagersSpectatorView,
} from './views.ts';
