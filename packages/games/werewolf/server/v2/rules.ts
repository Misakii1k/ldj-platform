/**
 * werewolf_platform_open_kill_v1 — 纯规则 reducer。
 * 遵循主流面杀规则，与 legacy 相比有意分叉：
 * 1. wolfKillScope=any：狼人夜刀可投任意存活玩家（含自己与同伴）；
 * 2. 守卫可自守（保留不可连续两晚守同一人）；
 * 3. 同守同救死亡：守中且救中刀口目标依然死亡（night_kill）；
 * 4. 首夜死者遗言队列：首夜遇害者按座位号依次发表遗言；
 * 5. 加赛候选人禁投：加赛轮候选人失去投票权且不计入应收票数；
 * 6. 猎人被放逐统一先展示 vote_result 票型面板，再进入 hunter_shot 开枪；
 * 7. 局中死因隐藏：出局玩家 exitReason 仅在终局 game_over 时揭示。
 */
import { calculateWerewolfDistribution, type Actor, type GameContext, type GameEffect, type PrivateGameEvent } from '@ldj/shared';
import type { V2Action, V2Config, V2ConfigPace, V2Event, V2ExitReason, V2NightStage, V2NightState, V2PendingOutcome, V2PlayerView, V2PublicView, V2Result, V2Role, V2State, V2Team, V2TimedPhase, V2VoteKind, V2VoteOutcome, V2VoteSummary } from './types.ts';
import { v2ActionSchema, v2StateSchema } from './schemas.ts';

export type V2ReduceResult = { ok: false; code: string; message: string } | { ok: true; nextState: V2State; publicEvents: V2Event[]; privateEvents: PrivateGameEvent[]; effects: GameEffect[]; resultCandidate: V2Result | null };

const PLAYER_ACTIONS = new Set<V2Action['type']>([
  'confirm_role',
  'night_kill',
  'seer_check',
  'witch_save',
  'witch_poison',
  'guard_guard',
  'hunter_shoot',
  'confirm_announcement',
  'finish_speech',
  'ready_vote',
  'day_vote',
  'finish_last_words',
]);
const SPECIAL_ROLES: readonly V2Role[] = ['seer', 'witch', 'guard', 'hunter', 'idiot'];
const PACE_MS: Record<V2ConfigPace, Record<V2TimedPhase, number>> = {
  fast: { role_reveal: 15_000, night: 45_000, hunter_shot: 15_000, day_announcement: 10_000, discussion: 30_000, free_discussion: 30_000, voting: 20_000, runoff_voting: 20_000, vote_result: 4_000, last_words: 20_000 },
  standard: { role_reveal: 30_000, night: 60_000, hunter_shot: 30_000, day_announcement: 10_000, discussion: 60_000, free_discussion: 60_000, voting: 45_000, runoff_voting: 45_000, vote_result: 5_000, last_words: 30_000 },
  relaxed: { role_reveal: 45_000, night: 90_000, hunter_shot: 45_000, day_announcement: 10_000, discussion: 90_000, free_discussion: 90_000, voting: 60_000, runoff_voting: 60_000, vote_result: 7_000, last_words: 45_000 },
};

const deny = (message: string): V2ReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
const noop = (state: V2State): V2ReduceResult => ({ ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null });
const okResult = (state: V2State, publicEvents: V2Event[], effects: GameEffect[]): V2ReduceResult => ({ ok: true, nextState: state, publicEvents, privateEvents: [], effects, resultCandidate: state.phase === 'game_over' ? buildV2Result(state) : null });
const seatNo = (state: V2State, id: string): number => (state.players[id]?.seat ?? 0) + 1;
const orderedIds = (state: V2State): string[] => Object.entries(state.players).sort(([, a], [, b]) => a.seat - b.seat).map(([id]) => id);
const aliveIds = (state: V2State): string[] => orderedIds(state).filter((id) => state.players[id]?.alive);
const aliveRoleIds = (state: V2State, role: V2Role): string[] => aliveIds(state).filter((id) => state.players[id]?.role === role);
const teamOf = (role: V2Role): V2Team => (role === 'wolf' ? 'wolves' : 'village');

function checkWinner(state: V2State): V2Team | null {
  let wolves = 0, village = 0;
  for (const p of Object.values(state.players)) { if (!p.alive) continue; if (p.role === 'wolf') wolves += 1; else village += 1; }
  if (wolves + village === 0) return null;
  if (wolves === 0) return 'village';
  if (state.config.winCondition === 'roles') {
    const hasVillager = Object.values(state.players).some((p) => p.alive && p.role === 'villager');
    const hasSpecial = Object.values(state.players).some((p) => p.alive && SPECIAL_ROLES.includes(p.role));
    if (!hasVillager || !hasSpecial) return 'wolves';
    return null;
  }
  return wolves >= village ? 'wolves' : null;
}

