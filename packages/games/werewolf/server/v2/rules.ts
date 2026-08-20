/** werewolf_platform_open_kill_v1 — 纯规则 reducer。语义与冻结 legacy 一致（唯一变体 wolfKillScope=any）。 */
import type { Actor, GameContext, GameEffect, PrivateGameEvent } from '@ldj/shared';
import type { V2Action, V2Config, V2ConfigPace, V2Event, V2ExitReason, V2NightState, V2PendingOutcome, V2PlayerView, V2PublicView, V2Result, V2Role, V2State, V2Team, V2TimedPhase, V2VoteKind, V2VoteSummary } from './types.ts';
import { v2ActionSchema, v2StateSchema } from './schemas.ts';

export type V2ReduceResult = { ok: false; code: string; message: string } | { ok: true; nextState: V2State; publicEvents: V2Event[]; privateEvents: PrivateGameEvent[]; effects: GameEffect[]; resultCandidate: V2Result | null };

const PLAYER_ACTIONS = new Set<V2Action['type']>(['confirm_role', 'night_kill', 'seer_check', 'witch_save', 'witch_poison', 'guard_guard', 'hunter_shoot', 'confirm_announcement', 'finish_speech', 'day_vote', 'finish_last_words']);
const SPECIAL_ROLES: readonly V2Role[] = ['seer', 'witch', 'guard', 'hunter', 'idiot'];
const PACE_MS: Record<V2ConfigPace, Record<V2TimedPhase, number>> = {
  fast: { role_reveal: 15_000, night: 30_000, hunter_shot: 15_000, day_announcement: 10_000, discussion: 30_000, voting: 20_000, runoff_voting: 20_000, vote_result: 4_000, last_words: 20_000 },
  standard: { role_reveal: 30_000, night: 60_000, hunter_shot: 30_000, day_announcement: 10_000, discussion: 60_000, voting: 45_000, runoff_voting: 45_000, vote_result: 5_000, last_words: 30_000 },
  relaxed: { role_reveal: 45_000, night: 90_000, hunter_shot: 45_000, day_announcement: 10_000, discussion: 90_000, voting: 60_000, runoff_voting: 60_000, vote_result: 7_000, last_words: 45_000 },
};

const deny = (message: string): V2ReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
const noop = (state: V2State): V2ReduceResult => ({ ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null });
const okResult = (state: V2State, publicEvents: V2Event[], effects: GameEffect[]): V2ReduceResult => ({ ok: true, nextState: state, publicEvents, privateEvents: [], effects, resultCandidate: state.phase === 'game_over' ? buildV2Result(state) : null });
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
  state.votes = {}; state.runoffCandidates = []; state.pendingOutcome = null; state.lastWordsPlayerId = null;
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
    if (state.pendingOutcome?.next === 'last_words') state.pendingOutcome = { next: 'next_night', candidates: [], winner: null };
  } else {
    effects.push({ type: 'system_message', text: '猎人放弃了开枪' });
  }
  state.pendingShoot = null;
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  if (state.pendingOutcome) { continueAfterVoteResult(state, ctx, publicEvents, effects); return; }
  if (shooterId) {
    state.phase = 'day_announcement';
    state.announcementConfirmedPlayerIds = [];
    phaseChanged(state, publicEvents);
    schedulePhase(state, ctx, 'day_announcement', effects);
    effects.push({ type: 'system_message', text: state.lastNightDeaths.length === 0 ? '天亮了，昨夜是平安夜' : `天亮了，昨夜有 ${state.lastNightDeaths.length} 人死亡` });
  }
}
function resolveNightWithContext(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const reasons = new Map<string, V2ExitReason>();
  if (state.night.killTargetId && state.night.witchSaveDecision !== true) {
    if (wolfKillBlocked(state)) effects.push({ type: 'system_message', text: '守卫守住了狼人的袭击' });
    else reasons.set(state.night.killTargetId, 'night_kill');
  }
  if (state.night.witchPoisonTargetId) reasons.set(state.night.witchPoisonTargetId, 'poisoned');
  for (const [id, reason] of reasons) eliminate(state, id, reason, publicEvents);
  state.lastNightDeaths = [...reasons.keys()].sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0));
  publicEvents.push({ type: 'night_resolved', deaths: [...state.lastNightDeaths], day: state.day });
  const winner = checkWinner(state);
  if (winner) { finishGame(state, winner, false, publicEvents, effects); return; }
  const shooterId = hunterShooterOf(state, reasons);
  if (shooterId) { enterHunterShot(state, ctx, shooterId, publicEvents, effects); return; }
  state.phase = 'day_announcement';
  state.announcementConfirmedPlayerIds = [];
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'day_announcement', effects);
  effects.push({ type: 'system_message', text: state.lastNightDeaths.length === 0 ? '天亮了，昨夜是平安夜' : `天亮了，昨夜有 ${state.lastNightDeaths.length} 人死亡` });
}
function tryResolveNight(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  if (!allWolvesVoted(state)) return;
  state.night.killTargetId ??= selectWolfTarget(state, false);
  if (!state.night.killTargetId || !state.night.seerChecked || !witchFinished(state) || !guardFinished(state)) return;
  resolveNightWithContext(state, ctx, publicEvents, effects);
}

