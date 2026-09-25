import test from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, GameContext } from '@ldj/shared';
import {
  werewolfModule,
  type WerewolfAction,
  type WerewolfState,
  type WerewolfTimedPhase,
} from '../server/module.ts';

const ctx: GameContext = {
  now: 1,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

const ids = ['w1', 'w2', 's', 'x', 'v1', 'v2'];
const actor = (playerId: string): Actor => ({ kind: 'player', playerId });
const system: Actor = { kind: 'system', source: 'admin' };

function apply(state: WerewolfState, by: Actor, action: WerewolfAction): WerewolfState {
  const result = werewolfModule.reduce(ctx, state, by, action);
  if (!result.ok) assert.fail(result.message);
  return result.state;
}

function newGame(legacy = true): WerewolfState {
  const state = werewolfModule.createInitialState(ctx, ids, {
    rulesetId: 'werewolf_legacy_platform_v2',
    preset: 'classic',
    pace: 'standard',
    witchSelfSave: 'first_night',
    winCondition: 'numbers',
    wolfKillScope: 'non_wolf',
    roles: { guard: false, hunter: false, idiot: false },
  });
  if (legacy) state.timelineState = null;
  return state;
}

function timeout(state: WerewolfState, phase: WerewolfTimedPhase): WerewolfState {
  assert.equal(state.phase, phase);
  assert.ok(state.phaseToken);
  return apply(state, system, { type: 'phase_timeout', phase, day: state.day, token: state.phaseToken });
}

function startedNight(): WerewolfState {
  let state = newGame();
  state = apply(state, system, { type: 'begin' });
  for (const id of ids) state = apply(state, actor(id), { type: 'confirm_role' });
  assert.equal(state.phase, 'night');
  assert.equal(state.day, 1);
  return state;
}

function resolvedDayAnnouncement(): WerewolfState {
  let state = startedNight();
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  state = apply(state, actor('x'), { type: 'witch_save', save: false });
  state = apply(state, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(state.phase, 'day_announcement');
  return state;
}

function aliveIds(state: WerewolfState): string[] {
  return Object.entries(state.players)
    .filter(([, player]) => player.alive)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

test('werewolf assigns roles and keeps spectator view redacted', () => {
  const state = newGame();
  const roles = Object.values(state.players).map((p) => p.role);
  assert.equal(roles.filter((r) => r === 'wolf').length, 2);
  assert.equal(roles.filter((r) => r === 'seer').length, 1);
  assert.equal(roles.filter((r) => r === 'witch').length, 1);
  assert.equal(state.schemaVersion, 5);
  assert.equal(state.phase, 'role_reveal');

  const wolfView = werewolfModule.getPlayerView(state, 'w1');
  const spectator = werewolfModule.getSpectatorView(state);
  assert.equal(wolfView.me?.role, 'wolf');
  assert.equal(wolfView.me?.forfeited, false);
  assert.equal(spectator.players.every((p) => p.revealedRole === null), true);
});

test('werewolf keeps live role secrets and redacts them after death', () => {
  let state = startedNight();
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });

  const liveWolf = werewolfModule.getPlayerView(state, 'w1').me;
  const liveSeer = werewolfModule.getPlayerView(state, 's').me;
  const liveWitch = werewolfModule.getPlayerView(state, 'x').me;
  assert.deepEqual(liveWolf?.wolfTeammateIds, ['w2']);
  assert.deepEqual(liveWolf?.wolfVotes, { w1: 'v1', w2: 'v1' });
  assert.equal(liveWolf?.hasNightVoted, true);
  assert.equal(liveSeer?.seerResults.length, 1);
  assert.equal(liveSeer?.seerCheckedThisNight, true);
  assert.equal(liveWitch?.nightVictimId, 'v1');

  const deadState = structuredClone(state);
  deadState.players.w1!.alive = false;
  deadState.players.s!.alive = false;
  deadState.players.x!.alive = false;
  deadState.witchSaveUsed = true;
  deadState.witchPoisonUsed = true;
  deadState.night.witchSaveDecision = true;
  deadState.night.witchPoisonDecided = true;

  const deadWolf = werewolfModule.getPlayerView(deadState, 'w1').me;
  const deadSeer = werewolfModule.getPlayerView(deadState, 's').me;
  const deadWitch = werewolfModule.getPlayerView(deadState, 'x').me;
  assert.equal(deadWolf?.role, 'wolf');
  assert.equal(deadWolf?.alive, false);
  assert.equal(deadWolf?.canAct, false);
  assert.deepEqual(deadWolf?.wolfTeammateIds, []);
  assert.deepEqual(deadWolf?.wolfVotes, {});
  assert.equal(deadWolf?.hasNightVoted, false);
  assert.deepEqual(deadSeer?.seerResults, []);
  assert.equal(deadSeer?.seerCheckedThisNight, false);
  assert.equal(deadWitch?.nightVictimId, null);
  assert.equal(deadWitch?.witchSaveUsed, false);
  assert.equal(deadWitch?.witchPoisonUsed, false);
  assert.equal(deadWitch?.witchSaveDecision, null);
  assert.equal(deadWitch?.witchPoisonDecided, false);
  assert.equal(deadWitch?.witchCanSelfSave, false);
});

test('werewolf enters night after role confirms and resolves night actions', () => {
  const state = resolvedDayAnnouncement();
  assert.equal(state.players.v1?.alive, false);
  assert.equal(state.players.v1?.exitReason, 'night_kill');
  assert.deepEqual(state.lastNightDeaths, ['v1']);
  assert.equal(state.night.killTargetId, 'v1');
  assert.equal(state.night.seerResult?.team, 'wolves');
});

test('werewolf handles day confirmation speeches voting result last words and winner', () => {
  let state = resolvedDayAnnouncement();
  for (const id of aliveIds(state)) state = apply(state, actor(id), { type: 'confirm_announcement' });
  assert.equal(state.phase, 'discussion');

  const order = [...state.speakingOrder];
  for (const id of order) state = apply(state, actor(id), { type: 'finish_speech' });
  assert.equal(state.phase, 'voting');

  const votes: Array<[string, string]> = [
    ['w1', 'v2'],
    ['w2', 'v2'],
    ['s', 'v2'],
    ['x', 'v2'],
    ['v2', 'w1'],
  ];
  for (const [from, target] of votes) state = apply(state, actor(from), { type: 'day_vote', targetPlayerId: target });

  assert.equal(state.phase, 'vote_result');
  assert.equal(state.lastVoteSummary?.eliminatedPlayerId, 'v2');
  assert.equal(state.players.v2?.alive, false);

  assert.ok(state.phaseToken);
  state = timeout(state, 'vote_result');
  assert.equal(state.phase, 'last_words');
  assert.equal(state.lastWordsPlayerId, 'v2');

  state = apply(state, actor('v2'), { type: 'finish_last_words' });
  assert.equal(state.phase, 'game_over');
  assert.equal(state.winner, 'wolves');
  assert.deepEqual(werewolfModule.getResult(state), {
    winner: 'wolves',
    days: 1,
    roles: { w1: 'wolf', w2: 'wolf', s: 'seer', x: 'witch', v1: 'villager', v2: 'villager' },
    aborted: false,
  });
});

test('werewolf witch self-save respects config', () => {
  let state = startedNight();
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'x' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'x' });
  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  state = apply(state, actor('x'), { type: 'witch_save', save: true });
  assert.equal(state.night.witchSaveDecision, true);

  let state2 = werewolfModule.createInitialState(ctx, ids, { rulesetId: 'werewolf_legacy_platform_v2', preset: 'classic', pace: 'standard', witchSelfSave: 'never', winCondition: 'numbers', wolfKillScope: 'non_wolf', roles: { guard: false, hunter: false, idiot: false } });
  state2.timelineState = null;
  state2 = apply(state2, system, { type: 'begin' });
  for (const id of ids) state2 = apply(state2, actor(id), { type: 'confirm_role' });
  state2 = apply(state2, actor('w1'), { type: 'night_kill', targetPlayerId: 'x' });
  state2 = apply(state2, actor('w2'), { type: 'night_kill', targetPlayerId: 'x' });
  state2 = apply(state2, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  const denied = werewolfModule.reduce(ctx, state2, actor('x'), { type: 'witch_save', save: true });
  assert.equal(denied.ok, false);
});

