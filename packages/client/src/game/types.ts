/**
 * 谁是卧底客户端视角类型（镜像 server/views.ts，不导入服务端模块）。
 * 服务端 game_state envelope 的 payload.view 即为此类型。
 * 客户端不假设服务端字段一定存在；提供轻量类型守卫做运行时校验。
 */

export type UndercoverPhase =
  | 'word_reveal'
  | 'speaking'
  | 'voting'
  | 'runoff_voting'
  | 'vote_result'
  | 'game_over';

export type UndercoverRole = 'civilian' | 'undercover';

export interface PublicPlayerInfo {
  playerId: string;
  seat: number;
  alive: boolean;
  exitReason: 'voted_out' | 'disconnect_timeout' | null;
  /** 仅已公开淘汰者或游戏结束后可见 */
  revealedRole: UndercoverRole | null;
}

export interface VoteSummary {
  round: number;
  kind: 'normal' | 'runoff';
  outcome: 'eliminated' | 'tie' | 'no_votes' | 'runoff_tie';
  eliminatedPlayerId: string | null;
  eliminatedRole: UndercoverRole | null;
  /** 公开票数汇总（目标 → 票数） */
  tally: Record<string, number>;
}

export interface GameReveal {
  civilianWord: string;
  undercoverWord: string;
  roles: Record<string, UndercoverRole>;
}

export interface PlayerSelfView {
  playerId: string;
  word: string | null;
  role: UndercoverRole | null;
  alive: boolean;
  confirmed: boolean;
  hasVoted: boolean;
  myVote: string | null;
}

