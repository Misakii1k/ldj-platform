/**
 * wits_wagers_platform_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。
 *
 * 契约修订 C01：本文件是客户端侧唯一的视角事实源，不从游戏包导入任何东西，
 * 客户端保持零游戏包依赖。与服务端 views.ts 的一致性由 T04 对拍测试保证。
 *
 * 一切未登记的键都必须失败关闭——服务端若误把标准答案、题库或他人未公开猜测
 * 加进视角，这里是最后一道结构性防线。
 */

export type WitsWagersPhase =
  | 'created'
  | 'answering'
  | 'arranging'
  | 'betting'
  | 'settlement'
  | 'game_over';

export type ChipId = 'A' | 'B';
export type TargetId = 'smaller' | `g:${number}`;
export type Slot = 'L3' | 'L2' | 'L1' | 'C' | 'R1' | 'R2' | 'R3';
export type GuessOrigin = 'submitted' | 'timeout';

/** G0 P7：猜测与答案的闭区间。 */
export const MIN_GUESS = 1;
export const MAX_GUESS = 999_999_999_999;

/** 01 §3 查表中出现的全部净赢倍率，含特殊槽的 6。 */
const ALLOWED_ODDS = new Set([2, 3, 4, 5, 6]);

const PHASES: readonly WitsWagersPhase[] = [
  'created', 'answering', 'arranging', 'betting', 'settlement', 'game_over',
];
const SLOTS: readonly (Slot | 'SMALLER')[] = ['L3', 'L2', 'L1', 'C', 'R1', 'R2', 'R3', 'SMALLER'];

export const TOTAL_ROUNDS = 7;

export interface QuestionBrief {
  prompt: string;
  unit: string;
}

export interface ChipBetView {
  chipId: ChipId;
  targetId: TargetId | null;
  extraStake: number;
}

export type BetPairView = [ChipBetView, ChipBetView];

export interface GuessView {
  value: number;
  origin: GuessOrigin;
}

export interface BoardTargetView {
  id: TargetId;
  value: number | null;
  slot: Slot | 'SMALLER';
  odds: number;
  authors: string[];
  timeoutAuthors: string[];
}

export interface PlayerSummaryView {
  playerId: string;
  score: number;
  winningGuesses: number;
  hasSubmitted: boolean;
  forfeited: boolean;
}

