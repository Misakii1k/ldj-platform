import type { GameContext, GameEffect, GameModule, ReduceResult } from '@ldj/shared';
import { WEREWOLF_MANIFEST } from '../shared/manifest.ts';
import { pickWerewolfBotAction } from './bot.ts';
import { buildWerewolfBotPrompt } from './botPrompt.ts';

export const WEREWOLF_STATE_SCHEMA_VERSION = 4 as const;

export type WerewolfRole = 'wolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';
export type WerewolfTeam = 'wolves' | 'village';
export type WerewolfPreset = 'classic' | 'advanced';
export type WerewolfPace = 'fast' | 'standard' | 'relaxed';
export type WerewolfWitchSelfSave = 'first_night' | 'never' | 'always';
export type WerewolfWinCondition = 'numbers' | 'roles';
export type WerewolfRulesetId =
  | 'werewolf_legacy_platform_v2'
  | 'werewolf_platform_open_kill_v1';
/**
 * 夜间击杀票的合法目标范围。
 * `non_wolf`：werewolf_legacy_platform_v2 冻结语义，狼人不能投同伴，也不能自刀。
 * `any`：werewolf_platform_open_kill_v1，狼人可以投任意存活玩家，包括自己与同伴。
 */
export type WerewolfWolfKillScope = 'non_wolf' | 'any';

/** 扩展角色池开关：开启则各入池 1 张（默认全关） */
export interface WerewolfRolePool {
  guard: boolean;
  hunter: boolean;
  idiot: boolean;
}
export type WerewolfPhase =
  | 'role_reveal'
  | 'night'
  | 'hunter_shot'
  | 'day_announcement'
  | 'discussion'
  | 'voting'
  | 'runoff_voting'
  | 'vote_result'
  | 'last_words'
  | 'game_over';
export type WerewolfTimedPhase = Exclude<WerewolfPhase, 'game_over'>;
export type WerewolfExitReason =
  | 'night_kill'
  | 'poisoned'
  | 'voted_out'
  | 'hunter_shot'
  | 'disconnect_timeout';

export interface WerewolfConfig {
  rulesetId: WerewolfRulesetId;
  preset: WerewolfPreset;
  pace: WerewolfPace;
  witchSelfSave: WerewolfWitchSelfSave;
  winCondition: WerewolfWinCondition;
  wolfKillScope: WerewolfWolfKillScope;
  roles: WerewolfRolePool;
}

export interface WerewolfPlayerState {
  role: WerewolfRole;
  alive: boolean;
  seat: number;
  forfeited: boolean;
  exitReason: WerewolfExitReason | null;
  /** 白痴被放逐翻牌免死（公开可见，失去投票权） */
  idiotRevealed: boolean;
}

export interface WerewolfSeerResult {
  night: number;
  playerId: string;
  team: WerewolfTeam;
}

export interface WerewolfNightState {
  wolfVotes: Record<string, string>;
  killTargetId: string | null;
  seerChecked: boolean;
  seerResult: WerewolfSeerResult | null;
  witchSaveDecision: boolean | null;
  witchPoisonDecided: boolean;
  witchPoisonTargetId: string | null;
  /** 守卫本夜决定是否守人 */
  guardDecided: boolean;
  guardTargetId: string | null;
}

export type WerewolfVoteKind = 'normal' | 'runoff';
export type WerewolfVoteOutcome =
  | 'eliminated'
  | 'idiot_saved'
  | 'tie'
  | 'no_votes'
  | 'runoff_tie';

export interface WerewolfVoteSummary {
  day: number;
  kind: WerewolfVoteKind;
  outcome: WerewolfVoteOutcome;
  tally: Record<string, number>;
  abstained: number;
  eliminatedPlayerId: string | null;
}

export interface WerewolfVoteRecord extends WerewolfVoteSummary {
  votes: Record<string, string | null>;
}

interface WerewolfPendingOutcome {
  next: 'runoff' | 'last_words' | 'next_night';
  candidates: string[];
  winner: WerewolfTeam | null;
}

export interface WerewolfState {
  schemaVersion: typeof WEREWOLF_STATE_SCHEMA_VERSION;
  phase: WerewolfPhase;
  day: number;
  players: Record<string, WerewolfPlayerState>;
  config: WerewolfConfig;
  confirmedRolePlayerIds: string[];
  announcementConfirmedPlayerIds: string[];
  night: WerewolfNightState;
  seerHistory: WerewolfSeerResult[];
  lastNightDeaths: string[];
  speakingOrder: string[];
  currentSpeakerIndex: number;
  votes: Record<string, string | null>;
  runoffCandidates: string[];
  lastVoteSummary: WerewolfVoteSummary | null;
  voteHistory: WerewolfVoteRecord[];
  pendingOutcome: WerewolfPendingOutcome | null;
  lastWordsPlayerId: string | null;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  /** 守卫上一夜守的人（禁连守：本夜不能守同一人） */
  lastGuardTargetId: string | null;
  /** 待开枪的猎人（hunter_shot 阶段） */
  pendingShoot: string | null;
  deadlineAt: number | null;
  phaseToken: string | null;
  winner: WerewolfTeam | null;
  aborted: boolean;
}

