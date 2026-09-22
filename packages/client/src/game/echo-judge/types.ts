/** echo_judge_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export type EchoJudgePhase = 'judge_setup' | 'answering' | 'judgment' | 'game_over';
export type EchoJudgeRole = 'human' | 'impostor';

export interface TopicCardView {
  id: string;
  text: string;
  category: 'life' | 'imagination' | 'emotion' | 'weird' | 'philosophy' | 'social';
  categoryLabel: string;
}

export interface EchoJudgeReveal {
  round: number;
  judgeId: string;
  question: string;
  roles: Record<string, EchoJudgeRole>;
  triggerWords: Record<string, string>;
  answers: Record<string, string>;
  accusations: string[];
  caughtImpostors: string[];
  wrongAccusations: string[];
  escapedImpostors: string[];
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
  topicCardId: string | null;
  currentSpeakerId: string | null;
  allAnswered: boolean;
  answeredCount: number;
  accusations: string[] | null;
  caughtImpostors: string[] | null;
  escapedImpostors: string[] | null;
  scores: Record<string, number>;
  winners: string[];
  /** 当前阶段截止时刻；出题阶段与终局为 null */
  deadlineAt: number | null;
  reveal: EchoJudgeReveal | null;
}

export interface EchoJudgePlayerView extends EchoJudgePublicView {
  me: {
    playerId: string;
    isJudge: boolean;
    role: EchoJudgeRole | null;
    triggerWord: string | null;
    pendingTopicChoices: TopicCardView[] | null;
    myTurn: boolean;
    isCurrentSpeaker: boolean;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'round',
  'judgeId', 'question', 'topicCardId', 'currentSpeakerId', 'allAnswered', 'answeredCount',
  'accusations', 'caughtImpostors', 'escapedImpostors',
  'scores', 'winners', 'deadlineAt', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'isJudge', 'role', 'triggerWord', 'pendingTopicChoices', 'myTurn', 'isCurrentSpeaker'] as const;

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
  if (!isObject(value) || !hasExactKeys(value, ['round', 'judgeId', 'question', 'roles', 'triggerWords', 'answers', 'accusations', 'caughtImpostors', 'wrongAccusations', 'escapedImpostors', 'scores'])) return null;
  if (!isNonNegativeInteger(value.round) || (value.round as number) < 1 || !isPlayerId(value.judgeId)) return null;
  if (typeof value.question !== 'string') return null;
  const roles = parseRecord(value.roles, isRole);
  const triggerWords = parseRecord(value.triggerWords, (v): v is string => typeof v === 'string');
  const answers = parseRecord(value.answers, (v): v is string => typeof v === 'string');
  const scores = parseRecord(value.scores, (v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (roles === null || triggerWords === null || answers === null || scores === null) return null;
  if (!isPlayerIds(value.accusations) || !isPlayerIds(value.caughtImpostors) || !isPlayerIds(value.wrongAccusations) || !isPlayerIds(value.escapedImpostors)) return null;
  return {
    round: value.round as number,
    judgeId: value.judgeId,
    question: value.question,
    roles,
    triggerWords,
    answers,
    accusations: value.accusations,
    caughtImpostors: value.caughtImpostors,
    wrongAccusations: value.wrongAccusations,
    escapedImpostors: value.escapedImpostors,
    scores,
  };
}

function parseTopicCards(value: unknown): TopicCardView[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const list: TopicCardView[] = [];
  for (const item of value) {
    if (!isObject(item)) return null;
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.category !== 'string' || typeof item.categoryLabel !== 'string') return null;
    list.push({
      id: item.id,
      text: item.text,
      category: item.category as TopicCardView['category'],
      categoryLabel: item.categoryLabel,
    });
  }
  return list;
}

function parseBase(view: Record<string, unknown>, withMe: boolean): EchoJudgePublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'echo-judge' || view.rulesetId !== 'echo_judge_v1' || view.schemaVersion !== 1) return null;
  const phases: EchoJudgePhase[] = ['judge_setup', 'answering', 'judgment', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as EchoJudgePhase)) return null;
  if (!isPlayerIds(view.players) || !isPlayerId(view.judgeId)) return null;
  if (!isNonNegativeInteger(view.round) || (view.round as number) < 1 || typeof view.question !== 'string') return null;
  if (view.topicCardId !== null && typeof view.topicCardId !== 'string') return null;
  if (view.currentSpeakerId !== null && !isPlayerId(view.currentSpeakerId)) return null;
  if (!isBool(view.allAnswered) || !isNonNegativeInteger(view.answeredCount)) return null;
  if (view.accusations !== null && !isPlayerIds(view.accusations)) return null;
  if (view.caughtImpostors !== null && !isPlayerIds(view.caughtImpostors)) return null;
  if (view.escapedImpostors !== null && !isPlayerIds(view.escapedImpostors)) return null;
  const scores = parseRecord(view.scores, (v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (scores === null || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  if (view.deadlineAt !== null && typeof view.deadlineAt !== 'number') return null;
  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_v1',
    schemaVersion: 1,
    phase: view.phase as EchoJudgePhase,
    players: [...view.players],
    round: view.round as number,
    judgeId: view.judgeId as string,
    question: view.question as string,
    topicCardId: view.topicCardId as string | null,
    currentSpeakerId: view.currentSpeakerId as string | null,
    allAnswered: view.allAnswered as boolean,
    answeredCount: view.answeredCount as number,
    accusations: view.accusations as string[] | null,
    caughtImpostors: view.caughtImpostors as string[] | null,
    escapedImpostors: view.escapedImpostors as string[] | null,
    scores,
    winners: [...view.winners],
    deadlineAt: view.deadlineAt as number | null,
    reveal,
  };
}

function parseMe(value: unknown): EchoJudgePlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isBool(value.isJudge) || !isBool(value.myTurn) || !isBool(value.isCurrentSpeaker)) return null;
  if (value.role !== null && !isRole(value.role)) return null;
  if (value.triggerWord !== null && typeof value.triggerWord !== 'string') return null;
  const pendingTopicChoices = parseTopicCards(value.pendingTopicChoices);
  if (pendingTopicChoices === null && value.pendingTopicChoices !== null) return null;

  return {
    playerId: value.playerId,
    isJudge: value.isJudge as boolean,
    role: value.role as EchoJudgeRole | null,
    triggerWord: value.triggerWord as string | null,
    pendingTopicChoices,
    myTurn: value.myTurn as boolean,
    isCurrentSpeaker: value.isCurrentSpeaker as boolean,
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