export interface RevealedQuestionView {
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

export interface PlayerRoundLedgerView {
  playerId: string;
  scoreBefore: number;
  reserved: number;
  availableBefore?: number;
  winProfit: number;
  loss: number;
  authorBonus: number;
  scoreAfter: number;
  winningGuessIncrement?: number;
}

export interface RoundResultView {
  round: number;
  question: RevealedQuestionView;
  board: BoardTargetView[];
  bets: Record<string, BetPairView>;
  winningTargetId: TargetId;
  awardedAuthors: string[];
  ledger: PlayerRoundLedgerView[];
}

export interface FinalRankingView {
  playerId: string;
  score: number;
  winningGuesses: number;
  rank: number;
}

export interface FinalResultView {
  rankings: FinalRankingView[];
  winners: string[];
  roundsPlayed: 7;
}

export interface WitsWagersPublicView {
  gameId: 'wits-wagers';
  rulesetId: 'wits_wagers_platform_v1';
  viewVersion: 1;
  phase: WitsWagersPhase;
  round: number;
  totalRounds: 7;
  phaseEpoch: number;
  roundToken: string;
  deadlineAt: number | null;
  question: QuestionBrief | null;
  players: PlayerSummaryView[];
  board: BoardTargetView[];
  publicBets: Record<string, BetPairView>;
  revealed: RoundResultView | null;
  history: RoundResultView[];
  result: FinalResultView | null;
}

export interface WitsWagersMe {
  playerId: string;
  submittedGuess: GuessView | null;
  guessRevision: number;
  acceptedBets: BetPairView;
  betRevision: number;
  reserved: number;
  available: number;
  canGuess: boolean;
  canBet: boolean;
}

export interface WitsWagersPlayerView extends WitsWagersPublicView {
  me: WitsWagersMe | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'viewVersion', 'phase', 'round', 'totalRounds',
  'phaseEpoch', 'roundToken', 'deadlineAt', 'question', 'players', 'board',
  'publicBets', 'revealed', 'history', 'result',
] as const;

const ME_KEYS = [
  'playerId', 'submittedGuess', 'guessRevision', 'acceptedBets', 'betRevision',
  'reserved', 'available', 'canGuess', 'canBet',
] as const;

const QUESTION_KEYS = ['prompt', 'unit'] as const;
const BOARD_KEYS = ['id', 'value', 'slot', 'odds', 'authors', 'timeoutAuthors'] as const;
const PLAYER_KEYS = ['playerId', 'score', 'winningGuesses', 'hasSubmitted', 'forfeited'] as const;
const CHIP_KEYS = ['chipId', 'targetId', 'extraStake'] as const;
const GUESS_KEYS = ['value', 'origin'] as const;

const REVEALED_QUESTION_KEYS = [
  'id', 'prompt', 'unit', 'answer', 'sourceUrl', 'sourceNote', 'asOf', 'explanation', 'reviewed',
] as const;
const ROUND_RESULT_KEYS = [
  'round', 'question', 'board', 'bets', 'winningTargetId', 'awardedAuthors', 'ledger',
] as const;
const FINAL_RANKING_KEYS = ['playerId', 'score', 'winningGuesses', 'rank'] as const;
const FINAL_RESULT_KEYS = ['rankings', 'winners', 'roundsPlayed'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length) return false;
  const allowedSet = new Set<string>(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 64;
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** 非负安全整数：NaN/Infinity/小数/负数/超安全范围全部拒绝。 */
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPlayerIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isPlayerId);
}

/** 目标 ID 只接受 smaller 或 g:<正整数>；拒绝前导零、小数、负号与大小写变体。 */
function isTargetId(value: unknown): value is TargetId {
  if (value === 'smaller') return true;
  if (typeof value !== 'string' || !value.startsWith('g:')) return false;
  const digits = value.slice(2);
  if (!/^[1-9][0-9]*$/.test(digits)) return false;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed >= MIN_GUESS && parsed <= MAX_GUESS;
}

function isGuessValue(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= MIN_GUESS
    && value <= MAX_GUESS;
}

function parseQuestion(value: unknown): QuestionBrief | null {
  if (!isObject(value) || !hasExactKeys(value, QUESTION_KEYS)) return null;
  if (typeof value.prompt !== 'string' || typeof value.unit !== 'string') return null;
  return { prompt: value.prompt, unit: value.unit };
}

function parseGuess(value: unknown): GuessView | null {
  if (!isObject(value) || !hasExactKeys(value, GUESS_KEYS)) return null;
  if (!isGuessValue(value.value)) return null;
  if (value.origin !== 'submitted' && value.origin !== 'timeout') return null;
  return { value: value.value, origin: value.origin };
}

function parseChip(value: unknown, expectedChipId: ChipId): ChipBetView | null {
  if (!isObject(value) || !hasExactKeys(value, CHIP_KEYS)) return null;
  // BetPair 规范顺序为 A 后 B；逆序与重复都是同义状态，必须拒绝。
  if (value.chipId !== expectedChipId) return null;
  if (!isNonNegativeInt(value.extraStake)) return null;
  if (value.targetId === null) {
    // 01 §4：未放置筹码不得附带加注，否则账本 reserved 与 loss 口径会错位。
    if (value.extraStake !== 0) return null;
    return { chipId: expectedChipId, targetId: null, extraStake: 0 };
  }
  if (!isTargetId(value.targetId)) return null;
  return { chipId: expectedChipId, targetId: value.targetId, extraStake: value.extraStake };
}