const phaseToken = (state: V2State, phase: V2TimedPhase, suffix = ''): string => `${phase}:${state.day}${suffix ? `:${suffix}` : ''}`;
function schedulePhase(state: V2State, ctx: GameContext, phase: V2TimedPhase, effects: GameEffect[], suffix = ''): void {
  const token = phaseToken(state, phase, suffix);
  state.deadlineAt = ctx.now + PACE_MS[state.config.pace][phase]!;
  state.phaseToken = token;
  effects.push({ type: 'schedule_timer', timerId: `werewolf:${token}`, deadlineAt: state.deadlineAt, action: { type: 'phase_timeout', phase, day: state.day, token } });
}
function cancelCurrentTimer(state: V2State, effects: GameEffect[]): void {
  if (state.phaseToken) effects.push({ type: 'cancel_timer', timerId: `werewolf:${state.phaseToken}` });
  state.deadlineAt = null;
  state.phaseToken = null;
}
const phaseChanged = (state: V2State, publicEvents: V2Event[]): void => { publicEvents.push({ type: 'phase_changed', phase: state.phase, day: state.day }); };
function finishGame(state: V2State, winner: V2Team | null, aborted: boolean, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'game_over'; state.winner = winner; state.aborted = aborted; state.pendingOutcome = null; state.lastWordsPlayerId = null;
  publicEvents.push({ type: 'game_finished', winner, days: state.day, aborted });
  if (winner) effects.push({ type: 'system_message', text: winner === 'wolves' ? '狼人阵营胜利！' : '好人阵营胜利！' });
  else if (aborted) effects.push({ type: 'system_message', text: '所有玩家均已退出，对局终止' });
}
function eliminate(state: V2State, playerId: string, reason: V2ExitReason, publicEvents: V2Event[]): void {
  const player = state.players[playerId];
  if (!player || !player.alive) return;
  player.alive = false;
  player.exitReason = reason;
  publicEvents.push({ type: 'player_eliminated', playerId, reason });
}

function emptyNight(state: V2State): V2NightState {
  const witchAlive = aliveRoleIds(state, 'witch').length > 0;
  const guardAlive = aliveRoleIds(state, 'guard').length > 0;
  return { wolfVotes: {}, killTargetId: null, seerChecked: aliveRoleIds(state, 'seer').length === 0, seerResult: null, witchSaveDecision: witchAlive && !state.witchSaveUsed ? null : false, witchPoisonDecided: !witchAlive || state.witchPoisonUsed, witchPoisonTargetId: null, guardDecided: !guardAlive, guardTargetId: null };
}
function startNight(state: V2State, ctx: GameContext, day: number, publicEvents: V2Event[], effects: GameEffect[]): void {
  state.day = day;
  state.phase = 'night';
  state.night = emptyNight(state);
  state.lastNightDeaths = []; state.announcementConfirmedPlayerIds = []; state.speakingOrder = []; state.currentSpeakerIndex = 0;
  state.freeDiscussionReadyPlayerIds = [];
  state.votes = {}; state.runoffCandidates = []; state.pendingOutcome = null; state.lastWordsPlayerId = null;
  state.lastWordsQueue = null;
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'night', effects);
  effects.push({ type: 'system_message', text: `第 ${day} 夜开始` });
}
const wolfTargetCandidates = (state: V2State): string[] => aliveIds(state);
function selectWolfTarget(state: V2State, allowFallback: boolean): string | null {
  const valid = new Set(wolfTargetCandidates(state));
  const tally = new Map<string, number>();
  for (const wolfId of aliveRoleIds(state, 'wolf')) {
    const target = state.night.wolfVotes[wolfId];
    if (target && valid.has(target)) tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  if (tally.size === 0) return allowFallback ? wolfTargetCandidates(state)[0] ?? null : null;
  const top = Math.max(...tally.values());
  return [...tally.entries()].filter(([, count]) => count === top).map(([id]) => id).sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0) || a.localeCompare(b))[0] ?? null;
}
const allWolvesVoted = (state: V2State): boolean => { const wolves = aliveRoleIds(state, 'wolf'); return wolves.length > 0 && wolves.every((id) => id in state.night.wolfVotes); };
const witchFinished = (state: V2State): boolean => aliveRoleIds(state, 'witch').length === 0 || state.night.witchSaveDecision === true || (state.night.witchSaveDecision === false && state.night.witchPoisonDecided);
const guardFinished = (state: V2State): boolean => aliveRoleIds(state, 'guard').length === 0 || state.night.guardDecided;
const wolfKillBlocked = (state: V2State): boolean => state.night.guardTargetId !== null && state.night.guardTargetId === state.night.killTargetId;

export function computeNightStage(state: V2State): V2NightStage {
  if (state.phase !== 'night') return 'done';
  if (!allWolvesVoted(state)) return 'wolf';
  if (!witchFinished(state)) return 'witch';
  if (!state.night.seerChecked) return 'seer';
  if (!guardFinished(state)) return 'guard';
  return 'done';
}