/** 谁是卧底公开视角（观战者收到此结构） */
export interface UndercoverPublicView {
  phase: UndercoverPhase;
  round: number;
  players: PublicPlayerInfo[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  deadlineAt: number | null;
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  confirmedPlayerIds: string[];
  lastVoteSummary: VoteSummary | null;
  winner: UndercoverRole | null;
  aborted: boolean;
  reveal: GameReveal | null;
}

/** 玩家视角（包含 me 个人私密字段） */
export interface UndercoverPlayerView extends UndercoverPublicView {
  me: PlayerSelfView | null;
}

/** game_state envelope 的 payload 结构（与服务端 views.ts 对齐） */
export interface GameStatePayload {
  sessionId: string;
  moduleId: string;
  status: string;
  role: 'player' | 'spectator';
  view: unknown;
}

// —— 轻量运行时类型守卫（不引入 zod，避免新增依赖） ——

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

const PHASES: readonly UndercoverPhase[] = [
  'word_reveal',
  'speaking',
  'voting',
  'runoff_voting',
  'vote_result',
  'game_over',
];

function isPhase(v: unknown): v is UndercoverPhase {
  return isString(v) && PHASES.includes(v as UndercoverPhase);
}

const ROLES: readonly UndercoverRole[] = ['civilian', 'undercover'];

function isRole(v: unknown): v is UndercoverRole {
  return isString(v) && ROLES.includes(v as UndercoverRole);
}

function parsePlayerInfo(v: unknown): PublicPlayerInfo | null {
  if (!isObject(v)) return null;
  const { playerId, seat, alive, exitReason, revealedRole } = v;
  if (!isString(playerId) || !isNumber(seat) || !isBoolean(alive)) return null;
  if (exitReason !== null && exitReason !== 'voted_out' && exitReason !== 'disconnect_timeout') return null;
  if (revealedRole !== null && !isRole(revealedRole)) return null;
  return {
    playerId,
    seat,
    alive,
    exitReason: exitReason as PublicPlayerInfo['exitReason'],
    revealedRole: revealedRole as PublicPlayerInfo['revealedRole'],
  };
}

function parseVoteSummary(v: unknown): VoteSummary | null {
  if (!isObject(v)) return null;
  const { round, kind, outcome, eliminatedPlayerId, eliminatedRole, tally } = v;
  if (!isNumber(round) || !isString(kind) || !isString(outcome)) return null;
  if (!['normal', 'runoff'].includes(kind)) return null;
  if (!['eliminated', 'tie', 'no_votes', 'runoff_tie'].includes(outcome)) return null;
  if (eliminatedPlayerId !== null && !isString(eliminatedPlayerId)) return null;
  if (eliminatedRole !== null && !isRole(eliminatedRole)) return null;
  if (!isObject(tally)) return null;
  const tallyParsed: Record<string, number> = {};
  for (const [k, val] of Object.entries(tally)) {
    if (!isNumber(val)) return null;
    tallyParsed[k] = val;
  }
  return {
    round,
    kind: kind as VoteSummary['kind'],
    outcome: outcome as VoteSummary['outcome'],
    eliminatedPlayerId: eliminatedPlayerId as VoteSummary['eliminatedPlayerId'],
    eliminatedRole: eliminatedRole as VoteSummary['eliminatedRole'],
    tally: tallyParsed,
  };
}

/** 解析 game_state payload；失败返回 null（客户端降级显示） */
export function parseGameStatePayload(v: unknown): GameStatePayload | null {
  if (!isObject(v)) return null;
  const { sessionId, moduleId, status, role, view } = v;
  if (!isString(sessionId) || !isString(moduleId) || !isString(status)) return null;
  if (role !== 'player' && role !== 'spectator') return null;
  return { sessionId, moduleId, status, role, view };
}

/** 解析谁是卧底视角；失败返回 null */
export function parseUndercoverView(view: unknown): UndercoverPlayerView | UndercoverPublicView | null {
  if (!isObject(view)) return null;
  const {
    phase, round, players, speakingOrder, currentSpeakerId, deadlineAt,
    votesSubmitted, votesExpected, runoffCandidates, confirmedPlayerIds,
    lastVoteSummary, winner, aborted, reveal, me,
  } = view;

  if (!isPhase(phase) || !isNumber(round) || !Array.isArray(players)) return null;
  if (!Array.isArray(speakingOrder) || !Array.isArray(runoffCandidates)) return null;
  if (!Array.isArray(confirmedPlayerIds)) return null;
  if (currentSpeakerId !== null && !isString(currentSpeakerId)) return null;
  if (deadlineAt !== null && !isNumber(deadlineAt)) return null;
  if (!isNumber(votesSubmitted) || !isNumber(votesExpected)) return null;
  if (winner !== null && !isRole(winner)) return null;
  if (!isBoolean(aborted)) return null;

  const parsedPlayers: PublicPlayerInfo[] = [];
  for (const p of players) {
    const pi = parsePlayerInfo(p);
    if (!pi) return null;
    parsedPlayers.push(pi);
  }
  for (const id of speakingOrder) {
    if (!isString(id)) return null;
  }
  for (const id of runoffCandidates) {
    if (!isString(id)) return null;
  }
  for (const id of confirmedPlayerIds) {
    if (!isString(id)) return null;
  }

  const parsedVoteSummary = lastVoteSummary !== null ? parseVoteSummary(lastVoteSummary) : null;
  if (lastVoteSummary !== null && parsedVoteSummary === null) return null;

  let parsedReveal: GameReveal | null = null;
  if (reveal !== null) {
    if (!isObject(reveal)) return null;
    const { civilianWord, undercoverWord, roles } = reveal;
    if (!isString(civilianWord) || !isString(undercoverWord) || !isObject(roles)) return null;
    const rolesParsed: Record<string, UndercoverRole> = {};
    for (const [k, val] of Object.entries(roles)) {
      if (!isRole(val)) return null;
      rolesParsed[k] = val;
    }
    parsedReveal = { civilianWord, undercoverWord, roles: rolesParsed };
  }

  const base: UndercoverPublicView = {
    phase,
    round,
    players: parsedPlayers,
    speakingOrder: speakingOrder as string[],
    currentSpeakerId: currentSpeakerId as string | null,
    deadlineAt: deadlineAt as number | null,
    votesSubmitted,
    votesExpected,
    runoffCandidates: runoffCandidates as string[],
    confirmedPlayerIds: confirmedPlayerIds as string[],
    lastVoteSummary: parsedVoteSummary,
    winner: winner as UndercoverRole | null,
    aborted,
    reveal: parsedReveal,
  };

  // me 字段仅 player 视角存在
  if (me === undefined) return base;
  if (me === null) return { ...base, me: null };
  if (!isObject(me)) return null;
  const {
    playerId: mePlayerId, word, role: meRole, alive: meAlive,
    confirmed, hasVoted, myVote,
  } = me;
  if (!isString(mePlayerId)) return null;
  if (word !== null && !isString(word)) return null;
  if (meRole !== null && !isRole(meRole)) return null;
  if (!isBoolean(meAlive) || !isBoolean(confirmed) || !isBoolean(hasVoted)) return null;
  if (myVote !== null && !isString(myVote)) return null;

  const meView: PlayerSelfView = {
    playerId: mePlayerId,
    word: word as string | null,
    role: meRole as UndercoverRole | null,
    alive: meAlive,
    confirmed,
    hasVoted,
    myVote: myVote as string | null,
  };
  return { ...base, me: meView };
}

/** 安全获取视角（统一返回带 me 可空的结构，便于 UI 消费） */
export function asPlayerView(view: unknown): UndercoverPlayerView | null {
  const parsed = parseUndercoverView(view);
  if (parsed === null) return null;
  if ('me' in parsed) return parsed;
  return { ...parsed, me: null };
}