export type WerewolfAction =
  | { type: 'begin' }
  | { type: 'confirm_role' }
  | { type: 'night_kill'; targetPlayerId: string }
  | { type: 'seer_check'; targetPlayerId: string }
  | { type: 'witch_save'; save: boolean }
  | { type: 'witch_poison'; targetPlayerId: string | null }
  | { type: 'guard_guard'; targetPlayerId: string | null }
  | { type: 'hunter_shoot'; targetPlayerId: string | null }
  | { type: 'confirm_announcement' }
  | { type: 'finish_speech' }
  | { type: 'day_vote'; targetPlayerId: string | null }
  | { type: 'finish_last_words' }
  | { type: 'phase_timeout'; phase: WerewolfTimedPhase; day: number; token: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export interface WerewolfPublicPlayer {
  playerId: string;
  alive: boolean;
  seat: number;
  forfeited: boolean;
  exitReason: WerewolfExitReason | null;
  revealedRole: WerewolfRole | null;
  /** 白痴翻牌公开可见 */
  idiotRevealed: boolean;
}

export interface WerewolfPublicView {
  gameId: 'werewolf';
  schemaVersion: typeof WEREWOLF_STATE_SCHEMA_VERSION;
  phase: WerewolfPhase;
  day: number;
  players: WerewolfPublicPlayer[];
  config: WerewolfConfig;
  confirmedRolePlayerIds: string[];
  announcementConfirmedPlayerIds: string[];
  lastNightDeaths: string[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  lastWordsPlayerId: string | null;
  deadlineAt: number | null;
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  lastVoteSummary: WerewolfVoteSummary | null;
  /** hunter_shot 阶段：待开枪的猎人 */
  pendingShooterId: string | null;
  winner: WerewolfTeam | null;
  aborted: boolean;
  reveal: {
    roles: Record<string, WerewolfRole>;
    voteHistory: WerewolfVoteRecord[];
  } | null;
}

export interface WerewolfPlayerView extends WerewolfPublicView {
  me: {
    playerId: string;
    role: WerewolfRole;
    alive: boolean;
    forfeited: boolean;
    confirmedRole: boolean;
    confirmedAnnouncement: boolean;
    canAct: boolean;
    hasVoted: boolean;
    myVote: string | null;
    lastWordsPending: boolean;
    wolfTeammateIds: string[];
    wolfVotes: Record<string, string>;
    hasNightVoted: boolean;
    seerResults: WerewolfSeerResult[];
    seerCheckedThisNight: boolean;
    nightVictimId: string | null;
    witchSaveUsed: boolean;
    witchPoisonUsed: boolean;
    witchSaveDecision: boolean | null;
    witchPoisonDecided: boolean;
    witchCanSelfSave: boolean;
    /** 守卫专属 */
    guardTargetId: string | null;
    guardDecided: boolean;
    lastGuardTargetId: string | null;
    /** 猎人专属：是否正处于待开枪阶段 */
    pendingShoot: boolean;
    /** 白痴翻牌（本人可见，与公开一致） */
    idiotRevealed: boolean;
  } | null;
}

export interface WerewolfResult {
  winner: WerewolfTeam | null;
  days: number;
  roles: Record<string, WerewolfRole>;
  aborted: boolean;
}

export type WerewolfEvent =
  | { type: 'phase_changed'; phase: WerewolfPhase; day: number }
  | { type: 'night_resolved'; deaths: string[]; day: number }
  | { type: 'player_eliminated'; playerId: string; reason: WerewolfExitReason }
  | { type: 'vote_resolved'; summary: WerewolfVoteSummary }
  | { type: 'game_finished'; winner: WerewolfTeam | null; days: number; aborted: boolean };

type Result = ReduceResult<WerewolfState, WerewolfEvent>;

const PLAYER_ACTIONS = new Set<WerewolfAction['type']>([
  'confirm_role',
  'night_kill',
  'seer_check',
  'witch_save',
  'witch_poison',
  'guard_guard',
  'hunter_shoot',
  'confirm_announcement',
  'finish_speech',
  'day_vote',
  'finish_last_words',
]);

const TIMED_PHASES = new Set<WerewolfTimedPhase>([
  'role_reveal',
  'night',
  'hunter_shot',
  'day_announcement',
  'discussion',
  'voting',
  'runoff_voting',
  'vote_result',
  'last_words',
]);

const SPECIAL_ROLES: readonly WerewolfRole[] = ['seer', 'witch', 'guard', 'hunter', 'idiot'];

const PACE_MS: Record<WerewolfPace, Record<WerewolfTimedPhase, number>> = {
  fast: {
    role_reveal: 15_000,
    night: 30_000,
    hunter_shot: 15_000,
    day_announcement: 10_000,
    discussion: 30_000,
    voting: 20_000,
    runoff_voting: 20_000,
    vote_result: 4_000,
    last_words: 20_000,
  },
  standard: {
    role_reveal: 30_000,
    night: 60_000,
    hunter_shot: 30_000,
    day_announcement: 20_000,
    discussion: 60_000,
    voting: 45_000,
    runoff_voting: 45_000,
    vote_result: 5_000,
    last_words: 30_000,
  },
  relaxed: {
    role_reveal: 45_000,
    night: 90_000,
    hunter_shot: 45_000,
    day_announcement: 30_000,
    discussion: 90_000,
    voting: 60_000,
    runoff_voting: 60_000,
    vote_result: 7_000,
    last_words: 45_000,
  },
};

function deny(message: string): Result {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

function noop(state: WerewolfState): Result {
  return { ok: true, state, events: [], effects: [] };
}

function cloneState(state: WerewolfState): WerewolfState {
  return structuredClone(state);
}

function orderedIds(state: WerewolfState): string[] {
  return Object.entries(state.players)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

function aliveIds(state: WerewolfState): string[] {
  return orderedIds(state).filter((id) => state.players[id]?.alive);
}

function aliveRoleIds(state: WerewolfState, role: WerewolfRole): string[] {
  return aliveIds(state).filter((id) => state.players[id]?.role === role);
}

function teamOf(role: WerewolfRole): WerewolfTeam {
  return role === 'wolf' ? 'wolves' : 'village';
}

function checkWinner(state: WerewolfState): WerewolfTeam | null {
  let wolves = 0;
  let village = 0;
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;
    if (player.role === 'wolf') wolves += 1;
    else village += 1;
  }
  if (wolves + village === 0) return null;
  if (wolves === 0) return 'village';
  if (state.config.winCondition === 'roles') {
    const hasVillager = Object.values(state.players).some((p) => p.alive && p.role === 'villager');
    const hasSpecial = Object.values(state.players).some((p) => p.alive && SPECIAL_ROLES.includes(p.role));
    if (!hasVillager || !hasSpecial) return 'wolves';
    return null;
  }
  if (wolves >= village) return 'wolves';
  return null;
}

function phaseToken(state: WerewolfState, phase: WerewolfTimedPhase, suffix = ''): string {
  return `${phase}:${state.day}${suffix ? `:${suffix}` : ''}`;
}

function schedulePhase(
  state: WerewolfState,
  ctx: GameContext,
  phase: WerewolfTimedPhase,
  effects: GameEffect[],
  suffix = '',
): void {
  const token = phaseToken(state, phase, suffix);
  state.deadlineAt = ctx.now + PACE_MS[state.config.pace][phase];
  state.phaseToken = token;
  effects.push({
    type: 'schedule_timer',
    timerId: `werewolf:${token}`,
    deadlineAt: state.deadlineAt,
    action: { type: 'phase_timeout', phase, day: state.day, token },
  });
}

function cancelCurrentTimer(state: WerewolfState, effects: GameEffect[]): void {
  if (state.phaseToken) effects.push({ type: 'cancel_timer', timerId: `werewolf:${state.phaseToken}` });
  state.deadlineAt = null;
  state.phaseToken = null;
}

function phaseChanged(state: WerewolfState, events: WerewolfEvent[]): void {
  events.push({ type: 'phase_changed', phase: state.phase, day: state.day });
}

function finishGame(
  state: WerewolfState,
  winner: WerewolfTeam | null,
  aborted: boolean,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'game_over';
  state.winner = winner;
  state.aborted = aborted;
  state.pendingOutcome = null;
  state.lastWordsPlayerId = null;
  events.push({ type: 'game_finished', winner, days: state.day, aborted });
  if (winner) {
    effects.push({ type: 'system_message', text: winner === 'wolves' ? '狼人阵营胜利！' : '好人阵营胜利！' });
  } else if (aborted) {
    effects.push({ type: 'system_message', text: '所有玩家均已退出，对局终止' });
  }
}

function eliminate(
  state: WerewolfState,
  playerId: string,
  reason: WerewolfExitReason,
  events: WerewolfEvent[],
): void {
  const player = state.players[playerId];
  if (!player || !player.alive) return;
  player.alive = false;
  player.exitReason = reason;
  events.push({ type: 'player_eliminated', playerId, reason });
}

function emptyNight(state: WerewolfState): WerewolfNightState {
  const witchAlive = aliveRoleIds(state, 'witch').length > 0;
  const guardAlive = aliveRoleIds(state, 'guard').length > 0;
  return {
    wolfVotes: {},
    killTargetId: null,
    seerChecked: aliveRoleIds(state, 'seer').length === 0,
    seerResult: null,
    witchSaveDecision: witchAlive && !state.witchSaveUsed ? null : false,
    witchPoisonDecided: !witchAlive || state.witchPoisonUsed,
    witchPoisonTargetId: null,
    guardDecided: !guardAlive,
    guardTargetId: null,
  };
}

function startNight(
  state: WerewolfState,
  ctx: GameContext,
  day: number,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  state.day = day;
  state.phase = 'night';
  state.night = emptyNight(state);
  state.lastNightDeaths = [];
  state.announcementConfirmedPlayerIds = [];
  state.speakingOrder = [];
  state.currentSpeakerIndex = 0;
  state.votes = {};
  state.runoffCandidates = [];
  state.pendingOutcome = null;
  state.lastWordsPlayerId = null;
  phaseChanged(state, events);
  schedulePhase(state, ctx, 'night', effects);
  effects.push({ type: 'system_message', text: `第 ${day} 夜开始` });
}

function wolfTargetCandidates(state: WerewolfState): string[] {
  // 开放夜刀规则集允许把票投给任意存活玩家（含自己与同伴）；legacy 基线仍排除狼人。
  if (state.config.wolfKillScope === 'any') return aliveIds(state);
  return aliveIds(state).filter((id) => state.players[id]?.role !== 'wolf');
}

function selectWolfTarget(state: WerewolfState, allowFallback: boolean): string | null {
  const validTargets = new Set(wolfTargetCandidates(state));
  const tally = new Map<string, number>();
  for (const wolfId of aliveRoleIds(state, 'wolf')) {
    const target = state.night.wolfVotes[wolfId];
    if (target && validTargets.has(target)) tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  if (tally.size === 0) return allowFallback ? wolfTargetCandidates(state)[0] ?? null : null;
  const top = Math.max(...tally.values());
  return [...tally.entries()]
    .filter(([, count]) => count === top)
    .map(([id]) => id)
    .sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0) || a.localeCompare(b))[0] ?? null;
}

function allWolvesVoted(state: WerewolfState): boolean {
  const wolves = aliveRoleIds(state, 'wolf');
  return wolves.length > 0 && wolves.every((id) => id in state.night.wolfVotes);
}

function witchFinished(state: WerewolfState): boolean {
  return aliveRoleIds(state, 'witch').length === 0 ||
    state.night.witchSaveDecision === true ||
    (state.night.witchSaveDecision === false && state.night.witchPoisonDecided);
}

function guardFinished(state: WerewolfState): boolean {
  return aliveRoleIds(state, 'guard').length === 0 || state.night.guardDecided;
}

/** 狼刀是否被守卫挡下 */
function wolfKillBlocked(state: WerewolfState): boolean {
  return state.night.guardTargetId !== null && state.night.guardTargetId === state.night.killTargetId;
}

/** 死亡结算后触发猎人开枪（被毒死/超时弃权不触发） */
function hunterShooterOf(
  state: WerewolfState,
  deathReasons: ReadonlyMap<string, WerewolfExitReason>,
): string | null {
  for (const [id, reason] of deathReasons) {
    if (reason === 'poisoned' || reason === 'disconnect_timeout') continue;
    if (state.players[id]?.role === 'hunter') return id;
  }
  return null;
}

/** 进入猎人开枪阶段（30 秒限时，超时视为放弃） */
function enterHunterShot(
  state: WerewolfState,
  ctx: GameContext,
  shooterId: string,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.pendingShoot = shooterId;
  state.phase = 'hunter_shot';
  phaseChanged(state, events);
  schedulePhase(state, ctx, 'hunter_shot', effects);
  effects.push({
    type: 'system_message',
    text: '猎人出局，可以开枪带走一名玩家（也可以放弃开枪）',
  });
}

/** 猎人开枪结算：开枪或跳过 → 判胜负 → 夜晚来源进天亮公告，投票来源继续投票流程 */
function resolveHunterShot(
  state: WerewolfState,
  ctx: GameContext,
  firedTargetId: string | null,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  const shooterId = state.pendingShoot;
  if (firedTargetId !== null) {
    const target = state.players[firedTargetId];
    if (target?.alive) {
      eliminate(state, firedTargetId, 'hunter_shot', events);
      effects.push({ type: 'system_message', text: '猎人开枪带走了被击中的玩家' });
    }
    // 被枪杀者无遗言：放逐流程跳过 last_words
    if (state.pendingOutcome?.next === 'last_words') {
      state.pendingOutcome = { next: 'next_night', candidates: [], winner: null };
    }
  } else {
    effects.push({ type: 'system_message', text: '猎人放弃了开枪' });
  }
  state.pendingShoot = null;
  const winner = checkWinner(state);
  if (winner) {
    finishGame(state, winner, false, events, effects);
    return;
  }
  if (state.pendingOutcome) {
    // 投票来源：继续投票结算流程（遗言/加赛/下一夜）
    continueAfterVoteResult(state, ctx, events, effects);
    return;
  }
  if (shooterId) {
    // 夜晚来源：天亮公告
    state.phase = 'day_announcement';
    state.announcementConfirmedPlayerIds = [];
    phaseChanged(state, events);
    schedulePhase(state, ctx, 'day_announcement', effects);
    effects.push({
      type: 'system_message',
      text: state.lastNightDeaths.length === 0 ? '天亮了，昨夜是平安夜' : `天亮了，昨夜有 ${state.lastNightDeaths.length} 人死亡`,
    });
  }
}

function resolveNightWithContext(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  const deathReasons = new Map<string, WerewolfExitReason>();
  if (state.night.killTargetId && state.night.witchSaveDecision !== true) {
    if (wolfKillBlocked(state)) {
      effects.push({
        type: 'system_message',
        text: '守卫守住了狼人的袭击',
      });
    } else {
      deathReasons.set(state.night.killTargetId, 'night_kill');
    }
  }
  if (state.night.witchPoisonTargetId) deathReasons.set(state.night.witchPoisonTargetId, 'poisoned');
  for (const [id, reason] of deathReasons) eliminate(state, id, reason, events);
  state.lastNightDeaths = [...deathReasons.keys()].sort(
    (a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0),
  );
  events.push({ type: 'night_resolved', deaths: [...state.lastNightDeaths], day: state.day });
  const winner = checkWinner(state);
  if (winner) {
    finishGame(state, winner, false, events, effects);
    return;
  }
  const shooterId = hunterShooterOf(state, deathReasons);
  if (shooterId) {
    enterHunterShot(state, ctx, shooterId, events, effects);
    return;
  }
  state.phase = 'day_announcement';
  state.announcementConfirmedPlayerIds = [];
  phaseChanged(state, events);
  schedulePhase(state, ctx, 'day_announcement', effects);
  effects.push({
    type: 'system_message',
    text: state.lastNightDeaths.length === 0 ? '天亮了，昨夜是平安夜' : `天亮了，昨夜有 ${state.lastNightDeaths.length} 人死亡`,
  });
}

function tryResolveNight(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  if (!allWolvesVoted(state)) return;
  state.night.killTargetId ??= selectWolfTarget(state, false);
  if (!state.night.killTargetId || !state.night.seerChecked || !witchFinished(state) || !guardFinished(state)) return;
  resolveNightWithContext(state, ctx, events, effects);
}

function speakingOrderForDay(state: WerewolfState): string[] {
  const alive = aliveIds(state);
  if (alive.length === 0) return [];
  const offset = (state.day - 1) % alive.length;
  return [...alive.slice(offset), ...alive.slice(0, offset)];
}

function startDiscussion(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'discussion';
  state.speakingOrder = speakingOrderForDay(state);
  state.currentSpeakerIndex = 0;
  phaseChanged(state, events);
  schedulePhase(state, ctx, 'discussion', effects, '0');
  effects.push({ type: 'system_message', text: `第 ${state.day} 天发言开始` });
}

function startVoting(
  state: WerewolfState,
  ctx: GameContext,
  kind: WerewolfVoteKind,
  candidates: string[],
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.phase = kind === 'normal' ? 'voting' : 'runoff_voting';
  state.votes = {};
  state.runoffCandidates = [...candidates];
  state.pendingOutcome = null;
  phaseChanged(state, events);
  schedulePhase(state, ctx, state.phase, effects, kind);
  effects.push({
    type: 'system_message',
    text: kind === 'normal' ? '放逐投票开始' : '最高票并列，进入加赛投票',
  });
}

function advanceSpeaker(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  for (let index = state.currentSpeakerIndex + 1; index < state.speakingOrder.length; index += 1) {
    const id = state.speakingOrder[index]!;
    if (!state.players[id]?.alive) continue;
    state.currentSpeakerIndex = index;
    schedulePhase(state, ctx, 'discussion', effects, String(index));
    return;
  }
  startVoting(state, ctx, 'normal', [], events, effects);
}

/** 有投票权的存活玩家（翻牌白痴失去投票权） */
function votingIds(state: WerewolfState): string[] {
  return aliveIds(state).filter((id) => !state.players[id]?.idiotRevealed);
}

/** 所有有投票权的存活玩家都已提交选票 */
function allVotesSubmitted(state: WerewolfState): boolean {
  const voters = votingIds(state);
  return voters.every((id) => id in state.votes);
}

function settleVotes(
  state: WerewolfState,
  ctx: GameContext,
  kind: WerewolfVoteKind,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  const tally: Record<string, number> = {};
  let abstained = 0;
  for (const voterId of votingIds(state)) {
    const target = state.votes[voterId];
    if (!target || !state.players[target]?.alive || state.players[target]?.idiotRevealed) {
      abstained += 1;
      continue;
    }
    tally[target] = (tally[target] ?? 0) + 1;
  }

  const entries = Object.entries(tally);
  let outcome: WerewolfVoteOutcome;
  let eliminatedPlayerId: string | null = null;
  let pending: WerewolfPendingOutcome;
  if (entries.length === 0) {
    outcome = kind === 'normal' ? 'no_votes' : 'runoff_tie';
    pending = { next: 'next_night', candidates: [], winner: null };
  } else {
    const top = Math.max(...entries.map(([, count]) => count));
    const leaders = entries
      .filter(([, count]) => count === top)
      .map(([id]) => id)
      .sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0));
    if (leaders.length === 1) {
      eliminatedPlayerId = leaders[0]!;
      const target = state.players[eliminatedPlayerId]!;
      if (target.role === 'idiot' && !target.idiotRevealed) {
        // 白痴被放逐：自动翻牌免死，失去投票权，无遗言
        target.idiotRevealed = true;
        outcome = 'idiot_saved';
        pending = { next: 'next_night', candidates: [], winner: null };
        effects.push({
          type: 'system_message',
          text: '白痴被放逐时翻牌免死，从今往后失去投票权',
        });
      } else {
        outcome = 'eliminated';
        eliminate(state, eliminatedPlayerId, 'voted_out', events);
        pending = { next: 'last_words', candidates: [], winner: checkWinner(state) };
      }
    } else if (kind === 'normal') {
      outcome = 'tie';
      state.runoffCandidates = leaders;
      pending = { next: 'runoff', candidates: leaders, winner: null };
    } else {
      outcome = 'runoff_tie';
      pending = { next: 'next_night', candidates: [], winner: null };
    }
  }

  const summary: WerewolfVoteSummary = {
    day: state.day,
    kind,
    outcome,
    tally,
    abstained,
    eliminatedPlayerId,
  };
  state.lastVoteSummary = summary;
  state.voteHistory.push({ ...summary, tally: { ...tally }, votes: { ...state.votes } });
  state.pendingOutcome = pending;

  // 被放逐的猎人：先开枪再进入投票结算流程
  const shooterId =
    outcome === 'eliminated' && eliminatedPlayerId !== null &&
    state.players[eliminatedPlayerId]?.role === 'hunter'
      ? eliminatedPlayerId
      : null;
  if (shooterId) {
    enterHunterShot(state, ctx, shooterId, events, effects);
    return;
  }
  state.phase = 'vote_result';
  events.push({ type: 'vote_resolved', summary }, { type: 'phase_changed', phase: 'vote_result', day: state.day });
  schedulePhase(state, ctx, 'vote_result', effects, kind);
}