function hunterShooterOf(state: V2State, reasons: ReadonlyMap<string, V2ExitReason>): string | null {
  for (const [id, reason] of reasons) {
    if (reason === 'poisoned' || reason === 'disconnect_timeout') continue;
    if (state.players[id]?.role === 'hunter') return id;
  }
  return null;
}
function enterHunterShot(state: V2State, ctx: GameContext, shooterId: string, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.pendingShoot = shooterId;
  state.phase = 'hunter_shot';
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'hunter_shot', effects);
  effects.push({ type: 'system_message', text: '猎人出局，可以开枪带走一名玩家（也可以放弃开枪）' });
}
function resolveHunterShot(state: V2State, ctx: GameContext, firedTargetId: string | null, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const shooterId = state.pendingShoot;
  if (firedTargetId !== null) {
    const target = state.players[firedTargetId];
    if (target?.alive) {
      eliminate(state, firedTargetId, 'hunter_shot', publicEvents);
      effects.push({ type: 'system_message', text: '猎人开枪带走了被击中的玩家' });
    }
  } else {
    effects.push({ type: 'system_message', text: '猎人放弃开枪' });
  }
  state.pendingShoot = null;
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  if (shooterId && state.players[shooterId]?.exitReason === 'voted_out') {
    if (firedTargetId === null) {
      startLastWords(state, ctx, shooterId, publicEvents, effects);
      return;
    }
    startNight(state, ctx, state.day + 1, publicEvents, effects);
    return;
  }
  if (state.pendingOutcome) { continueAfterPendingOutcome(state, ctx, publicEvents, effects); return; }
  if (state.lastWordsQueue && state.lastWordsQueue.length > 0) {
    const speakerId = state.lastWordsQueue.shift()!;
    startLastWords(state, ctx, speakerId, publicEvents, effects);
    return;
  }
  startDiscussion(state, ctx, publicEvents, effects);
}

function resolveNightWithContext(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const targetId = state.night.killTargetId;
  const reasons = new Map<string, V2ExitReason>();
  const deaths: string[] = [];
  const guarded = wolfKillBlocked(state);
  const saved = state.night.witchSaveDecision === true;
  if (targetId && (guarded === saved)) {
    deaths.push(targetId);
    reasons.set(targetId, 'night_kill');
  }
  if (state.night.witchPoisonTargetId) {
    if (!deaths.includes(state.night.witchPoisonTargetId)) {
      deaths.push(state.night.witchPoisonTargetId);
    }
    // 女巫毒杀具备最高优先级与技能压制特性：被毒中必然视为 poisoned，猎人无法开枪
    reasons.set(state.night.witchPoisonTargetId, 'poisoned');
  }
  for (const id of deaths) eliminate(state, id, reasons.get(id)!, publicEvents);
  state.lastNightDeaths = deaths;
  state.lastGuardTargetId = state.night.guardTargetId;
  publicEvents.push({ type: 'night_resolved', deaths, day: state.day });
  effects.push({ type: 'system_message', text: deaths.length === 0 ? '昨晚是平安夜' : `昨晚死亡的玩家：${deaths.map((id) => `${seatNo(state, id)} 号`).join('、')}` });
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  if (state.day === 1 && deaths.length > 0) {
    state.lastWordsQueue = [...deaths].sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0));
  } else {
    state.lastWordsQueue = null;
  }
  const hunterShooter = hunterShooterOf(state, reasons);
  if (hunterShooter) {
    state.pendingShoot = hunterShooter;
  }
  startDayAnnouncement(state, ctx, publicEvents, effects);
}

function tryResolveNight(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  if (!allWolvesVoted(state) || !state.night.seerChecked || !witchFinished(state) || !guardFinished(state)) return;
  state.night.killTargetId = selectWolfTarget(state, true);
  resolveNightWithContext(state, ctx, publicEvents, effects);
}

function startDayAnnouncement(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  state.phase = 'day_announcement';
  state.announcementConfirmedPlayerIds = [];
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'day_announcement', effects);
}

function finishDayAnnouncement(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  if (state.pendingShoot) {
    enterHunterShot(state, ctx, state.pendingShoot, publicEvents, effects);
    return;
  }
  if (state.lastWordsQueue && state.lastWordsQueue.length > 0) {
    const speakerId = state.lastWordsQueue.shift()!;
    startLastWords(state, ctx, speakerId, publicEvents, effects);
    return;
  }
  startDiscussion(state, ctx, publicEvents, effects);
}

function computeSpeakingOrder(state: V2State): string[] {
  const ids = aliveIds(state);
  if (ids.length === 0) return [];
  const anchorId = state.lastNightDeaths.find((id) => state.players[id]) ?? ids[0]!;
  const anchorSeat = state.players[anchorId]?.seat ?? 0;
  const sortedByDistance = [...ids].sort((a, b) => {
    const seatA = state.players[a]!.seat;
    const seatB = state.players[b]!.seat;
    const distA = (seatA - anchorSeat + Object.keys(state.players).length) % Object.keys(state.players).length;
    const distB = (seatB - anchorSeat + Object.keys(state.players).length) % Object.keys(state.players).length;
    return distA - distB;
  });
  return sortedByDistance;
}

function startDiscussion(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'discussion';
  state.speakingOrder = computeSpeakingOrder(state);
  state.currentSpeakerIndex = 0;
  phaseChanged(state, publicEvents);
  const speakerId = state.speakingOrder[0];
  if (!speakerId) {
    if (state.config.freeDiscussion !== false) {
      startFreeDiscussion(state, ctx, publicEvents, effects);
    } else {
      startVoting(state, ctx, 'normal', [], publicEvents, effects);
    }
    return;
  }
  schedulePhase(state, ctx, 'discussion', effects, speakerId);
  effects.push({ type: 'system_message', text: `请 ${seatNo(state, speakerId)} 号玩家开始发言` });
}

