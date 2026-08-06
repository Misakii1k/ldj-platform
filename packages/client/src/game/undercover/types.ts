/**
 * 谁是卧底客户端视角类型与严格解析器（D3 Task 9）。
 * 镜像 server undercover view schemas：只接受精确字段，未知键一律拒绝；
 * 角色与 me 语义由 viewRegistry 在 payload 层校验。
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

/** 谁是卧底公开视角（观战者收到此结构，无 me 键） */
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

/** 玩家视角（包含 me 个人私密字段；me 可为 null 表示非参局玩家） */
export interface UndercoverPlayerView extends UndercoverPublicView {
  me: PlayerSelfView | null;
}

const PUBLIC_KEYS = [
  'phase', 'round', 'players', 'speakingOrder', 'currentSpeakerId', 'deadlineAt',
  'votesSubmitted', 'votesExpected', 'runoffCandidates', 'confirmedPlayerIds',
  'lastVoteSummary', 'winner', 'aborted', 'reveal',
] as const;

const PLAYER_INFO_KEYS = ['playerId', 'seat', 'alive', 'exitReason', 'revealedRole'] as const;
const VOTE_SUMMARY_KEYS = [
  'round', 'kind', 'outcome', 'eliminatedPlayerId', 'eliminatedRole', 'tally',
] as const;
const REVEAL_KEYS = ['civilianWord', 'undercoverWord', 'roles'] as const;
const ME_KEYS = ['playerId', 'word', 'role', 'alive', 'confirmed', 'hasVoted', 'myVote'] as const;

