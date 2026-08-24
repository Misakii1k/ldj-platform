/** night_testimony_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const CRIMES = [
  'arson',
  'theft',
  'forgery',
  'smuggling',
  'fraud',
  'kidnap',
  'littering',
  'public_urination',
  'noise_nuisance',
  'graffiti',
  'dine_and_dash',
  'line_cutting',
  'scalping',
  'public_smoking',
  'hacker',
  'wifi_leeching',
  'scalp_bot',
  'spoilers',
  'water_army',
  'office_theft',
  'pickpocket',
  'bike_theft',
  'counterfeiter',
  'blackmail',
  'prison_break',
  'poisoning',
  'grave_robbery',
  'transnational_crime',
  'money_laundering',
  'museum_heist',
  'arms_trafficking',
  'espionage',
  'poaching',
  'pyramid_scheme',
  'sea_pirate',
  'impersonation',
] as const;
export type CrimeId = (typeof CRIMES)[number];
export type NightTestimonyPhase = 'question' | 'deduction' | 'vote' | 'game_over';

export interface QuestionCardView {
  id: string;
  text: string;
  category: 'motive' | 'method' | 'time' | 'scene' | 'property' | 'personnel';
  categoryLabel: string;
}

export interface QuestionRecord {
  questionIndex: number;
  questionerId: string;
  cardId: string;
  question: string;
  answers: Record<string, 'yes' | 'no'>;
}

export interface NightTestimonyReveal {
  wardenId: string;
  crimes: Record<string, CrimeId>;
  history: QuestionRecord[];
  extraCrime: CrimeId | null;
  accusedId: string | null;
  wardenRevealed: boolean;
  wardenGuesses: Record<string, CrimeId> | null;
  crimesAllGuessed: boolean;
}

export interface NightTestimonyPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_v1';
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  currentQuestionerId: string;
  questionIndex: number;
  questionLimit: number;
  maxYesPerPlayer: number;
  history: QuestionRecord[];
  playerYesCounts: Record<string, number>;
  currentQuestion: {
    questionIndex: number;
    questionerId: string;
    cardId: string;
    text: string;
    answers: Record<string, 'yes' | 'no'>;
  } | null;
  revealedIdentities: Record<string, CrimeId | 'warden'>;
  extraCrime: CrimeId | null;
  availableGuessCrimes: CrimeId[] | null;
  votedPlayerIds: string[];
  accusedId: string | null;
  wardenRevealed: boolean | null;
  guessingInProgress: boolean;
  winners: string[];
  reveal: NightTestimonyReveal | null;
}

export interface NightTestimonyPlayerView extends NightTestimonyPublicView {
  me: {
    playerId: string;
    isWarden: boolean;
    crime: CrimeId | null;
    myYesCount: number;
    hasAnsweredCurrent: boolean;
    hasVoted: boolean;
    pendingCardChoices: QuestionCardView[] | null;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'currentQuestionerId',
  'questionIndex', 'questionLimit', 'maxYesPerPlayer', 'history', 'playerYesCounts',
  'currentQuestion', 'revealedIdentities', 'extraCrime', 'availableGuessCrimes', 'votedPlayerIds',
  'accusedId', 'wardenRevealed', 'guessingInProgress', 'winners', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'isWarden', 'crime', 'myYesCount', 'hasAnsweredCurrent', 'hasVoted', 'pendingCardChoices'] as const;

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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPlayerIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isPlayerId);
}

function isCrime(value: unknown): value is CrimeId {
  return typeof value === 'string' && (CRIMES as readonly string[]).includes(value);
}

function parseAnswersRecord(value: unknown): Record<string, 'yes' | 'no'> | null {
  if (!isObject(value)) return null;
  const result: Record<string, 'yes' | 'no'> = {};
  for (const key of Object.keys(value)) {
    if (!isPlayerId(key)) return null;
    const v = value[key];
    if (v !== 'yes' && v !== 'no') return null;
    result[key] = v;
  }
  return result;
}

function parseQuestionRecord(value: unknown): QuestionRecord | null {
  if (!isObject(value) || !hasExactKeys(value, ['questionIndex', 'questionerId', 'cardId', 'question', 'answers'])) return null;
  if (!isNonNegativeInteger(value.questionIndex) || !isPlayerId(value.questionerId)) return null;
  if (typeof value.cardId !== 'string' || typeof value.question !== 'string') return null;
  const answers = parseAnswersRecord(value.answers);
  if (answers === null) return null;
  return {
    questionIndex: value.questionIndex as number,
    questionerId: value.questionerId,
    cardId: value.cardId,
    question: value.question,
    answers,
  };
}

function parseHistory(value: unknown): QuestionRecord[] | null {
  if (!Array.isArray(value)) return null;
  const list: QuestionRecord[] = [];
  for (const item of value) {
    const parsed = parseQuestionRecord(item);
    if (parsed === null) return null;
    list.push(parsed);
  }
  return list;
}

function parseCurrentQuestion(value: unknown): NightTestimonyPublicView['currentQuestion'] | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['questionIndex', 'questionerId', 'cardId', 'text', 'answers'])) return null;
  if (!isNonNegativeInteger(value.questionIndex) || !isPlayerId(value.questionerId)) return null;
  if (typeof value.cardId !== 'string' || typeof value.text !== 'string') return null;
  const answers = parseAnswersRecord(value.answers);
  if (answers === null) return null;
  return {
    questionIndex: value.questionIndex as number,
    questionerId: value.questionerId,
    cardId: value.cardId,
    text: value.text,
    answers,
  };
}

function parseReveal(value: unknown): NightTestimonyReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['wardenId', 'crimes', 'history', 'extraCrime', 'accusedId', 'wardenRevealed', 'wardenGuesses', 'crimesAllGuessed'])) return null;
  if (!isPlayerId(value.wardenId) || !isBool(value.wardenRevealed) || !isBool(value.crimesAllGuessed)) return null;
  if (value.extraCrime !== null && !isCrime(value.extraCrime)) return null;
  if (value.accusedId !== null && !isPlayerId(value.accusedId)) return null;
  if (!isObject(value.crimes)) return null;
  const crimes: Record<string, CrimeId> = {};
  for (const key of Object.keys(value.crimes)) {
    if (!isCrime(value.crimes[key])) return null;
    crimes[key] = value.crimes[key];
  }
  const history = parseHistory(value.history);
  if (history === null) return null;
  let wardenGuesses: Record<string, CrimeId> | null = null;
  if (value.wardenGuesses !== null) {
    if (!isObject(value.wardenGuesses)) return null;
    wardenGuesses = {};
    for (const key of Object.keys(value.wardenGuesses)) {
      if (!isCrime(value.wardenGuesses[key])) return null;
      wardenGuesses[key] = value.wardenGuesses[key];
    }
  }
  return {
    wardenId: value.wardenId,
    crimes,
    history,
    extraCrime: value.extraCrime as CrimeId | null,
    accusedId: value.accusedId as string | null,
    wardenRevealed: value.wardenRevealed,
    wardenGuesses,
    crimesAllGuessed: value.crimesAllGuessed,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): NightTestimonyPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'night-testimony' || view.rulesetId !== 'night_testimony_v1' || view.schemaVersion !== 1) return null;
  const phases: NightTestimonyPhase[] = ['question', 'deduction', 'vote', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as NightTestimonyPhase)) return null;
  if (!isPlayerIds(view.players) || !isPlayerId(view.currentQuestionerId)) return null;
  if (!isNonNegativeInteger(view.questionIndex) || !isNonNegativeInteger(view.questionLimit) || !isNonNegativeInteger(view.maxYesPerPlayer)) return null;
  const history = parseHistory(view.history);
  if (history === null) return null;
  if (!isObject(view.playerYesCounts) || !isObject(view.revealedIdentities)) return null;
  const playerYesCounts: Record<string, number> = {};
  for (const k of Object.keys(view.playerYesCounts)) {
    if (!isNonNegativeInteger(view.playerYesCounts[k])) return null;
    playerYesCounts[k] = view.playerYesCounts[k];
  }
  const revealedIdentities: Record<string, CrimeId | 'warden'> = {};
  for (const k of Object.keys(view.revealedIdentities)) {
    const v = view.revealedIdentities[k];
    if (v !== 'warden' && !isCrime(v)) return null;
    revealedIdentities[k] = v;
  }
  const currentQuestion = parseCurrentQuestion(view.currentQuestion);
  if (currentQuestion === null && view.currentQuestion !== null) return null;
  if (view.extraCrime !== null && !isCrime(view.extraCrime)) return null;
  let availableGuessCrimes: CrimeId[] | null = null;
  if (view.availableGuessCrimes !== null) {
    if (!Array.isArray(view.availableGuessCrimes) || !view.availableGuessCrimes.every(isCrime)) return null;
    availableGuessCrimes = [...view.availableGuessCrimes];
  }
  if (view.accusedId !== null && !isPlayerId(view.accusedId)) return null;
  if (view.wardenRevealed !== null && !isBool(view.wardenRevealed)) return null;
  if (!isPlayerIds(view.votedPlayerIds) || !isBool(view.guessingInProgress) || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;

  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: view.phase as NightTestimonyPhase,
    players: [...view.players],
    currentQuestionerId: view.currentQuestionerId as string,
    questionIndex: view.questionIndex as number,
    questionLimit: view.questionLimit as number,
    maxYesPerPlayer: view.maxYesPerPlayer as number,
    history,
    playerYesCounts,
    currentQuestion,
    revealedIdentities,
    extraCrime: view.extraCrime as CrimeId | null,
    availableGuessCrimes,
    votedPlayerIds: [...view.votedPlayerIds],
    accusedId: view.accusedId as string | null,
    wardenRevealed: view.wardenRevealed as boolean | null,
    guessingInProgress: view.guessingInProgress as boolean,
    winners: [...view.winners],
    reveal,
  };
}

function parseQuestionCards(value: unknown): QuestionCardView[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const list: QuestionCardView[] = [];
  for (const item of value) {
    if (!isObject(item)) return null;
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.category !== 'string' || typeof item.categoryLabel !== 'string') return null;
    list.push({
      id: item.id,
      text: item.text,
      category: item.category as QuestionCardView['category'],
      categoryLabel: item.categoryLabel,
    });
  }
  return list;
}

function parseMe(value: unknown): NightTestimonyPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isBool(value.isWarden) || !isNonNegativeInteger(value.myYesCount) || !isBool(value.hasAnsweredCurrent) || !isBool(value.hasVoted)) return null;
  if (value.crime !== null && !isCrime(value.crime)) return null;
  const pendingCardChoices = parseQuestionCards(value.pendingCardChoices);
  if (pendingCardChoices === null && value.pendingCardChoices !== null) return null;

  return {
    playerId: value.playerId,
    isWarden: value.isWarden,
    crime: value.crime as CrimeId | null,
    myYesCount: value.myYesCount as number,
    hasAnsweredCurrent: value.hasAnsweredCurrent as boolean,
    hasVoted: value.hasVoted,
    pendingCardChoices,
  };
}

export function parseNightTestimonyView(
  view: unknown,
  role: 'player' | 'spectator',
): NightTestimonyPlayerView | NightTestimonyPublicView | null {
  if (!isObject(view)) return null;
  if (role === 'spectator') {
    if ('me' in view) return null;
    return parseBase(view, false);
  }
  if (!('me' in view)) return null;
  const base = parseBase(view, true);
  if (base === null) return null;
  const me = parseMe(view.me);
  if (view.me !== null && me === null) return null;
  return { ...base, me };
}
