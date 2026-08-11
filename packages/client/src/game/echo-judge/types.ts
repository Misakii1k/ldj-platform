/** echo_judge_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export type EchoJudgePhase = 'judge_setup' | 'answering' | 'judgment' | 'game_over';
export type EchoJudgeRole = 'human' | 'impostor';

export interface EchoJudgeReveal {
  round: number;
  judgeId: string;
  question: string;
  roles: Record<string, EchoJudgeRole>;
  triggerWords: Record<string, string>;
  answers: Record<string, string>;
  accusation: string | null;
  caughtImpostor: boolean | null;
  scores: Record<string, number>;
}

export interface EchoJudgePublicView {
  gameId: 'echo-judge';
  rulesetId: 'echo_judge_v1';
  schemaVersion: 1;
  phase: EchoJudgePhase;
  players: string[];
  round: number;
  judgeId: string;
  question: string;
  allAnswered: boolean;
  answeredCount: number;
  caughtImpostor: boolean | null;
  scores: Record<string, number>;
  winners: string[];
  reveal: EchoJudgeReveal | null;
}

export interface EchoJudgePlayerView extends EchoJudgePublicView {
  me: {
    playerId: string;
    isJudge: boolean;
    role: EchoJudgeRole | null;
    triggerWord: string | null;
    myTurn: boolean;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'round',
  'judgeId', 'question', 'allAnswered', 'answeredCount', 'caughtImpostor',
  'scores', 'winners', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'isJudge', 'role', 'triggerWord', 'myTurn'] as const;

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

function isRole(value: unknown): value is EchoJudgeRole {
  return value === 'human' || value === 'impostor';
}

function parseRecord<T>(value: unknown, guard: (v: unknown) => v is T): Record<string, T> | null {
  if (!isObject(value)) return null;
  const result: Record<string, T> = {};
  for (const key of Object.keys(value)) {
    if (!guard(value[key])) return null;
    result[key] = value[key];
  }
  return result;
}

function parseReveal(value: unknown): EchoJudgeReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['round', 'judgeId', 'question', 'roles', 'triggerWords', 'answers', 'accusation', 'caughtImpostor', 'scores'])) return null;
  if (!isNonNegativeInteger(value.round) || (value.round as number) < 1 || !isPlayerId(value.judgeId)) return null;
  if (typeof value.question !== 'string') return null;
  const roles = parseRecord(value.roles, isRole);
  const triggerWords = parseRecord(value.triggerWords, (v): v is string => typeof v === 'string');
  const answers = parseRecord(value.answers, (v): v is string => typeof v === 'string');
  const scores = parseRecord(value.scores, (v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (roles === null || triggerWords === null || answers === null || scores === null) return null;
  if (value.accusation !== null && !isPlayerId(value.accusation)) return null;
  if (value.caughtImpostor !== null && !isBool(value.caughtImpostor)) return null;
  return {
    round: value.round as number,
    judgeId: value.judgeId,
    question: value.question,
    roles,
    triggerWords,
    answers,
    accusation: value.accusation as string | null,
    caughtImpostor: value.caughtImpostor as boolean | null,
    scores,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): EchoJudgePublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'echo-judge' || view.rulesetId !== 'echo_judge_v1' || view.schemaVersion !== 1) return null;
  const phases: EchoJudgePhase[] = ['judge_setup', 'answering', 'judgment', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as EchoJudgePhase)) return null;
  if (!isPlayerIds(view.players) || !isPlayerId(view.judgeId)) return null;
  if (!isNonNegativeInteger(view.round) || (view.round as number) < 1 || typeof view.question !== 'string') return null;
  if (!isBool(view.allAnswered) || !isNonNegativeInteger(view.answeredCount)) return null;
  if (view.caughtImpostor !== null && !isBool(view.caughtImpostor)) return null;
  const scores = parseRecord(view.scores, (v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (scores === null || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_v1',
    schemaVersion: 1,
    phase: view.phase as EchoJudgePhase,
    players: [...view.players],
    round: view.round as number,
    judgeId: view.judgeId as string,
    question: view.question as string,
    allAnswered: view.allAnswered as boolean,
    answeredCount: view.answeredCount as number,
    caughtImpostor: view.caughtImpostor as boolean | null,
    scores,
    winners: [...view.winners],
    reveal,
  };
}

function parseMe(value: unknown): EchoJudgePlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isBool(value.isJudge) || !isBool(value.myTurn)) return null;
  if (value.role !== null && !isRole(value.role)) return null;
  if (value.triggerWord !== null && typeof value.triggerWord !== 'string') return null;
  return {
    playerId: value.playerId,
    isJudge: value.isJudge as boolean,
    role: value.role as EchoJudgeRole | null,
    triggerWord: value.triggerWord as string | null,
    myTurn: value.myTurn as boolean,
  };
}

export function parseEchoJudgeView(
  view: unknown,
  role: 'player' | 'spectator',
): EchoJudgePlayerView | EchoJudgePublicView | null {
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