test('werewolf accepts flat role pool keys and merges with nested roles', () => {
  // 目录 setup 扁平选项（1-3）：guard/hunter/idiot 直接入池
  const flat = werewolfModule.parseConfig({
    rulesetId: 'werewolf_legacy_platform_v2',
    pace: 'standard',
    guard: true,
    hunter: true,
    idiot: false,
  });
  assert.deepEqual(flat.roles, { guard: true, hunter: true, idiot: false });

  // 旧嵌套 roles 兼容：嵌套为 true 优先合并，扁平为 true 亦入池
  const merged = werewolfModule.parseConfig({
    rulesetId: 'werewolf_legacy_platform_v2',
    roles: { guard: true, hunter: false, idiot: true },
    guard: false,
    hunter: true,
    idiot: true,
  });
  assert.deepEqual(merged.roles, { guard: true, hunter: true, idiot: true });
});

test('werewolf runoff tie goes to next night without elimination', () => {
  let state = resolvedDayAnnouncement();
  for (const id of aliveIds(state)) state = apply(state, actor(id), { type: 'confirm_announcement' });
  for (const id of [...state.speakingOrder]) state = apply(state, actor(id), { type: 'finish_speech' });
  const normal: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 's'], ['s', 'v2'], ['x', 's'], ['v2', 'w1'],
  ];
  for (const [from, target] of normal) state = apply(state, actor(from), { type: 'day_vote', targetPlayerId: target });
  assert.equal(state.lastVoteSummary?.outcome, 'tie');
  state = timeout(state, 'vote_result');
  assert.equal(state.phase, 'runoff_voting');
  const runoff: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 'v2'], ['x', 's'], ['v2', 's'], ['s', null],
  ];
  for (const [from, target] of runoff) state = apply(state, actor(from), { type: 'day_vote', targetPlayerId: target });
  assert.equal(state.lastVoteSummary?.outcome, 'runoff_tie');
  state = timeout(state, 'vote_result');
  assert.equal(state.phase, 'night');
  assert.equal(state.players.v2?.alive, true);
  assert.equal(state.players.s?.alive, true);
});