function startLastWords(
  state: WerewolfState,
  ctx: GameContext,
  playerId: string,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'last_words';
  state.lastWordsPlayerId = playerId;
  phaseChanged(state, events);
  schedulePhase(state, ctx, 'last_words', effects, playerId);
  effects.push({ type: 'system_message', text: '被放逐玩家发表遗言' });
}

function finishLastWords(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  const winner = state.pendingOutcome?.winner ?? checkWinner(state);
  cancelCurrentTimer(state, effects);
  state.lastWordsPlayerId = null;
  if (winner) finishGame(state, winner, false, events, effects);
  else startNight(state, ctx, state.day + 1, events, effects);
}

function continueAfterVoteResult(
  state: WerewolfState,
  ctx: GameContext,
  events: WerewolfEvent[],
  effects: GameEffect[],
): void {
  const pending = state.pendingOutcome;
  if (!pending) {
    startNight(state, ctx, state.day + 1, events, effects);
    return;
  }
  if (pending.next === 'runoff') {
    const candidates = pending.candidates.filter((id) => state.players[id]?.alive);
    if (candidates.length >= 2) startVoting(state, ctx, 'runoff', candidates, events, effects);
    else startNight(state, ctx, state.day + 1, events, effects);
    return;
  }
  if (pending.next === 'last_words' && state.lastVoteSummary?.eliminatedPlayerId) {
    startLastWords(state, ctx, state.lastVoteSummary.eliminatedPlayerId, events, effects);
    return;
  }
  startNight(state, ctx, state.day + 1, events, effects);
}