function parseBetPair(value: unknown): BetPairView | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = parseChip(value[0], 'A');
  const b = parseChip(value[1], 'B');
  if (a === null || b === null) return null;
  return [a, b];
}

function parseBoardTarget(value: unknown): BoardTargetView | null {
  if (!isObject(value) || !hasExactKeys(value, BOARD_KEYS)) return null;
  if (!isTargetId(value.id)) return null;
  if (typeof value.slot !== 'string' || !SLOTS.includes(value.slot as Slot | 'SMALLER')) return null;
  if (typeof value.odds !== 'number' || !ALLOWED_ODDS.has(value.odds)) return null;
  if (!isPlayerIds(value.authors) || !isPlayerIds(value.timeoutAuthors)) return null;
  // 02 §7：timeoutAuthors 是 authors 的子集；超出即为账本口径错误。
  const authors = new Set(value.authors);
  if (!value.timeoutAuthors.every((id) => authors.has(id))) return null;
  // 特殊槽无数值，普通槽必须有合法猜测值。
  if (value.id === 'smaller') {
    if (value.value !== null || value.slot !== 'SMALLER') return null;
  } else {
    if (!isGuessValue(value.value)) return null;
    if (value.slot === 'SMALLER') return null;
    if (`g:${value.value}` !== value.id) return null;
  }
  return {
    id: value.id,
    value: value.value as number | null,
    slot: value.slot as Slot | 'SMALLER',
    odds: value.odds,
    authors: [...value.authors],
    timeoutAuthors: [...value.timeoutAuthors],
  };
}

function parsePlayerSummary(value: unknown): PlayerSummaryView | null {
  if (!isObject(value) || !hasExactKeys(value, PLAYER_KEYS)) return null;
  if (!isPlayerId(value.playerId)) return null;
  if (!isNonNegativeInt(value.score) || !isNonNegativeInt(value.winningGuesses)) return null;
  if (!isBool(value.hasSubmitted) || !isBool(value.forfeited)) return null;
  return {
    playerId: value.playerId,
    score: value.score,
    winningGuesses: value.winningGuesses,
    hasSubmitted: value.hasSubmitted,
    forfeited: value.forfeited,
  };
}

function parseRevealedQuestion(value: unknown): RevealedQuestionView | null {
  if (!isObject(value) || !hasExactKeys(value, REVEALED_QUESTION_KEYS)) return null;
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 64) return null;
  if (typeof value.prompt !== 'string' || value.prompt.length < 1 || value.prompt.length > 240) return null;
  if (typeof value.unit !== 'string' || value.unit.length < 1 || value.unit.length > 16) return null;
  if (!isNonNegativeInt(value.answer) || value.answer < 1) return null;
  if (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 1000) return null;
  if (typeof value.sourceNote !== 'string' || value.sourceNote.length > 200) return null;
  if (typeof value.asOf !== 'string' || value.asOf.length > 32) return null;
  if (typeof value.explanation !== 'string' || value.explanation.length > 500) return null;
  if (typeof value.reviewed !== 'boolean' || !value.reviewed) return null;

  return {
    id: value.id,
    prompt: value.prompt,
    unit: value.unit,
    answer: value.answer,
    sourceUrl: value.sourceUrl,
    sourceNote: value.sourceNote,
    asOf: value.asOf,
    explanation: value.explanation,
    reviewed: value.reviewed,
  };
}

function parsePlayerRoundLedger(value: unknown): PlayerRoundLedgerView | null {
  if (!isObject(value)) return null;
  if (!isPlayerId(value.playerId)) return null;
  if (!isNonNegativeInt(value.scoreBefore) || !isNonNegativeInt(value.reserved)) return null;
  if (!isNonNegativeInt(value.winProfit) || !isNonNegativeInt(value.loss)) return null;
  if (!isNonNegativeInt(value.authorBonus) || !isNonNegativeInt(value.scoreAfter)) return null;

  return {
    playerId: value.playerId,
    scoreBefore: value.scoreBefore,
    reserved: value.reserved,
    availableBefore: typeof value.availableBefore === 'number' ? value.availableBefore : undefined,
    winProfit: value.winProfit,
    loss: value.loss,
    authorBonus: value.authorBonus,
    scoreAfter: value.scoreAfter,
    winningGuessIncrement: typeof value.winningGuessIncrement === 'number' ? value.winningGuessIncrement : undefined,
  };
}