test('werewolf rejects stale phase_timeout token', () => {
  const state = startedNight();
  const r = werewolfModule.reduce(ctx, state, system, { type: 'phase_timeout', phase: 'night', day: 1, token: 'night:1:stale' });
  assert.equal(r.ok, true);
  assert.equal(r.state.phase, 'night');
  assert.equal(r.state.phaseToken, state.phaseToken);
});

test('werewolf rejects actions after game over', () => {
  let state = resolvedDayAnnouncement();
  for (const id of aliveIds(state)) state = apply(state, actor(id), { type: 'confirm_announcement' });
  for (const id of [...state.speakingOrder]) state = apply(state, actor(id), { type: 'finish_speech' });
  const votes: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 'v2'], ['s', 'v2'], ['x', 'v2'], ['v2', 'w1'],
  ];
  for (const [from, target] of votes) state = apply(state, actor(from), { type: 'day_vote', targetPlayerId: target });
  state = timeout(state, 'vote_result');
  state = apply(state, actor('v2'), { type: 'finish_last_words' });
  assert.equal(state.phase, 'game_over');
  const r = werewolfModule.reduce(ctx, state, actor('w1'), { type: 'night_kill', targetPlayerId: 'v2' });
  assert.equal(r.ok, false);
});

test('werewolf winCondition roles ends game when specials wiped (numbers would continue)', () => {
  const ids8 = ['w1', 'w2', 's', 'x', 'v1', 'v2', 'v3', 'v4'];

  const buildGame = (winCondition: 'numbers' | 'roles') => {
    let st = werewolfModule.createInitialState(ctx, ids8, {
      rulesetId: 'werewolf_legacy_platform_v2',
      preset: 'classic',
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition,
      wolfKillScope: 'non_wolf',
      roles: { guard: false, hunter: false, idiot: false },
    });
    st.timelineState = null;
    st = apply(st, system, { type: 'begin' });
    for (const id of ids8) st = apply(st, actor(id), { type: 'confirm_role' });
    st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
    st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
    st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
    st = apply(st, actor('x'), { type: 'witch_save', save: false });
    st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
    for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'confirm_announcement' });
    st.players.s!.alive = false;
    st.players.x!.alive = false;
    while (st.phase === 'discussion') {
      const current = st.speakingOrder[st.currentSpeakerIndex];
      if (!current) break;
      st = apply(st, actor(current), { type: 'finish_speech' });
    }
    for (const id of aliveIds(st)) {
      const target = id === 'w1' ? 'v2' : 'w1';
      st = apply(st, actor(id), { type: 'day_vote', targetPlayerId: target });
    }
    return st;
  };

  const roles = buildGame('roles');
  assert.equal(roles.lastVoteSummary?.outcome, 'eliminated');
  assert.equal(roles.pendingOutcome?.winner, 'wolves');
  let afterRoles = timeout(roles, 'vote_result');
  assert.equal(afterRoles.phase, 'last_words');
  afterRoles = apply(afterRoles, actor('w1'), { type: 'finish_last_words' });
  assert.equal(afterRoles.phase, 'game_over');
  assert.equal(afterRoles.winner, 'wolves');

  const nums = buildGame('numbers');
  assert.equal(nums.lastVoteSummary?.outcome, 'eliminated');
  assert.equal(nums.pendingOutcome?.winner, null);
  let afterNums = timeout(nums, 'vote_result');
  assert.equal(afterNums.phase, 'last_words');
  afterNums = apply(afterNums, actor('w1'), { type: 'finish_last_words' });
  assert.equal(afterNums.phase, 'night');
  assert.equal(afterNums.winner, null);
});