function speakingOrderForDay(state: V2State): string[] {
  const alive = aliveIds(state);
  if (alive.length === 0) return [];
  const offset = (state.day - 1) % alive.length;
  return [...alive.slice(offset), ...alive.slice(0, offset)];
}
function startDiscussion(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'discussion';
  state.speakingOrder = speakingOrderForDay(state);
  state.currentSpeakerIndex = 0;
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'discussion', effects, '0');
  effects.push({ type: 'system_message', text: `第 ${state.day} 天发言开始` });
}
function startVoting(state: V2State, ctx: GameContext, kind: V2VoteKind, candidates: string[], publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = kind === 'normal' ? 'voting' : 'runoff_voting';
  state.votes = {}; state.runoffCandidates = [...candidates]; state.pendingOutcome = null;
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, state.phase, effects, kind);
  effects.push({ type: 'system_message', text: kind === 'normal' ? '放逐投票开始' : '最高票并列，进入加赛投票' });
}
function advanceSpeaker(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  for (let index = state.currentSpeakerIndex + 1; index < state.speakingOrder.length; index += 1) {
    const id = state.speakingOrder[index]!;
    if (!state.players[id]?.alive) continue;
    state.currentSpeakerIndex = index;
    schedulePhase(state, ctx, 'discussion', effects, String(index));
    return;
  }
  startVoting(state, ctx, 'normal', [], publicEvents, effects);
}
const votingIds = (state: V2State): string[] => aliveIds(state).filter((id) => !state.players[id]?.idiotRevealed);
const allVotesSubmitted = (state: V2State): boolean => votingIds(state).every((id) => id in state.votes);
function settleVotes(state: V2State, ctx: GameContext, kind: V2VoteKind, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  const tally: Record<string, number> = {};
  let abstained = 0;
  for (const voterId of votingIds(state)) {
    const target = state.votes[voterId];
    if (!target || !state.players[target]?.alive || state.players[target]?.idiotRevealed) { abstained += 1; continue; }
    tally[target] = (tally[target] ?? 0) + 1;
  }
  const entries = Object.entries(tally);
  let outcome: V2VoteSummary['outcome'];
  let eliminatedPlayerId: string | null = null;
  let pending: V2PendingOutcome;
  if (entries.length === 0) {
    outcome = kind === 'normal' ? 'no_votes' : 'runoff_tie';
    pending = { next: 'next_night', candidates: [], winner: null };
  } else {
    const top = Math.max(...entries.map(([, count]) => count));
    const leaders = entries.filter(([, count]) => count === top).map(([id]) => id).sort((a, b) => (state.players[a]?.seat ?? 0) - (state.players[b]?.seat ?? 0));
    if (leaders.length === 1) {
      eliminatedPlayerId = leaders[0]!;
      const target = state.players[eliminatedPlayerId]!;
      if (target.role === 'idiot' && !target.idiotRevealed) {
        target.idiotRevealed = true;
        outcome = 'idiot_saved';
        pending = { next: 'next_night', candidates: [], winner: null };
        effects.push({ type: 'system_message', text: '白痴被放逐时翻牌免死，从今往后失去投票权' });
      } else {
        outcome = 'eliminated';
        eliminate(state, eliminatedPlayerId, 'voted_out', publicEvents);
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
  const summary: V2VoteSummary = { day: state.day, kind, outcome, tally, abstained, eliminatedPlayerId };
  state.lastVoteSummary = summary;
  state.voteHistory.push({ ...summary, tally: { ...tally }, votes: { ...state.votes } });
  state.pendingOutcome = pending;
  const shooterId = outcome === 'eliminated' && eliminatedPlayerId !== null && state.players[eliminatedPlayerId]?.role === 'hunter' ? eliminatedPlayerId : null;
  if (shooterId) { enterHunterShot(state, ctx, shooterId, publicEvents, effects); return; }
  state.phase = 'vote_result';
  publicEvents.push({ type: 'vote_resolved', summary }, { type: 'phase_changed', phase: 'vote_result', day: state.day });
  schedulePhase(state, ctx, 'vote_result', effects, kind);
}
function startLastWords(state: V2State, ctx: GameContext, playerId: string, publicEvents: V2Event[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  state.phase = 'last_words';
  state.lastWordsPlayerId = playerId;
  phaseChanged(state, publicEvents);
  schedulePhase(state, ctx, 'last_words', effects, playerId);
  effects.push({ type: 'system_message', text: '被放逐玩家发表遗言' });
}
function finishLastWords(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  const winner = state.pendingOutcome?.winner ?? checkWinner(state);
  cancelCurrentTimer(state, effects);
  state.lastWordsPlayerId = null;
  if (winner) finishGame(state, winner, false, publicEvents, effects);
  else startNight(state, ctx, state.day + 1, publicEvents, effects);
}
function continueAfterVoteResult(state: V2State, ctx: GameContext, publicEvents: V2Event[], effects: GameEffect[]): void {
  const pending = state.pendingOutcome;
  if (!pending) { startNight(state, ctx, state.day + 1, publicEvents, effects); return; }
  if (pending.next === 'runoff') {
    const candidates = pending.candidates.filter((id) => state.players[id]?.alive);
    if (candidates.length >= 2) startVoting(state, ctx, 'runoff', candidates, publicEvents, effects);
    else startNight(state, ctx, state.day + 1, publicEvents, effects);
    return;
  }
  if (pending.next === 'last_words' && state.lastVoteSummary?.eliminatedPlayerId) {
    startLastWords(state, ctx, state.lastVoteSummary.eliminatedPlayerId, publicEvents, effects);
    return;
  }
  startNight(state, ctx, state.day + 1, publicEvents, effects);
}
const allSubmitted = (state: V2State, submitted: readonly string[]): boolean => { const set = new Set(submitted); return aliveIds(state).every((id) => set.has(id)); };

export function createV2InitialState(ctx: GameContext, players: string[], config: V2Config): V2State {
  if (players.length < 6 || players.length > 12) throw new Error('狼人杀人数需为 6-12 人');
  if (new Set(players).size !== players.length) throw new Error('玩家列表存在重复');
  const wolfCount = players.length >= 9 ? 3 : 2;
  const specials: V2Role[] = ['seer', 'witch'];
  if (config.roles.guard) specials.push('guard');
  if (config.roles.hunter) specials.push('hunter');
  if (config.roles.idiot) specials.push('idiot');
  if (wolfCount + specials.length > players.length) throw new Error('扩展角色卡数超过玩家人数，请关闭部分扩展角色');
  const roles: V2Role[] = [...Array<V2Role>(wolfCount).fill('wolf'), ...specials, ...Array<V2Role>(players.length - wolfCount - specials.length).fill('villager')];
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
      case 'day_announcement': startDiscussion(s, ctx, publicEvents, effects); break;
      case 'discussion': advanceSpeaker(s, ctx, publicEvents, effects); break;
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
      startDiscussion(s, ctx, publicEvents, effects);
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
  if (!self || self.forfeited) return deny('你不在本局或已经弃权');

  if (action.type === 'confirm_role') {
    if (state.phase !== 'role_reveal' || !self.alive) return deny('当前不能确认身份');
    if (state.confirmedRolePlayerIds.includes(actorId)) return noop(state);
    s.confirmedRolePlayerIds.push(actorId);
    if (allSubmitted(s, s.confirmedRolePlayerIds)) { cancelCurrentTimer(s, effects); startNight(s, ctx, 1, publicEvents, effects); }
    return done();
  }

  if (state.phase === 'night') {
    if (!self.alive) return deny('已出局玩家不能夜间行动');
    if (action.type === 'night_kill') {
      if (self.role !== 'wolf') return deny('只有狼人可以投击杀票');
      if (actorId in state.night.wolfVotes) return deny('本夜击杀票已经锁定');
      const target = state.players[action.targetPlayerId];
      if (!target?.alive) return deny('击杀目标无效');
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
      if (self.role !== 'witch' || state.night.killTargetId === null || state.night.witchSaveDecision !== null) return deny('当前不能决定使用解药');
      if (action.save) {
        if (state.witchSaveUsed) return deny('解药已经用完');
        const victimIsSelf = state.night.killTargetId === actorId;
        const selfSaveAllowed = state.config.witchSelfSave === 'always' || (state.config.witchSelfSave === 'first_night' && state.day === 1);
        if (victimIsSelf && !selfSaveAllowed) return deny('本局规则下女巫不能自救');
        s.night.witchSaveDecision = true;
        s.night.witchPoisonDecided = true;
        s.witchSaveUsed = true;
      } else {
        s.night.witchSaveDecision = false;
      }
    } else if (action.type === 'witch_poison') {
      if (self.role !== 'witch' || state.night.killTargetId === null || state.night.witchPoisonDecided) return deny('当前不能决定使用毒药');
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
    tryResolveNight(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'hunter_shoot') {
    if (state.phase !== 'hunter_shot' || state.pendingShoot !== actorId) return deny('当前不能开枪');
    if (action.targetPlayerId !== null) {
      const target = state.players[action.targetPlayerId];
      if (!target?.alive || action.targetPlayerId === actorId) return deny('枪击目标无效');
    }
    resolveHunterShot(s, ctx, action.targetPlayerId, publicEvents, effects);
    return done();
  }

  if (action.type === 'confirm_announcement') {
    if (state.phase !== 'day_announcement') return noop(state);
    if (state.announcementConfirmedPlayerIds.includes(actorId)) return noop(state);
    s.announcementConfirmedPlayerIds.push(actorId);
    if (allSubmitted(s, s.announcementConfirmedPlayerIds)) startDiscussion(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'finish_speech') {
    if (state.phase !== 'discussion' || !self.alive) return deny('当前不是你的发言阶段');
    if (state.speakingOrder[state.currentSpeakerIndex] !== actorId) return deny('还没轮到你发言');
    advanceSpeaker(s, ctx, publicEvents, effects);
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
      return { playerId: id, alive: p.alive, seat: p.seat, forfeited: p.forfeited, exitReason: p.exitReason, revealedRole: over ? p.role : null, idiotRevealed: p.idiotRevealed };
    }),
    config: { ...state.config, roles: { ...state.config.roles } },
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
    reveal: over ? { roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])), voteHistory: structuredClone(state.voteHistory) } : null,
  };
}

function playerCanAct(state: V2State, id: string): boolean {
  const player = state.players[id];
  if (!player || player.forfeited) return false;
  switch (state.phase) {
    case 'role_reveal': return player.alive;
    case 'night':
      if (!player.alive) return false;
      if (player.role === 'wolf') return !(id in state.night.wolfVotes);
      if (player.role === 'seer') return !state.night.seerChecked;
      if (player.role === 'witch') return state.night.killTargetId !== null && !witchFinished(state);
      if (player.role === 'guard') return !state.night.guardDecided;
      return false;
    case 'hunter_shot': return state.pendingShoot === id;
    case 'day_announcement': return player.alive && !state.announcementConfirmedPlayerIds.includes(id);
    case 'discussion': return player.alive && state.speakingOrder[state.currentSpeakerIndex] === id;
    case 'voting':
    case 'runoff_voting': return player.alive && !player.idiotRevealed && !(id in state.votes);
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
      myVote: state.votes[playerId] ?? null,
      lastWordsPending: state.phase === 'last_words' && state.lastWordsPlayerId === playerId,
      wolfTeammateIds: isAliveWolf ? orderedIds(state).filter((id) => id !== playerId && state.players[id]?.role === 'wolf') : [],
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