function startFreeDiscussion(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'free_discussion';
  state.freeDiscussionReadyPlayerIds = [];
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'free_discussion', effects);
  effects.push({ type: 'system_message', text: '进入自由发言阶段，存活玩家可自由辩论；准备好后可点击「进入投票」' });
}

const freeDiscussionReadyIds = (state: V2State): string[] => aliveIds(state);
const allFreeDiscussionReady = (state: V2State): boolean => {
  const voters = freeDiscussionReadyIds(state);
  return voters.length > 0 && voters.every((id) => state.freeDiscussionReadyPlayerIds.includes(id));
};

function advanceSpeaker(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.currentSpeakerIndex += 1;
  while (state.currentSpeakerIndex < state.speakingOrder.length) {
    const nextId = state.speakingOrder[state.currentSpeakerIndex]!;
    if (state.players[nextId]?.alive) {
      schedulePhase(state, ctx, 'discussion', effects, nextId);
      effects.push({ type: 'system_message', text: `请 ${seatNo(state, nextId)} 号玩家开始发言` });
      return;
    }
    state.currentSpeakerIndex += 1;
  }
  if (state.config.freeDiscussion !== false) {
    startFreeDiscussion(state, ctx, publicEvents, effects);
  } else {
    startVoting(state, ctx, 'normal', [], publicEvents, effects);
  }
}

const votingIds = (state: V2State): string[] => {
  const isRunoff = state.phase === 'runoff_voting';
  const candidates = isRunoff ? new Set(state.runoffCandidates) : null;
  return aliveIds(state).filter((id) => !state.players[id]?.idiotRevealed && (!candidates || !candidates.has(id)));
};
const allVotesSubmitted = (state: V2State): boolean => { const voters = votingIds(state); return voters.length > 0 && voters.every((id) => id in state.votes); };

function startVoting(state: V2State, ctx: GameContext, kind: V2VoteKind, candidates: string[], publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = kind === 'normal' ? 'voting' : 'runoff_voting';
  state.votes = {};
  state.runoffCandidates = kind === 'runoff' ? candidates : [];
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, state.phase, effects);
  effects.push({ type: 'system_message', text: kind === 'normal' ? '开始放逐投票' : `平票加赛投票：候选人为 ${candidates.map((id) => `${seatNo(state, id)} 号`).join('、')}` });
}

function settleVotes(state: V2State, ctx: GameContext, kind: V2VoteKind, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const tally: Record<string, number> = {};
  let abstained = 0;
  const voters = votingIds(state);
  for (const voterId of voters) {
    const targetId = state.votes[voterId];
    if (!targetId) {
      abstained += 1;
    } else {
      const target = state.players[targetId];
      if (!target || !target.alive || target.idiotRevealed || (kind === 'runoff' && !state.runoffCandidates.includes(targetId))) {
        abstained += 1;
      } else {
        tally[targetId] = (tally[targetId] ?? 0) + 1;
      }
    }
  }
  const entries = Object.entries(tally);
  const max = entries.length === 0 ? 0 : Math.max(...entries.map(([, c]) => c));
  const top = entries.filter(([, c]) => c === max).map(([id]) => id);

  let outcome: V2VoteOutcome;
  let eliminatedId: string | null = null;
  let candidates: string[] = [];

  if (max === 0) {
    outcome = kind === 'runoff' ? 'runoff_tie' : 'no_votes';
  } else if (top.length > 1) {
    outcome = kind === 'runoff' ? 'runoff_tie' : 'tie';
    candidates = top;
  } else {
    eliminatedId = top[0]!;
    const player = state.players[eliminatedId];
    if (player?.role === 'idiot' && !player.idiotRevealed) {
      outcome = 'idiot_saved';
      player.idiotRevealed = true;
      effects.push({ type: 'system_message', text: `${player.seat + 1} 号白痴翻牌免死，失去投票权` });
    } else {
      outcome = 'eliminated';
      eliminate(state, eliminatedId, 'voted_out', publicEvents);
    }
  }

  const summary: V2VoteSummary = { day: state.day, kind, outcome, tally, abstained, eliminatedPlayerId: outcome === 'eliminated' ? eliminatedId : null };
  state.lastVoteSummary = summary;
  state.voteHistory.push({ ...summary, votes: { ...state.votes } });
  publicEvents.push({ type: 'vote_resolved', summary });

  let next: V2PendingOutcome['next'];
  if (outcome === 'tie') {
    next = 'runoff';
  } else if (outcome === 'eliminated' && eliminatedId) {
    next = 'last_words';
  } else {
    next = 'next_night';
  }

  state.pendingOutcome = { next, candidates, winner: null };
  state.phase = 'vote_result';
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'vote_result', effects);
}

function startLastWords(state: V2State, ctx: GameContext, playerId: string, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'last_words';
  state.lastWordsPlayerId = playerId;
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'last_words', effects, playerId);
  effects.push({ type: 'system_message', text: `请 ${seatNo(state, playerId)} 号玩家发表遗言` });
}