function allSubmitted(state: WerewolfState, submitted: readonly string[]): boolean {
  const set = new Set(submitted);
  return aliveIds(state).every((id) => set.has(id));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function exactKeys(raw: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(raw).some((key) => !allowedSet.has(key))) throw new Error('Invalid action');
}

function playerId(input: unknown): string {
  if (typeof input !== 'string' || input.length < 1 || input.length > 64) throw new Error('Invalid player id');
  return input;
}

function parseConfig(input: unknown): WerewolfConfig {
  const raw = input === undefined ? {} : input;
  if (!isRecord(raw)) throw new Error('Invalid config');
  exactKeys(raw, ['rulesetId', 'preset', 'pace', 'witchSelfSave', 'winCondition', 'wolfKillScope', 'roles', 'guard', 'hunter', 'idiot']);
  const preset = raw.preset ?? 'classic';
  const pace = raw.pace ?? 'standard';
  if (preset !== 'classic' && preset !== 'advanced') throw new Error('Invalid preset');
  if (pace !== 'fast' && pace !== 'standard' && pace !== 'relaxed') throw new Error('Invalid pace');
  const witchSelfSave = raw.witchSelfSave ?? 'first_night';
  if (witchSelfSave !== 'first_night' && witchSelfSave !== 'never' && witchSelfSave !== 'always') {
    throw new Error('Invalid witchSelfSave');
  }
  const winCondition = raw.winCondition ?? 'numbers';
  if (winCondition !== 'numbers' && winCondition !== 'roles') throw new Error('Invalid winCondition');
  if (raw.wolfKillScope !== undefined && raw.wolfKillScope !== 'non_wolf' && raw.wolfKillScope !== 'any') {
    throw new Error('Invalid wolfKillScope');
  }
  const rulesetId = raw.rulesetId ?? (raw.wolfKillScope === 'any'
    ? 'werewolf_platform_open_kill_v1'
    : 'werewolf_legacy_platform_v2');
  if (rulesetId !== 'werewolf_legacy_platform_v2' && rulesetId !== 'werewolf_platform_open_kill_v1') {
    throw new Error('Invalid rulesetId');
  }
  const wolfKillScope: WerewolfWolfKillScope = rulesetId === 'werewolf_platform_open_kill_v1' ? 'any' : 'non_wolf';
  if (raw.wolfKillScope !== undefined && raw.wolfKillScope !== wolfKillScope) {
    throw new Error('rulesetId 与 wolfKillScope 不匹配');
  }
  const rolesRaw = isRecord(raw.roles) ? raw.roles : {};
  exactKeys(rolesRaw, ['guard', 'hunter', 'idiot']);
  // 扁平键（目录 setup 选项，客户端统一链路）与旧嵌套 roles 兼容合并：任一为 true 即入池
  const roles: WerewolfRolePool = {
    guard: rolesRaw.guard === true || raw.guard === true,
    hunter: rolesRaw.hunter === true || raw.hunter === true,
    idiot: rolesRaw.idiot === true || raw.idiot === true,
  };
  return { rulesetId, preset, pace, witchSelfSave, winCondition, wolfKillScope, roles };
}