export function parseRoundResult(value: unknown): RoundResultView | null {
  if (!isObject(value) || !hasExactKeys(value, ROUND_RESULT_KEYS)) return null;
  if (!isNonNegativeInt(value.round) || value.round < 1 || value.round > TOTAL_ROUNDS) return null;

  const question = parseRevealedQuestion(value.question);
  if (question === null) return null;

  if (!Array.isArray(value.board)) return null;
  const board: BoardTargetView[] = [];
  for (const item of value.board) {
    const parsed = parseBoardTarget(item);
    if (parsed === null) return null;
    board.push(parsed);
  }

  if (!isObject(value.bets)) return null;
  const bets: Record<string, BetPairView> = {};
  for (const key of Object.keys(value.bets)) {
    if (!isPlayerId(key)) return null;
    const pair = parseBetPair(value.bets[key]);
    if (pair === null) return null;
    bets[key] = pair;
  }

  if (!isTargetId(value.winningTargetId)) return null;
  if (!isPlayerIds(value.awardedAuthors)) return null;

  if (!Array.isArray(value.ledger)) return null;
  const ledger: PlayerRoundLedgerView[] = [];
  for (const item of value.ledger) {
    const parsed = parsePlayerRoundLedger(item);
    if (parsed === null) return null;
    ledger.push(parsed);
  }

  return {
    round: value.round,
    question,
    board,
    bets,
    winningTargetId: value.winningTargetId,
    awardedAuthors: [...value.awardedAuthors],
    ledger,
  };
}

function parseFinalRanking(value: unknown): FinalRankingView | null {
  if (!isObject(value) || !hasExactKeys(value, FINAL_RANKING_KEYS)) return null;
  if (!isPlayerId(value.playerId)) return null;
  if (!isNonNegativeInt(value.score)) return null;
  if (!isNonNegativeInt(value.winningGuesses)) return null;
  if (!isNonNegativeInt(value.rank) || value.rank < 1) return null;

  return {
    playerId: value.playerId,
    score: value.score,
    winningGuesses: value.winningGuesses,
    rank: value.rank,
  };
}