const PHASES: readonly UndercoverPhase[] = [
  'word_reveal', 'speaking', 'voting', 'runoff_voting', 'vote_result', 'game_over',
];
const ROLES: readonly UndercoverRole[] = ['civilian', 'undercover'];

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

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length) return false;
  const allowedSet = new Set<string>(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function parsePlayerInfo(v: unknown): PublicPlayerInfo | null {
  if (!isObject(v) || !hasExactKeys(v, PLAYER_INFO_KEYS)) return null;
  const { playerId, seat, alive, exitReason, revealedRole } = v;
  if (!isString(playerId) || !isNumber(seat) || !isBoolean(alive)) return null;
  if (exitReason !== null && exitReason !== 'voted_out' && exitReason !== 'disconnect_timeout') return null;
  if (revealedRole !== null && !ROLES.includes(revealedRole as UndercoverRole)) return null;
  return {
    playerId,
    seat,
    alive,
    exitReason: exitReason as PublicPlayerInfo['exitReason'],
    revealedRole: revealedRole as PublicPlayerInfo['revealedRole'],
  };
}

function parseVoteSummary(v: unknown): VoteSummary | null {
  if (!isObject(v) || !hasExactKeys(v, VOTE_SUMMARY_KEYS)) return null;
  const { round, kind, outcome, eliminatedPlayerId, eliminatedRole, tally } = v;
  if (!isNumber(round)) return null;
  if (kind !== 'normal' && kind !== 'runoff') return null;
  if (outcome !== 'eliminated' && outcome !== 'tie' && outcome !== 'no_votes' && outcome !== 'runoff_tie') return null;
  if (eliminatedPlayerId !== null && !isString(eliminatedPlayerId)) return null;
  if (eliminatedRole !== null && !ROLES.includes(eliminatedRole as UndercoverRole)) return null;
  if (!isObject(tally)) return null;
  const tallyParsed: Record<string, number> = {};
  for (const [key, value] of Object.entries(tally)) {
    if (!isNumber(value)) return null;
    tallyParsed[key] = value;
  }
  return {
    round,
    kind: kind as VoteSummary['kind'],
    outcome: outcome as VoteSummary['outcome'],
    eliminatedPlayerId: eliminatedPlayerId as string | null,
    eliminatedRole: eliminatedRole as UndercoverRole | null,
    tally: tallyParsed,
  };
}

function parseReveal(v: unknown): GameReveal | null {
  if (!isObject(v) || !hasExactKeys(v, REVEAL_KEYS)) return null;
  const { civilianWord, undercoverWord, roles } = v;
  if (!isString(civilianWord) || !isString(undercoverWord) || !isObject(roles)) return null;
  const rolesParsed: Record<string, UndercoverRole> = {};
  for (const [key, value] of Object.entries(roles)) {
    if (!ROLES.includes(value as UndercoverRole)) return null;
    rolesParsed[key] = value as UndercoverRole;
  }
  return { civilianWord, undercoverWord, roles: rolesParsed };
}

function parseMe(v: unknown): PlayerSelfView | null {
  if (v === null) return null;
  if (!isObject(v) || !hasExactKeys(v, ME_KEYS)) return null;
  const { playerId, word, role, alive, confirmed, hasVoted, myVote } = v;
  if (!isString(playerId)) return null;
  if (word !== null && !isString(word)) return null;
  if (role !== null && !ROLES.includes(role as UndercoverRole)) return null;
  if (!isBoolean(alive) || !isBoolean(confirmed) || !isBoolean(hasVoted)) return null;
  if (myVote !== null && !isString(myVote)) return null;
  return {
    playerId,
    word: word as string | null,
    role: role as UndercoverRole | null,
    alive,
    confirmed,
    hasVoted,
    myVote: myVote as string | null,
  };
}

/**
 * 严格解析卧底视角。me 语义由调用方按角色决定：
 * - 观战视角：me 键必须缺失；
 * - 玩家视角：me 必须存在（可为 null）。
 * 任何未知键、缺失键或非法枚举都返回 null。
 */
export function parseUndercoverView(
  view: unknown,
  role: 'player' | 'spectator',
): UndercoverPlayerView | UndercoverPublicView | null {
  if (!isObject(view)) return null;
  // 玩家视角带 me 键，观战视角不允许出现 me。
  if (!hasExactKeys(view, role === 'spectator' ? PUBLIC_KEYS : [...PUBLIC_KEYS, 'me'])) return null;
  const {
    phase, round, players, speakingOrder, currentSpeakerId, deadlineAt,
    votesSubmitted, votesExpected, runoffCandidates, confirmedPlayerIds,
    lastVoteSummary, winner, aborted, reveal, me,
  } = view;

  if (!PHASES.includes(phase as UndercoverPhase)) return null;
  if (!isNumber(round) || !Array.isArray(players)) return null;
  if (!Array.isArray(speakingOrder) || !Array.isArray(runoffCandidates)) return null;
  if (!Array.isArray(confirmedPlayerIds)) return null;
  if (currentSpeakerId !== null && !isString(currentSpeakerId)) return null;
  if (deadlineAt !== null && !isNumber(deadlineAt)) return null;
  if (!isNumber(votesSubmitted) || !isNumber(votesExpected)) return null;
  if (winner !== null && !ROLES.includes(winner as UndercoverRole)) return null;
  if (!isBoolean(aborted)) return null;

  const parsedPlayers: PublicPlayerInfo[] = [];
  for (const entry of players) {
    const parsed = parsePlayerInfo(entry);
    if (parsed === null) return null;
    parsedPlayers.push(parsed);
  }
  for (const id of speakingOrder) if (!isString(id)) return null;
  for (const id of runoffCandidates) if (!isString(id)) return null;
  for (const id of confirmedPlayerIds) if (!isString(id)) return null;

  const parsedVoteSummary = lastVoteSummary === null ? null : parseVoteSummary(lastVoteSummary);
  if (lastVoteSummary !== null && parsedVoteSummary === null) return null;
  const parsedReveal = reveal === null ? null : parseReveal(reveal);
  if (reveal !== null && parsedReveal === null) return null;

  const base: UndercoverPublicView = {
    phase: phase as UndercoverPhase,
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

  if (role === 'spectator') {
    // 观战视角不得携带 me 键（服务端白名单从不构造它）。
    if ('me' in view) return null;
    return base;
  }

  // 玩家视角：me 必须存在（对象或 null）。
  if (!('me' in view)) return null;
  const parsedMe = parseMe(me);
  if (me !== null && parsedMe === null) return null;
  return { ...base, me: parsedMe };
}

// —— undercover_blank_v1 视角（D4-B-UI，镜像 server/blank 白名单视图）——

export type BlankRole = 'blank' | 'civilian';
export type BlankWinner = 'blank' | 'civilian';
export type BlankRevealMode = 'immediate' | 'delayed';
export type BlankExitReason = 'voted_out' | 'disconnect_timeout' | 'guess_wrong';

export type BlankPhase =
  | 'word_reveal'
  | 'speaking'
  | 'voting'
  | 'runoff_voting'
  | 'vote_result'
  | 'final_guess'
  | 'game_over';

export interface BlankPublicPlayerInfo {
  playerId: string;
  seat: number;
  alive: boolean;
  exitReason: BlankExitReason | null;
  /** 仅在公开时机可见（delayed 模式下白板淘汰不公开身份）。 */
  revealedRole: BlankRole | null;
}

export interface BlankVoteSummary {
  round: number;
  kind: 'normal' | 'runoff';
  outcome: 'eliminated' | 'tie' | 'no_votes' | 'runoff_tie';
  eliminatedPlayerId: string | null;
  eliminatedRole: BlankRole | null;
  /** 公开票数汇总（目标 → 票数） */
  tally: Record<string, number>;
}

export interface BlankReveal {
  civilianWord: string;
  roles: Record<string, BlankRole>;
}

export interface BlankPublicView {
  gameId: 'undercover';
  rulesetId: 'undercover_blank_v1';
  phase: BlankPhase;
  round: number;
  players: BlankPublicPlayerInfo[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  deadlineAt: number | null;
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  confirmedPlayerIds: string[];
  lastVoteSummary: BlankVoteSummary | null;
  winner: BlankWinner | null;
  aborted: boolean;
  /** 是否有外部裁判在途（UI「等待裁判层」）；猜词明文永不进入任何视角。 */
  guessPending: boolean;
  revealMode: BlankRevealMode;
  reveal: BlankReveal | null;
}

export interface BlankPlayerMeView {
  playerId: string;
  /** 平民见共享词；blank 显式无词（null，不是空字符串）。 */
  word: string | null;
  role: BlankRole | null;
  alive: boolean;
  confirmed: boolean;
  hasVoted: boolean;
  myVote: string | null;
  isBlank: boolean;
  /** 是否可在当前阶段提交主动猜词（blank 存活且机会未用）。 */
  canGuess: boolean;
  /** 是否可提交终局猜词（final_guess 阶段、blank、机会未用）。 */
  canSubmitFinalGuess: boolean;
  /** 猜词机会是否已消耗。 */
  guessUsed: boolean;
  /** 自己的猜词是否在途。 */
  guessPending: boolean;
}

export interface BlankPlayerView extends BlankPublicView {
  me: BlankPlayerMeView | null;
}

const BLANK_PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'phase', 'round', 'players', 'speakingOrder', 'currentSpeakerId',
  'deadlineAt', 'votesSubmitted', 'votesExpected', 'runoffCandidates', 'confirmedPlayerIds',
  'lastVoteSummary', 'winner', 'aborted', 'guessPending', 'revealMode', 'reveal',
] as const;

const BLANK_PLAYER_INFO_KEYS = ['playerId', 'seat', 'alive', 'exitReason', 'revealedRole'] as const;
const BLANK_VOTE_SUMMARY_KEYS = [
  'round', 'kind', 'outcome', 'eliminatedPlayerId', 'eliminatedRole', 'tally',
] as const;
const BLANK_REVEAL_KEYS = ['civilianWord', 'roles'] as const;
const BLANK_ME_KEYS = [
  'playerId', 'word', 'role', 'alive', 'confirmed', 'hasVoted', 'myVote', 'isBlank',
  'canGuess', 'canSubmitFinalGuess', 'guessUsed', 'guessPending',
] as const;

const BLANK_PHASES: readonly BlankPhase[] = [
  'word_reveal', 'speaking', 'voting', 'runoff_voting', 'vote_result', 'final_guess', 'game_over',
];
const BLANK_ROLES: readonly BlankRole[] = ['blank', 'civilian'];

function parseBlankPlayerInfo(v: unknown): BlankPublicPlayerInfo | null {
  if (!isObject(v) || !hasExactKeys(v, BLANK_PLAYER_INFO_KEYS)) return null;
  const { playerId, seat, alive, exitReason, revealedRole } = v;
  if (!isString(playerId) || !isNumber(seat) || !isBoolean(alive)) return null;
  if (exitReason !== null && exitReason !== 'voted_out' && exitReason !== 'disconnect_timeout' && exitReason !== 'guess_wrong') return null;
  if (revealedRole !== null && !BLANK_ROLES.includes(revealedRole as BlankRole)) return null;
  return {
    playerId,
    seat,
    alive,
    exitReason: exitReason as BlankPublicPlayerInfo['exitReason'],
    revealedRole: revealedRole as BlankRole | null,
  };
}

function parseBlankVoteSummary(v: unknown): BlankVoteSummary | null {
  if (!isObject(v) || !hasExactKeys(v, BLANK_VOTE_SUMMARY_KEYS)) return null;
  const { round, kind, outcome, eliminatedPlayerId, eliminatedRole, tally } = v;
  if (!isNumber(round)) return null;
  if (kind !== 'normal' && kind !== 'runoff') return null;
  if (outcome !== 'eliminated' && outcome !== 'tie' && outcome !== 'no_votes' && outcome !== 'runoff_tie') return null;
  if (eliminatedPlayerId !== null && !isString(eliminatedPlayerId)) return null;
  if (eliminatedRole !== null && !BLANK_ROLES.includes(eliminatedRole as BlankRole)) return null;
  if (!isObject(tally)) return null;
  const tallyParsed: Record<string, number> = {};
  for (const [key, value] of Object.entries(tally)) {
    if (!isNumber(value)) return null;
    tallyParsed[key] = value;
  }
  return {
    round,
    kind: kind as BlankVoteSummary['kind'],
    outcome: outcome as BlankVoteSummary['outcome'],
    eliminatedPlayerId: eliminatedPlayerId as string | null,
    eliminatedRole: eliminatedRole as BlankRole | null,
    tally: tallyParsed,
  };
}

function parseBlankReveal(v: unknown): BlankReveal | null {
  if (!isObject(v) || !hasExactKeys(v, BLANK_REVEAL_KEYS)) return null;
  const { civilianWord, roles } = v;
  if (!isString(civilianWord) || !isObject(roles)) return null;
  const rolesParsed: Record<string, BlankRole> = {};
  for (const [key, value] of Object.entries(roles)) {
    if (!BLANK_ROLES.includes(value as BlankRole)) return null;
    rolesParsed[key] = value as BlankRole;
  }
  return { civilianWord, roles: rolesParsed };
}

function parseBlankMe(v: unknown): BlankPlayerMeView | null {
  if (v === null) return null;
  if (!isObject(v) || !hasExactKeys(v, BLANK_ME_KEYS)) return null;
  const {
    playerId, word, role, alive, confirmed, hasVoted, myVote, isBlank,
    canGuess, canSubmitFinalGuess, guessUsed, guessPending,
  } = v;
  if (!isString(playerId)) return null;
  if (word !== null && !isString(word)) return null;
  if (role !== null && !BLANK_ROLES.includes(role as BlankRole)) return null;
  if (!isBoolean(alive) || !isBoolean(confirmed) || !isBoolean(hasVoted)) return null;
  if (myVote !== null && !isString(myVote)) return null;
  if (!isBoolean(isBlank) || !isBoolean(canGuess) || !isBoolean(canSubmitFinalGuess)) return null;
  if (!isBoolean(guessUsed) || !isBoolean(guessPending)) return null;
  return {
    playerId,
    word: word as string | null,
    role: role as BlankRole | null,
    alive,
    confirmed,
    hasVoted,
    myVote: myVote as string | null,
    isBlank,
    canGuess,
    canSubmitFinalGuess,
    guessUsed,
    guessPending,
  };
}

/**
 * 严格解析 undercover_blank_v1 视角。me 语义由调用方按角色决定：
 * - 观战视角：me 键必须缺失；
 * - 玩家视角：me 必须存在（可为 null）。
 * 任何未知键、缺失键或非法枚举都返回 null。
 */
export function parseBlankView(
  view: unknown,
  role: 'player' | 'spectator',
): BlankPlayerView | BlankPublicView | null {
  if (!isObject(view)) return null;
  if (!hasExactKeys(view, role === 'spectator' ? BLANK_PUBLIC_KEYS : [...BLANK_PUBLIC_KEYS, 'me'])) return null;
  const {
    gameId, rulesetId, phase, round, players, speakingOrder, currentSpeakerId, deadlineAt,
    votesSubmitted, votesExpected, runoffCandidates, confirmedPlayerIds, lastVoteSummary,
    winner, aborted, guessPending, revealMode, reveal,
  } = view;
  if (gameId !== 'undercover' || rulesetId !== 'undercover_blank_v1') return null;
  if (!BLANK_PHASES.includes(phase as BlankPhase)) return null;
  if (!isNumber(round) || !Array.isArray(players) || !Array.isArray(speakingOrder)) return null;
  if (!Array.isArray(runoffCandidates) || !Array.isArray(confirmedPlayerIds)) return null;
  if (currentSpeakerId !== null && !isString(currentSpeakerId)) return null;
  if (deadlineAt !== null && !isNumber(deadlineAt)) return null;
  if (!isNumber(votesSubmitted) || !isNumber(votesExpected)) return null;
  if (winner !== null && !BLANK_ROLES.includes(winner as BlankRole)) return null;
  if (!isBoolean(aborted) || !isBoolean(guessPending)) return null;
  if (revealMode !== 'immediate' && revealMode !== 'delayed') return null;

  const parsedPlayers: BlankPublicPlayerInfo[] = [];
  for (const entry of players) {
    const parsed = parseBlankPlayerInfo(entry);
    if (parsed === null) return null;
    parsedPlayers.push(parsed);
  }
  for (const id of speakingOrder) if (!isString(id)) return null;
  for (const id of runoffCandidates) if (!isString(id)) return null;
  for (const id of confirmedPlayerIds) if (!isString(id)) return null;

  const parsedVoteSummary = lastVoteSummary === null ? null : parseBlankVoteSummary(lastVoteSummary);
  if (lastVoteSummary !== null && parsedVoteSummary === null) return null;
  const parsedReveal = reveal === null ? null : parseBlankReveal(reveal);
  if (reveal !== null && parsedReveal === null) return null;

  const base: BlankPublicView = {
    gameId: 'undercover',
    rulesetId: 'undercover_blank_v1',
    phase: phase as BlankPhase,
    round: round as number,
    players: parsedPlayers,
    speakingOrder: speakingOrder as string[],
    currentSpeakerId: currentSpeakerId as string | null,
    deadlineAt: deadlineAt as number | null,
    votesSubmitted,
    votesExpected,
    runoffCandidates: runoffCandidates as string[],
    confirmedPlayerIds: confirmedPlayerIds as string[],
    lastVoteSummary: parsedVoteSummary,
    winner: winner as BlankWinner | null,
    aborted,
    guessPending,
    revealMode: revealMode as BlankRevealMode,
    reveal: parsedReveal,
  };

  if (role === 'spectator') {
    if ('me' in view) return null;
    return base;
  }
  if (!('me' in view)) return null;
  const parsedMe = parseBlankMe(view.me);
  if (view.me !== null && parsedMe === null) return null;
  return { ...base, me: parsedMe };
}