function parseAction(input: unknown): WerewolfAction {
  if (!isRecord(input) || typeof input.type !== 'string') throw new Error('Invalid action');
  const raw = input;
  switch (raw.type) {
    case 'begin':
    case 'confirm_role':
    case 'confirm_announcement':
    case 'finish_speech':
    case 'finish_last_words':
      exactKeys(raw, ['type']);
      return { type: raw.type };
    case 'night_kill':
    case 'seer_check':
      exactKeys(raw, ['type', 'targetPlayerId']);
      return { type: raw.type, targetPlayerId: playerId(raw.targetPlayerId) };
    case 'witch_save':
      exactKeys(raw, ['type', 'save']);
      if (typeof raw.save !== 'boolean') throw new Error('Invalid save decision');
      return { type: 'witch_save', save: raw.save };
    case 'witch_poison':
      exactKeys(raw, ['type', 'targetPlayerId']);
      return { type: 'witch_poison', targetPlayerId: raw.targetPlayerId === null ? null : playerId(raw.targetPlayerId) };
    case 'guard_guard':
      exactKeys(raw, ['type', 'targetPlayerId']);
      return { type: 'guard_guard', targetPlayerId: raw.targetPlayerId === null ? null : playerId(raw.targetPlayerId) };
    case 'hunter_shoot':
      exactKeys(raw, ['type', 'targetPlayerId']);
      return { type: 'hunter_shoot', targetPlayerId: raw.targetPlayerId === null ? null : playerId(raw.targetPlayerId) };
    case 'day_vote':
      exactKeys(raw, ['type', 'targetPlayerId']);
      return { type: 'day_vote', targetPlayerId: raw.targetPlayerId === null ? null : playerId(raw.targetPlayerId) };
    case 'phase_timeout':
      exactKeys(raw, ['type', 'phase', 'day', 'token']);
      if (!TIMED_PHASES.has(raw.phase as WerewolfTimedPhase)) throw new Error('Invalid timeout phase');
      if (!Number.isInteger(raw.day) || (raw.day as number) < 0) throw new Error('Invalid timeout day');
      if (typeof raw.token !== 'string' || raw.token.length < 1 || raw.token.length > 128) throw new Error('Invalid timeout token');
      return { type: 'phase_timeout', phase: raw.phase as WerewolfTimedPhase, day: raw.day as number, token: raw.token };
    case 'player_forfeited': {
      exactKeys(raw, ['type', 'playerIds']);
      if (!Array.isArray(raw.playerIds) || raw.playerIds.length < 1 || raw.playerIds.length > 12) throw new Error('Invalid forfeited players');
      return { type: 'player_forfeited', playerIds: [...new Set(raw.playerIds.map(playerId))] };
    }
    default:
      throw new Error('Invalid action');
  }
}

function playerCanAct(state: WerewolfState, id: string): boolean {
  const player = state.players[id];
  if (!player || player.forfeited) return false;
  switch (state.phase) {
    case 'role_reveal':
      return player.alive && !state.confirmedRolePlayerIds.includes(id);
    case 'night':
      if (!player.alive) return false;
      if (player.role === 'wolf') return !(id in state.night.wolfVotes);
      if (player.role === 'seer') return !state.night.seerChecked;
      if (player.role === 'witch') return state.night.killTargetId !== null && !witchFinished(state);
      if (player.role === 'guard') return !state.night.guardDecided;
      return false;
    case 'hunter_shot':
      return state.pendingShoot === id;
    case 'day_announcement':
      return player.alive && !state.announcementConfirmedPlayerIds.includes(id);
    case 'discussion':
      return player.alive && state.speakingOrder[state.currentSpeakerIndex] === id;
    case 'voting':
    case 'runoff_voting':
      return player.alive && !player.idiotRevealed && !(id in state.votes);
    case 'last_words':
      return state.lastWordsPlayerId === id;
    default:
      return false;
  }
}

function publicView(state: WerewolfState): WerewolfPublicView {
  const over = state.phase === 'game_over';
  const voting = state.phase === 'voting' || state.phase === 'runoff_voting';
  return {
    gameId: 'werewolf',
    schemaVersion: WEREWOLF_STATE_SCHEMA_VERSION,
    phase: state.phase,
    day: state.day,
    players: orderedIds(state).map((id) => {
      const player = state.players[id]!;
      return {
        playerId: id,
        alive: player.alive,
        seat: player.seat,
        forfeited: player.forfeited,
        exitReason: player.exitReason,
        revealedRole: over ? player.role : null,
        idiotRevealed: player.idiotRevealed,
      };
    }),
    config: { ...state.config },
    confirmedRolePlayerIds: [...state.confirmedRolePlayerIds],
    announcementConfirmedPlayerIds: [...state.announcementConfirmedPlayerIds],
    lastNightDeaths: [...state.lastNightDeaths],
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: state.phase === 'discussion' ? state.speakingOrder[state.currentSpeakerIndex] ?? null : null,
    lastWordsPlayerId: state.lastWordsPlayerId,
    deadlineAt: state.deadlineAt,
    votesSubmitted: voting ? Object.keys(state.votes).length : 0,
    votesExpected: voting ? votingIds(state).length : 0,
    runoffCandidates: [...state.runoffCandidates],
    lastVoteSummary: state.lastVoteSummary ? structuredClone(state.lastVoteSummary) : null,
    pendingShooterId: state.phase === 'hunter_shot' ? state.pendingShoot : null,
    winner: state.winner,
    aborted: state.aborted,
    reveal: over
      ? {
          roles: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.role])),
          voteHistory: structuredClone(state.voteHistory),
        }
      : null,
  };
}

interface LegacyWerewolfState {
  phase: 'night' | 'day_announcement' | 'discussion' | 'voting' | 'game_over';
  day: number;
  players: Record<string, { role: WerewolfRole; alive: boolean; seat: number }>;
  night: {
    killTargetId: string | null;
    seerChecked: boolean;
    seerResult: { playerId: string; team: WerewolfTeam } | null;
    witchSaveDecision: boolean | null;
    witchPoisonTargetId?: string | null;
  };
  lastNightDeaths: string[];
  speakingOrder: string[];
  currentSpeakerIndex: number;
  votes: Record<string, string>;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  winner: WerewolfTeam | null;
}