export function parseFinalResult(value: unknown): FinalResultView | null {
  if (!isObject(value) || !hasExactKeys(value, FINAL_RESULT_KEYS)) return null;
  if (value.roundsPlayed !== TOTAL_ROUNDS) return null;
  if (!isPlayerIds(value.winners)) return null;

  if (!Array.isArray(value.rankings)) return null;
  const rankings: FinalRankingView[] = [];
  for (const item of value.rankings) {
    const parsed = parseFinalRanking(item);
    if (parsed === null) return null;
    rankings.push(parsed);
  }

  return {
    rankings,
    winners: [...value.winners],
    roundsPlayed: 7,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): WitsWagersPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'wits-wagers') return null;
  if (view.rulesetId !== 'wits_wagers_platform_v1') return null;
  if (view.viewVersion !== 1) return null;
  if (typeof view.phase !== 'string' || !PHASES.includes(view.phase as WitsWagersPhase)) return null;
  if (view.totalRounds !== TOTAL_ROUNDS) return null;
  if (!isNonNegativeInt(view.round) || view.round > TOTAL_ROUNDS) return null;
  if (!isNonNegativeInt(view.phaseEpoch)) return null;
  if (typeof view.roundToken !== 'string' || view.roundToken.length > 128) return null;
  if (view.deadlineAt !== null && !isNonNegativeInt(view.deadlineAt)) return null;

  const question = view.question === null ? null : parseQuestion(view.question);
  if (question === null && view.question !== null) return null;

  if (!Array.isArray(view.players)) return null;
  const players: PlayerSummaryView[] = [];
  for (const item of view.players) {
    const parsed = parsePlayerSummary(item);
    if (parsed === null) return null;
    players.push(parsed);
  }

  if (!Array.isArray(view.board)) return null;
  const board: BoardTargetView[] = [];
  for (const item of view.board) {
    const parsed = parseBoardTarget(item);
    if (parsed === null) return null;
    board.push(parsed);
  }

  if (!isObject(view.publicBets)) return null;
  const publicBets: Record<string, BetPairView> = {};
  for (const key of Object.keys(view.publicBets)) {
    if (!isPlayerId(key)) return null;
    const pair = parseBetPair(view.publicBets[key]);
    if (pair === null) return null;
    publicBets[key] = pair;
  }

  let revealed: RoundResultView | null = null;
  if (view.revealed !== null && view.revealed !== undefined) {
    revealed = parseRoundResult(view.revealed);
    if (revealed === null) return null;
  }

  if (!Array.isArray(view.history) || view.history.length > TOTAL_ROUNDS) return null;
  const history: RoundResultView[] = [];
  for (const item of view.history) {
    const parsed = parseRoundResult(item);
    if (parsed === null) return null;
    history.push(parsed);
  }

  let result: FinalResultView | null = null;
  if (view.result !== null && view.result !== undefined) {
    result = parseFinalResult(view.result);
    if (result === null) return null;
  }

  return {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_platform_v1',
    viewVersion: 1,
    phase: view.phase as WitsWagersPhase,
    round: view.round,
    totalRounds: TOTAL_ROUNDS,
    phaseEpoch: view.phaseEpoch,
    roundToken: view.roundToken,
    deadlineAt: view.deadlineAt as number | null,
    question,
    players,
    board,
    publicBets,
    revealed,
    history,
    result,
  };
}

function parseMe(value: unknown): WitsWagersMe | null {
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS)) return null;
  if (!isPlayerId(value.playerId)) return null;
  if (!isNonNegativeInt(value.guessRevision) || !isNonNegativeInt(value.betRevision)) return null;
  if (!isNonNegativeInt(value.reserved) || !isNonNegativeInt(value.available)) return null;
  if (!isBool(value.canGuess) || !isBool(value.canBet)) return null;

  const submittedGuess = value.submittedGuess === null ? null : parseGuess(value.submittedGuess);
  if (submittedGuess === null && value.submittedGuess !== null) return null;

  const acceptedBets = parseBetPair(value.acceptedBets);
  if (acceptedBets === null) return null;

  return {
    playerId: value.playerId,
    submittedGuess,
    guessRevision: value.guessRevision,
    acceptedBets,
    betRevision: value.betRevision,
    reserved: value.reserved,
    available: value.available,
    canGuess: value.canGuess,
    canBet: value.canBet,
  };
}

export function parseWitsWagersView(
  view: unknown,
  role: 'player',
): WitsWagersPlayerView | null;
export function parseWitsWagersView(
  view: unknown,
  role: 'spectator',
): WitsWagersPublicView | null;
export function parseWitsWagersView(
  view: unknown,
  role: 'player' | 'spectator',
): WitsWagersPlayerView | WitsWagersPublicView | null;
export function parseWitsWagersView(
  view: unknown,
  role: 'player' | 'spectator',
): WitsWagersPlayerView | WitsWagersPublicView | null {
  if (!isObject(view)) return null;
  if (role === 'spectator') {
    // 观战视角必须完全没有 me 键，而不是 me:null。
    if ('me' in view) return null;
    return parseBase(view, false);
  }
  if (!('me' in view)) return null;
  const base = parseBase(view, true);
  if (base === null) return null;
  // 非参赛者拿到的 me 为 null，合法。
  if (view.me === null) return { ...base, me: null };
  const me = parseMe(view.me);
  if (me === null) return null;
  return { ...base, me };
}