function finishLastWords(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.lastWordsPlayerId = null;
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  if (state.lastWordsQueue !== null) {
    if (state.lastWordsQueue.length > 0) {
      const nextSpeakerId = state.lastWordsQueue.shift()!;
      startLastWords(state, ctx, nextSpeakerId, publicEvents, effects);
      return;
    }
    state.lastWordsQueue = null;
    startDiscussion(state, ctx, publicEvents, effects);
    return;
  }
  startNight(state, ctx, state.day + 1, publicEvents, effects);
}

function continueAfterVoteResult(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const pending = state.pendingOutcome;
  state.pendingOutcome = null;
  if (!pending) { startNight(state, ctx, state.day + 1, publicEvents, effects); return; }
  if (pending.winner) { finishGame(state, pending.winner, false, publicEvents, effects); return; }
  if (pending.next === 'runoff') {
    const candidates = pending.candidates.filter((id) => state.players[id]?.alive);
    if (candidates.length >= 2) startVoting(state, ctx, 'runoff', candidates, publicEvents, effects);
    else startNight(state, ctx, state.day + 1, publicEvents, effects);
    return;
  }
  if (pending.next === 'last_words' && state.lastVoteSummary?.eliminatedPlayerId) {
    const eliminatedId = state.lastVoteSummary.eliminatedPlayerId;
    if (state.players[eliminatedId]?.role === 'hunter') {
      enterHunterShot(state, ctx, eliminatedId, publicEvents, effects);
      return;
    }
    startLastWords(state, ctx, eliminatedId, publicEvents, effects);
    return;
  }
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  startNight(state, ctx, state.day + 1, publicEvents, effects);
}

function continueAfterPendingOutcome(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  continueAfterVoteResult(state, ctx, publicEvents, effects);
}
const allSubmitted = (state: V2State, submitted: readonly string[]): boolean => { const set = new Set(submitted); return aliveIds(state).every((id) => set.has(id)); };

export function getWerewolfWolfCount(playerCount: number): number {
  return calculateWerewolfDistribution({ playerCount }).wolfCount;
}