function migrateV1(snapshot: unknown) {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 1 || !isRecord(snapshot.players) || !isRecord(snapshot.night)) {
    throw new Error('Invalid werewolf v1 snapshot');
  }
  const old = snapshot as unknown as LegacyWerewolfState;
  const players = Object.fromEntries(
    Object.entries(old.players).map(([id, player]) => [
      id,
      {
        ...player,
        forfeited: false,
        exitReason: player.alive ? null : ('night_kill' as const),
        idiotRevealed: false,
      },
    ]),
  );
  const wolfVotes: Record<string, string> = {};
  if (old.night.killTargetId) {
    for (const [id, player] of Object.entries(old.players)) {
      if (player.alive && player.role === 'wolf') wolfVotes[id] = old.night.killTargetId;
    }
  }
  const seerResult = old.night.seerResult
    ? { night: old.day, playerId: old.night.seerResult.playerId, team: old.night.seerResult.team }
    : null;
  return {
    schemaVersion: 2,
    phase: old.phase,
    day: old.day,
    players,
    config: { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers' },
    confirmedRolePlayerIds: Object.keys(players),
    announcementConfirmedPlayerIds: [],
    night: {
      wolfVotes,
      killTargetId: old.night.killTargetId,
      seerChecked: old.night.seerChecked,
      seerResult,
      witchSaveDecision: old.night.witchSaveDecision,
      witchPoisonDecided: old.night.witchPoisonTargetId !== undefined,
      witchPoisonTargetId: old.night.witchPoisonTargetId ?? null,
    },
    seerHistory: seerResult ? [seerResult] : [],
    lastNightDeaths: [...old.lastNightDeaths],
    speakingOrder: [...old.speakingOrder],
    currentSpeakerIndex: old.currentSpeakerIndex,
    votes: { ...old.votes },
    runoffCandidates: [],
    lastVoteSummary: null,
    voteHistory: [],
    pendingOutcome: null,
    lastWordsPlayerId: null,
    witchSaveUsed: old.witchSaveUsed,
    witchPoisonUsed: old.witchPoisonUsed,
    deadlineAt: null,
    phaseToken: null,
    winner: old.winner,
    aborted: false,
  };
}

/** v2 快照（无守卫/猎人/白痴）：补新字段并升级到 v3 */
function migrateV2(snapshot: unknown) {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 2 || !isRecord(snapshot.players) || !isRecord(snapshot.night)) {
    throw new Error('Invalid werewolf v2 snapshot');
  }
  const old = snapshot as unknown as {
    phase: WerewolfPhase;
    day: number;
    players: Record<string, { role: WerewolfRole; alive: boolean; seat: number; forfeited: boolean; exitReason: WerewolfExitReason | null }>;
    config: Omit<WerewolfConfig, 'rulesetId' | 'roles' | 'wolfKillScope'>;
    confirmedRolePlayerIds: string[];
    announcementConfirmedPlayerIds: string[];
    night: WerewolfNightState;
    seerHistory: WerewolfSeerResult[];
    lastNightDeaths: string[];
    speakingOrder: string[];
    currentSpeakerIndex: number;
    votes: Record<string, string>;
    runoffCandidates: string[];
    lastVoteSummary: WerewolfVoteSummary | null;
    voteHistory: WerewolfVoteRecord[];
    pendingOutcome: WerewolfPendingOutcome | null;
    lastWordsPlayerId: string | null;
    witchSaveUsed: boolean;
    witchPoisonUsed: boolean;
    deadlineAt: number | null;
    phaseToken: string | null;
    winner: WerewolfTeam | null;
    aborted: boolean;
  };
  return {
    ...old,
    schemaVersion: 3,
    players: Object.fromEntries(
      Object.entries(old.players).map(([id, player]) => [id, { ...player, idiotRevealed: false }]),
    ),
    config: { ...old.config, roles: { guard: false, hunter: false, idiot: false } },
    night: { ...old.night, guardDecided: true, guardTargetId: null },
    lastGuardTargetId: null,
    pendingShoot: null,
  };
}

/** v3 快照（无规则集身份与 wolfKillScope）：锁定为 legacy 的 non_wolf 夜刀语义 */
function migrateV3(snapshot: unknown): WerewolfState {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 3 || !isRecord(snapshot.players) || !isRecord(snapshot.config)) {
    throw new Error('Invalid werewolf v3 snapshot');
  }
  const old = snapshot as unknown as Omit<WerewolfState, 'schemaVersion' | 'config'> & {
    config: Omit<WerewolfConfig, 'rulesetId' | 'wolfKillScope'>;
  };
  return {
    ...old,
    schemaVersion: WEREWOLF_STATE_SCHEMA_VERSION,
    config: {
      ...old.config,
      rulesetId: 'werewolf_legacy_platform_v2',
      wolfKillScope: 'non_wolf',
    },
  };
}

export const werewolfModule: GameModule<
  WerewolfConfig,
  WerewolfState,
  WerewolfAction,
  WerewolfPlayerView,
  WerewolfPublicView,
  WerewolfEvent,
  WerewolfResult
