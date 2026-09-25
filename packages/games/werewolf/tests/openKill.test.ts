/**
 * 开放夜刀规则集（werewolf_platform_open_kill_v1）测试。
 * `wolfKillScope: 'any'` 允许狼人把击杀票投给任意存活玩家，包括自己与同伴；
 * `'non_wolf'` 保持 werewolf_legacy_platform_v2 冻结语义。
 * 注意：ctx.random.shuffle 为恒等洗牌 → 角色顺序为 [wolf, wolf, seer, witch, villager…]。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, GameContext } from '@ldj/shared';
import {
  werewolfModule,
  type WerewolfAction,
  type WerewolfConfig,
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

const OPEN_KILL_CONFIG: WerewolfConfig = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'standard',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
  wolfKillScope: 'any',
  roles: { guard: false, hunter: false, idiot: false },
};

function apply(state: WerewolfState, by: Actor, action: WerewolfAction): WerewolfState {
  const result = werewolfModule.reduce(ctx, state, by, action);
  if (!result.ok) assert.fail(result.message);
  return result.state;
}

function startedNight(config: WerewolfConfig, legacy = true): WerewolfState {
  let state = werewolfModule.createInitialState(ctx, ids, config);
  if (legacy) state.timelineState = null;
  state = apply(state, system, { type: 'begin' });
  for (const id of ids) state = apply(state, actor(id), { type: 'confirm_role' });
  assert.equal(state.phase, 'night');
  return state;
}

function timeout(state: WerewolfState, phase: WerewolfTimedPhase): WerewolfState {
  assert.equal(state.phase, phase);
  assert.ok(state.phaseToken);
  return apply(state, system, { type: 'phase_timeout', phase, day: state.day, token: state.phaseToken });
}

test('open kill: 规则集身份权威决定夜刀范围并拒绝矛盾组合', () => {
  const legacy = werewolfModule.parseConfig({ rulesetId: 'werewolf_legacy_platform_v2' });
  assert.equal(legacy.rulesetId, 'werewolf_legacy_platform_v2');
  assert.equal(legacy.wolfKillScope, 'non_wolf');

  const open = werewolfModule.parseConfig({ rulesetId: 'werewolf_platform_open_kill_v1' });
  assert.equal(open.rulesetId, 'werewolf_platform_open_kill_v1');
  assert.equal(open.wolfKillScope, 'any');

  assert.equal(werewolfModule.parseConfig({}).wolfKillScope, 'non_wolf');
  assert.equal(werewolfModule.parseConfig({ wolfKillScope: 'any' }).rulesetId, 'werewolf_platform_open_kill_v1');
  assert.throws(() => werewolfModule.parseConfig({ rulesetId: 'unknown' }));
  assert.throws(() => werewolfModule.parseConfig({ wolfKillScope: 'self_only' }));
  assert.throws(() => werewolfModule.parseConfig({
    rulesetId: 'werewolf_legacy_platform_v2',
    wolfKillScope: 'any',
  }));
  assert.throws(() => werewolfModule.parseConfig({
    rulesetId: 'werewolf_platform_open_kill_v1',
    wolfKillScope: 'non_wolf',
  }));
});

test('open kill: non_wolf 继续拒绝狼刀同伴与自刀', () => {
  const state = startedNight({
    ...OPEN_KILL_CONFIG,
    rulesetId: 'werewolf_legacy_platform_v2',
    wolfKillScope: 'non_wolf',
  });
  assert.equal(werewolfModule.reduce(ctx, state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w2' }).ok, false);
  assert.equal(werewolfModule.reduce(ctx, state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w1' }).ok, false);
});

test('open kill: any 允许狼刀自己并正常结算夜晚', () => {
  let state = startedNight(OPEN_KILL_CONFIG);
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w1' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'w1' });
  assert.equal(state.night.killTargetId, 'w1');

  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  const witchView = werewolfModule.getPlayerView(state, 'x').me;
  assert.equal(witchView?.nightVictimId, 'w1');

  state = apply(state, actor('x'), { type: 'witch_save', save: false });
  state = apply(state, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(state.phase, 'day_announcement');
  assert.equal(state.players.w1?.alive, false);
  assert.equal(state.players.w1?.exitReason, 'night_kill');
  assert.deepEqual(state.lastNightDeaths, ['w1']);
});

test('open kill: any 允许狼刀同伴且平票仍按座位确定', () => {
  let state = startedNight(OPEN_KILL_CONFIG);
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w2' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'v2' });
  // w2 座位 1、v2 座位 5：一票对一票时取座位较小者
  assert.equal(state.night.killTargetId, 'w2');
});

test('open kill: any 下女巫解药仍可救回被自刀的狼人', () => {
  let state = startedNight(OPEN_KILL_CONFIG);
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w1' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'w1' });
  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'v1' });
  state = apply(state, actor('x'), { type: 'witch_save', save: true });
  assert.equal(state.phase, 'day_announcement');
  assert.equal(state.players.w1?.alive, true);
  assert.deepEqual(state.lastNightDeaths, []);
});

test('open kill: any 下守卫仍不能自守但可守下被狼刀的同伴目标', () => {
  const guarded: WerewolfConfig = {
    ...OPEN_KILL_CONFIG,
    roles: { guard: true, hunter: false, idiot: false },
  };
  let state = startedNight(guarded);
  // 角色顺序：w1 wolf、w2 wolf、s seer、x witch、v1 guard、v2 villager
  assert.equal(state.players.v1?.role, 'guard');
  assert.equal(werewolfModule.reduce(ctx, state, actor('v1'), { type: 'guard_guard', targetPlayerId: 'v1' }).ok, false);

  state = apply(state, actor('v1'), { type: 'guard_guard', targetPlayerId: 'w2' });
  state = apply(state, actor('w1'), { type: 'night_kill', targetPlayerId: 'w2' });
  state = apply(state, actor('w2'), { type: 'night_kill', targetPlayerId: 'w2' });
  state = apply(state, actor('s'), { type: 'seer_check', targetPlayerId: 'v2' });
  state = apply(state, actor('x'), { type: 'witch_save', save: false });
  state = apply(state, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(state.phase, 'day_announcement');
  assert.equal(state.players.w2?.alive, true);
  assert.deepEqual(state.lastNightDeaths, []);
});

test('open kill: any 下夜晚超时兜底取合法候选首位（含狼人）', () => {
  const state = startedNight(OPEN_KILL_CONFIG);
  const after = timeout(state, 'night');
  assert.equal(after.phase, 'day_announcement');
  assert.equal(after.night.killTargetId, 'w1');
  assert.deepEqual(after.lastNightDeaths, ['w1']);
});

test('open kill: 玩家视角公开 wolfKillScope 配置', () => {
  const state = startedNight(OPEN_KILL_CONFIG);
  assert.equal(werewolfModule.getPlayerView(state, 'w1').config.wolfKillScope, 'any');
  assert.equal(werewolfModule.getSpectatorView(state).config.wolfKillScope, 'any');
});

test('migrateSnapshot: v3 → v4 补 wolfKillScope 并保持其余字段', () => {
  assert.ok(werewolfModule.migrateSnapshot);
  const v3 = {
    schemaVersion: 3,
    phase: 'night',
    day: 1,
    players: {
      w1: { role: 'wolf', alive: true, seat: 0, forfeited: false, exitReason: null, idiotRevealed: false },
      v1: { role: 'villager', alive: true, seat: 1, forfeited: false, exitReason: null, idiotRevealed: false },
    },
    config: {
      preset: 'classic',
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      roles: { guard: false, hunter: false, idiot: false },
    },
    confirmedRolePlayerIds: ['w1', 'v1'],
    announcementConfirmedPlayerIds: [],
    night: {
      wolfVotes: { w1: 'v1' },
      killTargetId: 'v1',
      seerChecked: true,
      seerResult: null,
      witchSaveDecision: false,
      witchPoisonDecided: true,
      witchPoisonTargetId: null,
      guardDecided: true,
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

  const migrated = werewolfModule.migrateSnapshot(3, v3);
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.config.rulesetId, 'werewolf_legacy_platform_v2');
  assert.equal(migrated.config.wolfKillScope, 'non_wolf');
  assert.equal(migrated.night.killTargetId, 'v1');
  assert.deepEqual(migrated.night.wolfVotes, { w1: 'v1' });
  assert.equal(migrated.players.w1?.idiotRevealed, false);
  assert.equal(migrated.lastGuardTargetId, null);
  assert.equal(migrated.pendingShoot, null);
});

test('migrateSnapshot: v4 保留开放规则并拒绝矛盾规则集配置', () => {
  const migrateSnapshot = werewolfModule.migrateSnapshot;
  assert.ok(migrateSnapshot);
  const state = startedNight(OPEN_KILL_CONFIG);
  const v4State = { ...state, schemaVersion: 4 };
  const restored = migrateSnapshot(4, v4State);
  assert.deepEqual(restored, { ...state, schemaVersion: 5, timelineState: null });

  assert.throws(() => migrateSnapshot(4, {
    ...v4State,
    config: {
      ...v4State.config,
      wolfKillScope: 'non_wolf',
    },
  }), /rulesetId 与 wolfKillScope 不匹配/);
});