export function createV2InitialState(ctx: GameContext, players: string[], config: V2Config): V2State {
  if (players.length < 6 || players.length > 12) throw new Error('狼人杀人数需为 6-12 人');
  if (new Set(players).size !== players.length) throw new Error('玩家列表存在重复');
  const dist = calculateWerewolfDistribution({
    playerCount: players.length,
    wolfDelta: config.wolfDelta,
    guard: config.roles.guard,
    hunter: config.roles.hunter,
    idiot: config.roles.idiot,
  });
  if (!dist.isValid) {
    throw new Error(dist.error ?? '阵营分配不合法');
  }
  const roles: V2Role[] = [
    ...Array<V2Role>(dist.wolfCount).fill('wolf'),
    ...dist.specials,
    ...Array<V2Role>(dist.villagerCount).fill('villager'),
  ];
  const shuffled = ctx.random.shuffle(roles);
  const playerEntries = Object.fromEntries(players.map((id, seat) => [id, { role: shuffled[seat]!, alive: true, seat, forfeited: false, exitReason: null, idiotRevealed: false }]));
  const state: V2State = {
    schemaVersion: 1,
    phase: 'role_reveal',
    day: 0,
    players: playerEntries,
    config,
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    night: { wolfVotes: {}, killTargetId: null, seerChecked: false, seerResult: null, witchSaveDecision: null, witchPoisonDecided: false, witchPoisonTargetId: null, guardDecided: false, guardTargetId: null },
    seerHistory: [],
    lastNightDeaths: [],
    speakingOrder: [],
    currentSpeakerIndex: 0,
    freeDiscussionReadyPlayerIds: [],
    votes: {},
    runoffCandidates: [],
    lastVoteSummary: null,
    voteHistory: [],
    pendingOutcome: null,
    lastWordsPlayerId: null,
    lastWordsQueue: null,
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
}

export function reduceV2(ctx: GameContext, state: V2State, actor: Actor, action: V2Action): V2ReduceResult {
  if (state.phase === 'game_over') return actor.kind === 'system' ? noop(state) : deny('本局已经结束');
  const playerAction = PLAYER_ACTIONS.has(action.type);
  if (playerAction && actor.kind !== 'player') return deny('该动作只允许玩家发起');
  if (!playerAction && actor.kind !== 'system') return deny('该动作只允许系统发起');
  const s = structuredClone(state);
  const publicEvents: V2Event[] = [];
  const effects: GameEffect[] = [];
  const done = (): V2ReduceResult => okResult(s, publicEvents, effects);
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
      case 'role_reveal': startNight(s, ctx, 1, publicEvents, effects); break;
      case 'night':
        s.night.killTargetId ??= selectWolfTarget(s, true);
        s.night.seerChecked = true; s.night.witchSaveDecision ??= false; s.night.witchPoisonDecided = true; s.night.guardDecided = true;
        resolveNightWithContext(s, ctx, publicEvents, effects);
        break;
      case 'hunter_shot': resolveHunterShot(s, ctx, null, publicEvents, effects); break;
      case 'day_announcement': finishDayAnnouncement(s, ctx, publicEvents, effects); break;
      case 'discussion': advanceSpeaker(s, ctx, publicEvents, effects); break;
      case 'free_discussion': startVoting(s, ctx, 'normal', [], publicEvents, effects); break;
      case 'voting':
      case 'runoff_voting': settleVotes(s, ctx, state.phase === 'voting' ? 'normal' : 'runoff', publicEvents, effects); break;
      case 'vote_result': continueAfterVoteResult(s, ctx, publicEvents, effects); break;
      case 'last_words': finishLastWords(s, ctx, publicEvents, effects); break;
      default: return noop(state);
    }
    return done();
  }

  if (action.type === 'player_forfeited') {
    const newlyForfeited = action.playerIds.filter((id) => s.players[id] && !s.players[id]!.forfeited);
    if (newlyForfeited.length === 0) return noop(state);
    for (const id of newlyForfeited) {
      const player = s.players[id]!;
      player.forfeited = true;
      delete s.night.wolfVotes[id];
      if (player.alive) eliminate(s, id, 'disconnect_timeout', publicEvents);
    }
    if (Object.values(s.players).every((p) => !p.alive)) { finishGame(s, null, true, publicEvents, effects); return done(); }
    const winner = checkWinner(s);
    if (winner) { finishGame(s, winner, false, publicEvents, effects); return done(); }
    if (s.phase === 'role_reveal' && allSubmitted(s, s.confirmedRolePlayerIds)) {
      cancelCurrentTimer(s, effects);
      startNight(s, ctx, 1, publicEvents, effects);
    } else if (s.phase === 'night') {
      if (allWolvesVoted(s)) s.night.killTargetId ??= selectWolfTarget(s, false);
      tryResolveNight(s, ctx, publicEvents, effects);
    } else if (s.phase === 'day_announcement' && allSubmitted(s, s.announcementConfirmedPlayerIds)) {
      finishDayAnnouncement(s, ctx, publicEvents, effects);
    } else if (s.phase === 'discussion') {
      const current = s.speakingOrder[s.currentSpeakerIndex];
      if (!current || !s.players[current]?.alive) advanceSpeaker(s, ctx, publicEvents, effects);
    } else if ((s.phase === 'voting' || s.phase === 'runoff_voting') && allVotesSubmitted(s)) {
      settleVotes(s, ctx, s.phase === 'voting' ? 'normal' : 'runoff', publicEvents, effects);
    } else if (s.phase === 'hunter_shot' && s.pendingShoot && s.players[s.pendingShoot]?.forfeited) {
      resolveHunterShot(s, ctx, null, publicEvents, effects);
    } else if (s.phase === 'last_words' && s.lastWordsPlayerId && s.players[s.lastWordsPlayerId]?.forfeited) {
      finishLastWords(s, ctx, publicEvents, effects);
    }
    return done();
  }

  if (!actorId) return deny('只有参局玩家可以操作');
  const self = state.players[actorId];
  if (!self) return deny('未分配身份的玩家不能直接执行普通玩家操作');

  if (action.type === 'confirm_role') {
    if (state.phase !== 'role_reveal') return noop(state);
    if (!state.confirmedRolePlayerIds.includes(actorId)) s.confirmedRolePlayerIds.push(actorId);
    if (allSubmitted(s, s.confirmedRolePlayerIds)) {
      cancelCurrentTimer(s, effects);
      startNight(s, ctx, 1, publicEvents, effects);
    }
    return done();
  }

  if (action.type === 'night_kill') {
    if (state.phase !== 'night' || !self.alive || self.role !== 'wolf') return deny('当前不能发起狼人击杀');
    if (!wolfTargetCandidates(state).includes(action.targetPlayerId)) return deny('击杀目标必须是存活玩家');
    s.night.wolfVotes[actorId] = action.targetPlayerId;
    if (allWolvesVoted(s)) {
      s.night.killTargetId = selectWolfTarget(s, false);
      tryResolveNight(s, ctx, publicEvents, effects);
    }
    return done();
  }

  if (action.type === 'seer_check') {
    if (state.phase !== 'night' || !self.alive || self.role !== 'seer') return deny('当前不能查验身份');
    if (state.night.seerChecked) return deny('今晚已经查验过');
    const target = state.players[action.targetPlayerId];
    if (!target || !target.alive || action.targetPlayerId === actorId) return deny('查验目标无效');
    const result = { night: state.day, playerId: action.targetPlayerId, team: teamOf(target.role) };
    s.night.seerChecked = true;
    s.night.seerResult = result;
    s.seerHistory.push(result);
    tryResolveNight(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'witch_save') {
    if (state.phase !== 'night' || !self.alive || self.role !== 'witch') return deny('当前不能使用解药');
    if (state.witchSaveUsed || state.night.witchSaveDecision !== null) return deny('解药已不可用或已做出决定');
    if (!state.night.killTargetId) return deny('尚未确定刀口目标');
    const canSelfSave = state.config.witchSelfSave === 'always' || (state.config.witchSelfSave === 'first_night' && state.day === 1);
    if (action.save && state.night.killTargetId === actorId && !canSelfSave) return deny('当前规则女巫不能自救');
    s.night.witchSaveDecision = action.save;
    if (action.save) {
      s.witchSaveUsed = true;
      s.night.witchPoisonDecided = true;
    }
    tryResolveNight(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'witch_poison') {
    if (state.phase !== 'night' || !self.alive || self.role !== 'witch') return deny('当前不能使用毒药');
    if (state.witchPoisonUsed || state.night.witchPoisonDecided) return deny('毒药已不可用或已做出决定');
    if (state.night.witchSaveDecision === null) return deny('请先确认是否使用解药');
    if (action.targetPlayerId !== null) {
      if (s.night.witchSaveDecision === true) return deny('同一晚不能同时使用解药和毒药');
      const target = state.players[action.targetPlayerId];
      if (!target || !target.alive || action.targetPlayerId === actorId) return deny('下毒目标无效');
      s.night.witchPoisonTargetId = action.targetPlayerId;
      s.witchPoisonUsed = true;
    }
    s.night.witchPoisonDecided = true;
    tryResolveNight(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'guard_guard') {
    if (state.phase !== 'night' || !self.alive || self.role !== 'guard') return deny('当前不能执行守护');
    if (state.night.guardDecided) return deny('今晚已做出守护决定');
    if (action.targetPlayerId !== null) {
      const target = state.players[action.targetPlayerId];
      if (!target || !target.alive) return deny('守护目标无效');
      if (action.targetPlayerId === state.lastGuardTargetId) return deny('不能连续两晚守护同一人');
    }
    s.night.guardDecided = true;
    s.night.guardTargetId = action.targetPlayerId;
    tryResolveNight(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'hunter_shoot') {
    if (state.phase !== 'hunter_shot' || state.pendingShoot !== actorId) return deny('当前不是你的开枪时机');
    if (action.targetPlayerId !== null) {
      const target = state.players[action.targetPlayerId];
      if (!target || !target.alive || action.targetPlayerId === actorId) return deny('开枪目标无效');
    }
    resolveHunterShot(s, ctx, action.targetPlayerId, publicEvents, effects);
    return done();
  }

  if (action.type === 'confirm_announcement') {
    if (state.phase !== 'day_announcement') return noop(state);
    if (!state.announcementConfirmedPlayerIds.includes(actorId)) s.announcementConfirmedPlayerIds.push(actorId);
    if (allSubmitted(s, s.announcementConfirmedPlayerIds)) finishDayAnnouncement(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'finish_speech') {
    if (state.phase !== 'discussion' || !self.alive || state.speakingOrder[state.currentSpeakerIndex] !== actorId) return deny('当前不是你的发言时机');
    advanceSpeaker(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'ready_vote') {
    if (state.phase !== 'free_discussion' || !self.alive) return deny('当前不是自由发言时机');
    if (!state.freeDiscussionReadyPlayerIds.includes(actorId)) s.freeDiscussionReadyPlayerIds.push(actorId);
    if (allFreeDiscussionReady(s)) startVoting(s, ctx, 'normal', [], publicEvents, effects);
    return done();
  }

  if (action.type === 'day_vote') {
    const kind = state.phase === 'voting' ? 'normal' : state.phase === 'runoff_voting' ? 'runoff' : null;
    if (!kind || !self.alive) return deny('当前不能投票');
    if (self.idiotRevealed) return deny('翻牌白痴失去投票权');
    if (kind === 'runoff' && state.runoffCandidates.includes(actorId)) return deny('加赛候选人不能投票');
    if (actorId in state.votes) return deny('本轮选票已经锁定');
    if (action.targetPlayerId !== null) {
      const target = state.players[action.targetPlayerId];
      if (!target?.alive || action.targetPlayerId === actorId) return deny('投票目标无效');
      if (target.idiotRevealed) return deny('不能放逐已翻牌的白痴');
      if (kind === 'runoff' && !state.runoffCandidates.includes(action.targetPlayerId)) return deny('加赛只能投给候选玩家');
    }
    s.votes[actorId] = action.targetPlayerId;
    if (allVotesSubmitted(s)) settleVotes(s, ctx, kind, publicEvents, effects);
    return done();
  }

  if (action.type === 'finish_last_words') {
    if (state.phase !== 'last_words' || state.lastWordsPlayerId !== actorId) return deny('当前不能结束遗言');
    finishLastWords(s, ctx, publicEvents, effects);
    return done();
  }

  return deny('当前阶段不能执行该动作');
}

export function buildV2PublicView(state: V2State): V2PublicView {
  const over = state.phase === 'game_over';
  const voting = state.phase === 'voting' || state.phase === 'runoff_voting';
  return {
    gameId: 'werewolf',
    rulesetId: 'werewolf_platform_open_kill_v1',
    schemaVersion: 1,
    phase: state.phase,
    day: state.day,
    players: orderedIds(state).map((id) => {
      const p = state.players[id]!;
      return { playerId: id, alive: p.alive, seat: p.seat, forfeited: p.forfeited, exitReason: over ? p.exitReason : null, revealedRole: over ? p.role : null, idiotRevealed: p.idiotRevealed };
    }),
    config: { ...state.config, roles: { ...state.config.roles } },
    confirmedRolePlayerIds: [...state.confirmedRolePlayerIds],
    announcementConfirmedPlayerIds: [...state.announcementConfirmedPlayerIds],
    nightStage: computeNightStage(state),
    lastNightDeaths: [...state.lastNightDeaths],
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: state.phase === 'discussion' ? state.speakingOrder[state.currentSpeakerIndex] ?? null : null,
    freeDiscussionReadyPlayerIds: [...state.freeDiscussionReadyPlayerIds],
    lastWordsPlayerId: state.lastWordsPlayerId,
    deadlineAt: state.deadlineAt,
    votesSubmitted: voting ? Object.keys(state.votes).length : 0,
    votesExpected: voting ? votingIds(state).length : 0,
    runoffCandidates: [...state.runoffCandidates],
    lastVoteSummary: state.lastVoteSummary ? structuredClone(state.lastVoteSummary) : null,
    pendingShooterId: state.phase === 'hunter_shot'
      ? state.pendingShoot
      : (state.phase === 'vote_result' && state.lastVoteSummary?.eliminatedPlayerId && state.players[state.lastVoteSummary.eliminatedPlayerId]?.role === 'hunter'
          ? state.lastVoteSummary.eliminatedPlayerId
          : null),
    winner: state.winner,
    aborted: state.aborted,
    reveal: over ? { roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])), voteHistory: structuredClone(state.voteHistory) } : null,
  };
}

function playerCanAct(state: V2State, id: string): boolean {
  const player = state.players[id];
  if (!player || player.forfeited) return false;
  switch (state.phase) {
    case 'role_reveal': return true;
    case 'night':
      if (!player.alive) return false;
      if (player.role === 'wolf') return !(id in state.night.wolfVotes);
      if (player.role === 'seer') return !state.night.seerChecked;
      if (player.role === 'witch') return state.night.killTargetId !== null && !witchFinished(state);
      if (player.role === 'guard') return !state.night.guardDecided;
      return false;
    case 'hunter_shot': return state.pendingShoot === id;
    case 'day_announcement': return !state.announcementConfirmedPlayerIds.includes(id);
    case 'discussion': return player.alive && state.speakingOrder[state.currentSpeakerIndex] === id;
    case 'free_discussion': return player.alive && !state.freeDiscussionReadyPlayerIds.includes(id);
    case 'voting': return player.alive && !player.idiotRevealed && !(id in state.votes);
    case 'runoff_voting': return player.alive && !player.idiotRevealed && !state.runoffCandidates.includes(id) && !(id in state.votes);
    case 'last_words': return state.lastWordsPlayerId === id;
    default: return false;
  }
}

export function buildV2PlayerView(state: V2State, playerId: string): V2PlayerView {
  const base = buildV2PublicView(state);
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
      hasReadiedVote: state.freeDiscussionReadyPlayerIds.includes(playerId),
      myVote: state.votes[playerId] ?? null,
      lastWordsPending: state.phase === 'last_words' && state.lastWordsPlayerId === playerId,
      wolfTeammateIds: isAliveWolf ? orderedIds(state).filter((id) => id !== playerId && state.players[id]?.role === 'wolf') : [],
      wolfVotes: isAliveWolf ? { ...state.night.wolfVotes } : {},
      hasNightVoted: isAliveWolf && playerId in state.night.wolfVotes,
      seerResults: isAliveSeer ? structuredClone(state.seerHistory) : [],
      seerCheckedThisNight: isAliveSeer && state.night.seerChecked,
      nightVictimId: isAliveWitch && !state.witchSaveUsed ? state.night.killTargetId : null,
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
}

export function buildV2Result(state: V2State): V2Result {
  return { winner: state.winner, days: state.day, roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])), aborted: state.aborted };
}

export function assertV2Invariants(state: V2State): void {
  v2StateSchema.parse(state);
  const entries = Object.entries(state.players);
  const seats = entries.map(([, p]) => p.seat).sort((a, b) => a - b);
  if (seats.join(',') !== Array.from({ length: entries.length }, (_, i) => i).join(',')) throw new Error('席位必须连续覆盖 0..n-1');
  if (state.config.wolfKillScope !== 'any' || state.config.rulesetId !== 'werewolf_platform_open_kill_v1') throw new Error('v2 规则集身份要求 wolfKillScope=any');
  for (const [id, p] of Object.entries(state.players)) {
    if (p.alive && p.exitReason !== null) throw new Error(`存活玩家 ${id} 不得有 exitReason`);
    if (!p.alive && p.exitReason === null) throw new Error(`出局玩家 ${id} 必须有 exitReason`);
  }
  if (state.phase === 'game_over') { if (state.winner === null && !state.aborted) throw new Error('终局必须有赢家或中止标记'); }
  else if (state.winner !== null) throw new Error('非终局不得有赢家');
}

export function parseV2State(input: unknown): V2State { return v2StateSchema.parse(input); }
export function parseV2Action(input: unknown): V2Action { return v2ActionSchema.parse(input); }