> = {
  manifest: WEREWOLF_MANIFEST,

  parseConfig,
  parseAction,

  createInitialState(ctx, playerIds, config) {
    if (playerIds.length < WEREWOLF_MANIFEST.minPlayers || playerIds.length > WEREWOLF_MANIFEST.maxPlayers) {
      throw new Error(`狼人杀人数需为 ${WEREWOLF_MANIFEST.minPlayers}-${WEREWOLF_MANIFEST.maxPlayers} 人`);
    }
    if (new Set(playerIds).size !== playerIds.length) throw new Error('玩家列表存在重复');
    const parsedConfig = parseConfig(config);
    const wolfCount = playerIds.length >= 9 ? 3 : 2;
    const specials: WerewolfRole[] = ['seer', 'witch'];
    if (parsedConfig.roles.guard) specials.push('guard');
    if (parsedConfig.roles.hunter) specials.push('hunter');
    if (parsedConfig.roles.idiot) specials.push('idiot');
    if (wolfCount + specials.length > playerIds.length) {
      throw new Error('扩展角色卡数超过玩家人数，请关闭部分扩展角色');
    }
    const roles: WerewolfRole[] = [
      ...Array<WerewolfRole>(wolfCount).fill('wolf'),
      ...specials,
      ...Array<WerewolfRole>(playerIds.length - wolfCount - specials.length).fill('villager'),
    ];
    const shuffled = ctx.random.shuffle(roles);
    const players = Object.fromEntries(
      playerIds.map((id, seat) => [
        id,
        { role: shuffled[seat]!, alive: true, seat, forfeited: false, exitReason: null, idiotRevealed: false },
      ]),
    );
    const state: WerewolfState = {
      schemaVersion: WEREWOLF_STATE_SCHEMA_VERSION,
      phase: 'role_reveal',
      day: 0,
      players,
      config: parsedConfig,
      confirmedRolePlayerIds: [],
      announcementConfirmedPlayerIds: [],
      night: {
        wolfVotes: {},
        killTargetId: null,
        seerChecked: false,
        seerResult: null,
        witchSaveDecision: null,
        witchPoisonDecided: false,
        witchPoisonTargetId: null,
        guardDecided: false,
        guardTargetId: null,
      },
      seerHistory: [],
      lastNightDeaths: [],
      speakingOrder: [],
      currentSpeakerIndex: 0,
      votes: {},
      runoffCandidates: [],
      lastVoteSummary: null,
      voteHistory: [],
      pendingOutcome: null,
      lastWordsPlayerId: null,
      witchSaveUsed: false,
      witchPoisonUsed: false,
      lastGuardTargetId: null,
      pendingShoot: null,
      deadlineAt: null,
      phaseToken: null,
      winner: null,
      aborted: false,
    };
    return state;
  },

  reduce(ctx, state, actor, action) {
    if (state.phase === 'game_over') return actor.kind === 'system' ? noop(state) : deny('本局已经结束');
    const playerAction = PLAYER_ACTIONS.has(action.type);
    if (playerAction && actor.kind !== 'player') return deny('该动作只允许玩家发起');
    if (!playerAction && actor.kind !== 'system') return deny('该动作只允许系统发起');

    const s = cloneState(state);
    const events: WerewolfEvent[] = [];
    const effects: GameEffect[] = [];
    const done = (): Result => ({ ok: true, state: s, events, effects });
    const actorId = actor.kind === 'player' ? actor.playerId : null;

    if (action.type === 'begin') {
      if (state.phase !== 'role_reveal' || state.deadlineAt !== null) return noop(state);
      schedulePhase(s, ctx, 'role_reveal', effects);
      effects.push({ type: 'system_message', text: '对局开始，请确认你的身份' });
      return done();
    }

    if (action.type === 'phase_timeout') {
      if (state.phase !== action.phase || state.day !== action.day || state.phaseToken !== action.token) return noop(state);
      switch (state.phase) {
        case 'role_reveal':
          startNight(s, ctx, 1, events, effects);
          return done();
        case 'night':
          s.night.killTargetId ??= selectWolfTarget(s, true);
          s.night.seerChecked = true;
          s.night.witchSaveDecision ??= false;
          s.night.witchPoisonDecided = true;
          s.night.guardDecided = true;
          resolveNightWithContext(s, ctx, events, effects);
          return done();
        case 'hunter_shot':
          resolveHunterShot(s, ctx, null, events, effects);
          return done();
        case 'day_announcement':
          startDiscussion(s, ctx, events, effects);
          return done();
        case 'discussion':
          advanceSpeaker(s, ctx, events, effects);
          return done();
        case 'voting':
        case 'runoff_voting':
          settleVotes(s, ctx, state.phase === 'voting' ? 'normal' : 'runoff', events, effects);
          return done();
        case 'vote_result':
          continueAfterVoteResult(s, ctx, events, effects);
          return done();
        case 'last_words':
          finishLastWords(s, ctx, events, effects);
          return done();
      }
    }

    if (action.type === 'player_forfeited') {
      const newlyForfeited = action.playerIds.filter((id) => s.players[id] && !s.players[id]!.forfeited);
      if (newlyForfeited.length === 0) return noop(state);
      for (const id of newlyForfeited) {
        const player = s.players[id]!;
        player.forfeited = true;
        delete s.night.wolfVotes[id];
        if (player.alive) eliminate(s, id, 'disconnect_timeout', events);
      }
      if (Object.values(s.players).every((player) => player.forfeited)) {
        finishGame(s, null, true, events, effects);
        return done();
      }
      const winner = checkWinner(s);
      if (winner) {
        finishGame(s, winner, false, events, effects);
        return done();
      }
      if (s.phase === 'role_reveal' && allSubmitted(s, s.confirmedRolePlayerIds)) {
        cancelCurrentTimer(s, effects);
        startNight(s, ctx, 1, events, effects);
      } else if (s.phase === 'night') {
        if (allWolvesVoted(s)) s.night.killTargetId ??= selectWolfTarget(s, false);
        tryResolveNight(s, ctx, events, effects);
      } else if (s.phase === 'day_announcement' && allSubmitted(s, s.announcementConfirmedPlayerIds)) {
        startDiscussion(s, ctx, events, effects);
      } else if (s.phase === 'discussion') {
        const current = s.speakingOrder[s.currentSpeakerIndex];
        if (!current || !s.players[current]?.alive) advanceSpeaker(s, ctx, events, effects);
      } else if ((s.phase === 'voting' || s.phase === 'runoff_voting') && allVotesSubmitted(s)) {
        settleVotes(s, ctx, s.phase === 'voting' ? 'normal' : 'runoff', events, effects);
      } else if (s.phase === 'hunter_shot' && s.pendingShoot && s.players[s.pendingShoot]?.forfeited) {
        resolveHunterShot(s, ctx, null, events, effects);
      } else if (s.phase === 'last_words' && s.lastWordsPlayerId && s.players[s.lastWordsPlayerId]?.forfeited) {
        finishLastWords(s, ctx, events, effects);
      }
      return done();
    }

    if (!actorId) return deny('只有参局玩家可以操作');
    const self = state.players[actorId];
    if (!self || self.forfeited) return deny('你不在本局或已经弃权');

    if (action.type === 'confirm_role') {
      if (state.phase !== 'role_reveal' || !self.alive) return deny('当前不能确认身份');
      if (state.confirmedRolePlayerIds.includes(actorId)) return noop(state);
      s.confirmedRolePlayerIds.push(actorId);
      if (allSubmitted(s, s.confirmedRolePlayerIds)) {
        cancelCurrentTimer(s, effects);
        startNight(s, ctx, 1, events, effects);
      }
      return done();
    }

    if (state.phase === 'night') {
      if (!self.alive) return deny('已出局玩家不能夜间行动');
      if (action.type === 'night_kill') {
        if (self.role !== 'wolf') return deny('只有狼人可以投击杀票');
        if (actorId in state.night.wolfVotes) return deny('本夜击杀票已经锁定');
        const target = state.players[action.targetPlayerId];
        if (!target?.alive) return deny('击杀目标无效');
        if (state.config.wolfKillScope !== 'any' && target.role === 'wolf') return deny('击杀目标无效');
        s.night.wolfVotes[actorId] = action.targetPlayerId;
        if (allWolvesVoted(s)) s.night.killTargetId = selectWolfTarget(s, false);
      } else if (action.type === 'seer_check') {
        if (self.role !== 'seer' || state.night.seerChecked) return deny('当前不能查验');
        const target = state.players[action.targetPlayerId];
        if (!target?.alive || action.targetPlayerId === actorId) return deny('查验目标无效');
        const result = { night: state.day, playerId: action.targetPlayerId, team: teamOf(target.role) };
        s.night.seerChecked = true;
        s.night.seerResult = result;
        s.seerHistory.push(result);
      } else if (action.type === 'witch_save') {
        if (self.role !== 'witch' || state.night.killTargetId === null || state.night.witchSaveDecision !== null) {
          return deny('当前不能决定使用解药');
        }
        if (action.save) {
          if (state.witchSaveUsed) return deny('解药已经用完');
          const victimIsSelf = state.night.killTargetId === actorId;
          const selfSaveAllowed =
            state.config.witchSelfSave === 'always' ||
            (state.config.witchSelfSave === 'first_night' && state.day === 1);
          if (victimIsSelf && !selfSaveAllowed) return deny('本局规则下女巫不能自救');
          s.night.witchSaveDecision = true;
          s.night.witchPoisonDecided = true;
          s.witchSaveUsed = true;
        } else {
          s.night.witchSaveDecision = false;
        }
      } else if (action.type === 'witch_poison') {
        if (self.role !== 'witch' || state.night.killTargetId === null || state.night.witchPoisonDecided) {
          return deny('当前不能决定使用毒药');
        }
        if (state.night.witchSaveDecision === true) return deny('同一夜不能同时使用解药和毒药');
        if (action.targetPlayerId !== null) {
          const target = state.players[action.targetPlayerId];
          if (!target?.alive || action.targetPlayerId === actorId || state.witchPoisonUsed) return deny('毒杀目标无效');
          s.witchPoisonUsed = true;
        }
        s.night.witchSaveDecision ??= false;
        s.night.witchPoisonDecided = true;
        s.night.witchPoisonTargetId = action.targetPlayerId;
      } else if (action.type === 'guard_guard') {
        if (self.role !== 'guard' || state.night.guardDecided) return deny('当前不能决定守人');
        if (action.targetPlayerId !== null) {
          const target = state.players[action.targetPlayerId];
          if (!target?.alive || action.targetPlayerId === actorId) return deny('守人目标无效');
          if (action.targetPlayerId === state.lastGuardTargetId) return deny('不能连续两夜守护同一人');
          s.lastGuardTargetId = action.targetPlayerId;
          s.night.guardTargetId = action.targetPlayerId;
        }
        s.night.guardDecided = true;
      } else {
        return deny('当前是夜晚行动阶段');
      }
      tryResolveNight(s, ctx, events, effects);
      return done();
    }

    if (action.type === 'hunter_shoot') {
      if (state.phase !== 'hunter_shot' || state.pendingShoot !== actorId) return deny('当前不能开枪');
      if (action.targetPlayerId !== null) {
        const target = state.players[action.targetPlayerId];
        if (!target?.alive || action.targetPlayerId === actorId) return deny('枪击目标无效');
      }
      resolveHunterShot(s, ctx, action.targetPlayerId, events, effects);
      return done();
    }

    if (action.type === 'confirm_announcement') {
      if (state.phase !== 'day_announcement' || !self.alive) return deny('当前不能确认天亮信息');
      if (state.announcementConfirmedPlayerIds.includes(actorId)) return noop(state);
      s.announcementConfirmedPlayerIds.push(actorId);
      if (allSubmitted(s, s.announcementConfirmedPlayerIds)) startDiscussion(s, ctx, events, effects);
      return done();
    }

    if (action.type === 'finish_speech') {
      if (state.phase !== 'discussion' || !self.alive) return deny('当前不是你的发言阶段');
      if (state.speakingOrder[state.currentSpeakerIndex] !== actorId) return deny('还没轮到你发言');
      advanceSpeaker(s, ctx, events, effects);
      return done();
    }

    if (action.type === 'day_vote') {
      const kind = state.phase === 'voting' ? 'normal' : state.phase === 'runoff_voting' ? 'runoff' : null;
      if (!kind || !self.alive) return deny('当前不能投票');
      if (self.idiotRevealed) return deny('翻牌白痴失去投票权');
      if (actorId in state.votes) return deny('本轮选票已经锁定');
      if (action.targetPlayerId !== null) {
        const target = state.players[action.targetPlayerId];
        if (!target?.alive || action.targetPlayerId === actorId) return deny('投票目标无效');
        if (target.idiotRevealed) return deny('不能放逐已翻牌的白痴');
        if (kind === 'runoff' && !state.runoffCandidates.includes(action.targetPlayerId)) {
          return deny('加赛只能投给候选玩家');
        }
      }
      s.votes[actorId] = action.targetPlayerId;
      if (allVotesSubmitted(s)) settleVotes(s, ctx, kind, events, effects);
      return done();
    }

    if (action.type === 'finish_last_words') {
      if (state.phase !== 'last_words' || state.lastWordsPlayerId !== actorId) return deny('当前不能结束遗言');
      finishLastWords(s, ctx, events, effects);
      return done();
    }

    return deny('当前阶段不能执行该动作');
  },

  getPlayerView(state, playerId) {
    const base = publicView(state);
    const player = state.players[playerId];
    if (!player) return { ...base, me: null };
    const isAliveWolf = player.alive && player.role === 'wolf';
    const isAliveSeer = player.alive && player.role === 'seer';
    const isAliveWitch = player.alive && player.role === 'witch';
    const isAliveGuard = player.alive && player.role === 'guard';
    return {
      ...base,
      me: {
        playerId,
        role: player.role,
        alive: player.alive,
        forfeited: player.forfeited,
        confirmedRole: state.confirmedRolePlayerIds.includes(playerId),
        confirmedAnnouncement: state.announcementConfirmedPlayerIds.includes(playerId),
        canAct: playerCanAct(state, playerId),
        hasVoted: playerId in state.votes,
        myVote: state.votes[playerId] ?? null,
        lastWordsPending: state.phase === 'last_words' && state.lastWordsPlayerId === playerId,
        wolfTeammateIds: isAliveWolf
          ? orderedIds(state).filter((id) => id !== playerId && state.players[id]?.role === 'wolf')
          : [],
        wolfVotes: isAliveWolf ? { ...state.night.wolfVotes } : {},
        hasNightVoted: isAliveWolf && playerId in state.night.wolfVotes,
        seerResults: isAliveSeer ? structuredClone(state.seerHistory) : [],
        seerCheckedThisNight: isAliveSeer && state.night.seerChecked,
        nightVictimId: isAliveWitch ? state.night.killTargetId : null,
        witchSaveUsed: isAliveWitch ? state.witchSaveUsed : false,
        witchPoisonUsed: isAliveWitch ? state.witchPoisonUsed : false,
        witchSaveDecision: isAliveWitch ? state.night.witchSaveDecision : null,
        witchPoisonDecided: isAliveWitch && state.night.witchPoisonDecided,
        witchCanSelfSave: isAliveWitch && (state.config.witchSelfSave === 'always' || (state.config.witchSelfSave === 'first_night' && state.day === 1)),
        guardTargetId: isAliveGuard ? state.night.guardTargetId : null,
        guardDecided: isAliveGuard && state.night.guardDecided,
        lastGuardTargetId: isAliveGuard ? state.lastGuardTargetId : null,
        pendingShoot: state.phase === 'hunter_shot' && state.pendingShoot === playerId,
        idiotRevealed: player.idiotRevealed,
      },
    };
  },

  getSpectatorView(state) {
    return publicView(state);
  },

  getResult(state) {
    if (state.phase !== 'game_over') return null;
    return {
      winner: state.winner,
      days: state.day,
      roles: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.role])),
      aborted: state.aborted,
    };
  },

  migrateSnapshot(fromVersion, snapshot) {
    if (fromVersion === WEREWOLF_STATE_SCHEMA_VERSION) {
      if (
        !isRecord(snapshot) ||
        snapshot.schemaVersion !== WEREWOLF_STATE_SCHEMA_VERSION ||
        !isRecord(snapshot.config)
      ) {
        throw new Error('Invalid werewolf v4 snapshot');
      }
      const snapshotConfig = snapshot.config;
      if (!['rulesetId', 'preset', 'pace', 'witchSelfSave', 'winCondition', 'wolfKillScope', 'roles']
        .every((key) => key in snapshotConfig)) {
        throw new Error('Invalid werewolf v4 snapshot');
      }
      const config = parseConfig(snapshotConfig);
      return {
        ...structuredClone(snapshot),
        config,
      } as unknown as WerewolfState;
    }
    if (fromVersion === 3) return migrateV3(snapshot);
    if (fromVersion === 2) return migrateV3(migrateV2(snapshot));
    if (fromVersion === 1) return migrateV3(migrateV2(migrateV1(snapshot)));
    throw new Error(`无法从狼人杀状态版本 ${fromVersion} 迁移`);
  },

  pickBotAction(input) {
    return pickWerewolfBotAction(input);
  },

  buildBotPrompt(input) {
    return buildWerewolfBotPrompt(input);
  },
};
