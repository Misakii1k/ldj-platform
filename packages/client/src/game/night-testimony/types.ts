/** night_testimony_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const CRIMES = ['arson', 'theft', 'forgery', 'smuggling', 'fraud', 'kidnap'] as const;
export type CrimeId = (typeof CRIMES)[number];
export type NightTestimonyPhase = 'question' | 'deduction' | 'vote' | 'game_over';

export interface AnswerRecord {
  questionerId: string;
  responderId: string;
  question: string;
  answer: 'yes' | 'no';
}

export interface NightTestimonyReveal {
  wardenId: string;
  crimes: Record<string, CrimeId>;
  answers: AnswerRecord[];
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
  yesTrack: AnswerRecord[];
  askedCount: number;
  questionLimit: number;
  extraCrime: CrimeId | null;
  hasPendingQuestion: boolean;
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
    yesLeft: number;
    noLeft: number;
    pendingQuestion: { questionerId: string; text: string } | null;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'yesTrack',
  'askedCount', 'questionLimit', 'extraCrime', 'hasPendingQuestion',
  'accusedId', 'wardenRevealed', 'guessingInProgress', 'winners', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'isWarden', 'crime', 'yesLeft', 'noLeft', 'pendingQuestion'] as const;

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

function parseAnswer(value: unknown): AnswerRecord | null {
  if (!isObject(value) || Object.keys(value).length !== 4) return null;
  if (!isPlayerId(value.questionerId) || !isPlayerId(value.responderId)) return null;
  if (typeof value.question !== 'string' || value.question.length < 1) return null;
  if (value.answer !== 'yes' && value.answer !== 'no') return null;
  return { questionerId: value.questionerId, responderId: value.responderId, question: value.question, answer: value.answer };
}

function parseAnswers(value: unknown): AnswerRecord[] | null {
  if (!Array.isArray(value)) return null;
  const answers: AnswerRecord[] = [];
  for (const item of value) {
    const parsed = parseAnswer(item);
    if (parsed === null) return null;
    answers.push(parsed);
  }
  return answers;
}

function parseReveal(value: unknown): NightTestimonyReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['wardenId', 'crimes', 'answers', 'extraCrime', 'accusedId', 'wardenRevealed', 'wardenGuesses', 'crimesAllGuessed'])) return null;
  if (!isPlayerId(value.wardenId) || !isBool(value.wardenRevealed) || !isBool(value.crimesAllGuessed)) return null;
  if (value.extraCrime !== null && !isCrime(value.extraCrime)) return null;
  if (value.accusedId !== null && !isPlayerId(value.accusedId)) return null;
  if (!isObject(value.crimes)) return null;
  const crimes: Record<string, CrimeId> = {};
  for (const key of Object.keys(value.crimes)) {
    if (!isCrime(value.crimes[key])) return null;
    crimes[key] = value.crimes[key];
  }
  const answers = parseAnswers(value.answers);
  if (answers === null) return null;
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
    answers,
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
  if (!isPlayerIds(view.players)) return null;
  const yesTrack = parseAnswers(view.yesTrack);
  if (yesTrack === null || !isNonNegativeInteger(view.askedCount) || !isNonNegativeInteger(view.questionLimit) || (view.questionLimit as number) < 1) return null;
  if (view.extraCrime !== null && !isCrime(view.extraCrime)) return null;
  if (!isBool(view.hasPendingQuestion)) return null;
  if (view.accusedId !== null && !isPlayerId(view.accusedId)) return null;
  if (view.wardenRevealed !== null && !isBool(view.wardenRevealed)) return null;
  if (!isBool(view.guessingInProgress) || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: view.phase as NightTestimonyPhase,
    players: [...view.players],
    yesTrack,
    askedCount: view.askedCount as number,
    questionLimit: view.questionLimit as number,
    extraCrime: view.extraCrime as CrimeId | null,
    hasPendingQuestion: view.hasPendingQuestion as boolean,
    accusedId: view.accusedId as string | null,
    wardenRevealed: view.wardenRevealed as boolean | null,
    guessingInProgress: view.guessingInProgress as boolean,
    winners: [...view.winners],
    reveal,
  };
}

function parsePending(value: unknown): { questionerId: string; text: string } | null {
  if (value === null) return null;
  if (!isObject(value) || Object.keys(value).length !== 2) return null;
  if (!isPlayerId(value.questionerId) || typeof value.text !== 'string' || value.text.length < 1) return null;
  return { questionerId: value.questionerId, text: value.text };
}

function parseMe(value: unknown): NightTestimonyPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isBool(value.isWarden) || !isNonNegativeInteger(value.yesLeft) || !isNonNegativeInteger(value.noLeft)) return null;
  if (value.crime !== null && !isCrime(value.crime)) return null;
  const pendingQuestion = parsePending(value.pendingQuestion);
  if (pendingQuestion === null && value.pendingQuestion !== null) return null;
  return {
    playerId: value.playerId,
    isWarden: value.isWarden,
    crime: value.crime as CrimeId | null,
    yesLeft: value.yesLeft as number,
    noLeft: value.noLeft as number,
    pendingQuestion,
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
