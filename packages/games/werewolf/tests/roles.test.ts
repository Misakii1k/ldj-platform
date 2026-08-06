/**
 * 扩展角色（守卫/猎人/白痴）行为测试 + v1/v2→v3 迁移测试。
 * 注意：ctx.random.shuffle 为恒等洗牌 → 角色按固定顺序分配：
 *   [wolf×n, seer, witch, (guard), (hunter), (idiot), villager×…]
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, GameContext } from '@ldj/shared';
import {
  werewolfModule,
  type WerewolfAction,
  type WerewolfConfig,
  type WerewolfRolePool,
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

const actor = (playerId: string): Actor => ({ kind: 'player', playerId });
const system: Actor = { kind: 'system', source: 'admin' };

function apply(state: WerewolfState, by: Actor, action: WerewolfAction): WerewolfState {
  const result = werewolfModule.reduce(ctx, state, by, action);
  if (!result.ok) assert.fail(result.message);
  return result.state;
}

const BASE_CONFIG: WerewolfConfig = {
  rulesetId: 'werewolf_legacy_platform_v2',
  preset: 'classic',
  pace: 'standard',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
  wolfKillScope: 'non_wolf',
  roles: { guard: false, hunter: false, idiot: false },
};

function createGame(ids: string[], config: WerewolfConfig = BASE_CONFIG): WerewolfState {
  return werewolfModule.createInitialState(ctx, ids, config);
}

function configWithRoles(roles: Partial<WerewolfRolePool>): WerewolfConfig {
  return { ...BASE_CONFIG, roles: { ...BASE_CONFIG.roles, ...roles } };
}

function timeout(state: WerewolfState, phase: WerewolfTimedPhase): WerewolfState {
  assert.equal(state.phase, phase);
  assert.ok(state.phaseToken);
  return apply(state, system, { type: 'phase_timeout', phase, day: state.day, token: state.phaseToken });
}

function migrateSnapshot(fromVersion: number, snapshot: unknown): WerewolfState {
  assert.ok(werewolfModule.migrateSnapshot);
  return werewolfModule.migrateSnapshot(fromVersion, snapshot);
}

function startedNight(state: WerewolfState): WerewolfState {
  let s = state;
  s = apply(s, system, { type: 'begin' });
  for (const id of Object.keys(s.players)) s = apply(s, actor(id), { type: 'confirm_role' });
  assert.equal(s.phase, 'night');
  return s;
}

/** 夜里完成狼刀 + 预言家查验 + 女巫救人不使用解药（毒药由调用方决定） */
function nightActions(s: WerewolfState, killTarget: string): WerewolfState {
  let st = s;
  for (const [id, p] of Object.entries(st.players)) {
    if (p.alive && p.role === 'wolf') st = apply(st, actor(id), { type: 'night_kill', targetPlayerId: killTarget });
  }
  const seer = Object.entries(st.players).find(([, p]) => p.alive && p.role === 'seer')?.[0];
  if (seer) st = apply(st, actor(seer), { type: 'seer_check', targetPlayerId: killTarget });
  const witch = Object.entries(st.players).find(([, p]) => p.alive && p.role === 'witch')?.[0];
  if (witch) st = apply(st, actor(witch), { type: 'witch_save', save: false });
  return st;
}

/** 女巫决定毒药（null = 不用毒）并完成夜晚结算 */
function nightPoison(s: WerewolfState, target: string | null): WerewolfState {
  const witch = Object.entries(s.players).find(([, p]) => p.alive && p.role === 'witch')?.[0];
  if (!witch) return s;
  return apply(s, actor(witch), { type: 'witch_poison', targetPlayerId: target });
}

function aliveIds(state: WerewolfState): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.alive)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

function skipDiscussion(state: WerewolfState): WerewolfState {
  let st = state;
  if (st.phase === 'day_announcement') {
    for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'confirm_announcement' });
  }
  assert.equal(st.phase, 'discussion');
  for (const id of [...st.speakingOrder]) st = apply(st, actor(id), { type: 'finish_speech' });
  return st;
}

/** 有投票权者全员投 target（候选人自己改投他人，避免自投非法） */
function voteAll(state: WerewolfState, target: string | null): WerewolfState {
  let st = state;
  for (const id of aliveIds(st)) {
    if (st.players[id]?.idiotRevealed) continue;
    let t = target;
    if (id === target) {
      const others = aliveIds(st).filter((x) => x !== id && x !== target && !st.players[x]?.idiotRevealed);
      t = others[0] ?? null;
    }
    st = apply(st, actor(id), { type: 'day_vote', targetPlayerId: t });
  }
  return st;
}

// ---------------------------------------------------------------- 角色池分配

test('roles pool: default game has no extended roles; enabled roles enter the pool', () => {
  const base = createGame(['w1', 'w2', 's', 'x', 'v1', 'v2']);
  const baseRoles = Object.values(base.players).map((p) => p.role);
  assert.equal(baseRoles.filter((r) => r === 'guard').length, 0);
  assert.equal(baseRoles.filter((r) => r === 'hunter').length, 0);
  assert.equal(baseRoles.filter((r) => r === 'idiot').length, 0);
  assert.equal(baseRoles.filter((r) => r === 'villager').length, 2);

  const ids7 = ['w1', 'w2', 's', 'x', 'g', 'h', 'i'];
  const full = createGame(ids7, {
    ...BASE_CONFIG,
    roles: { guard: true, hunter: true, idiot: true },
  });
  const roles = Object.values(full.players).map((p) => p.role);
  assert.deepEqual(roles, ['wolf', 'wolf', 'seer', 'witch', 'guard', 'hunter', 'idiot']);
});

test('roles pool: cards exceeding player count are rejected at game start', () => {
  assert.throws(() =>
    createGame(['w1', 'w2', 's', 'x', 'v1', 'v2'], {
      ...BASE_CONFIG,
      roles: { guard: true, hunter: true, idiot: true },
    }),
  );
});

// ---------------------------------------------------------------- 守卫

test('guard: blocks the wolf kill into a peace night', () => {
  const ids = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];
  let st = startedNight(createGame(ids, { ...BASE_CONFIG, roles: { guard: true, hunter: false, idiot: false } }));
  st = nightActions(st, 'v1');
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  st = nightPoison(st, null);
  assert.equal(st.phase, 'day_announcement');
  assert.deepEqual(st.lastNightDeaths, []);
  assert.equal(st.players.v1?.alive, true);
});

test('guard: does not block the witch poison', () => {
  const ids = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];
  let st = startedNight(createGame(ids, { ...BASE_CONFIG, roles: { guard: true, hunter: false, idiot: false } }));
  st = nightActions(st, 'v1');
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: 'v1' });
  assert.equal(st.phase, 'day_announcement');
  assert.deepEqual(st.lastNightDeaths, ['v1']);
  assert.equal(st.players.v1?.exitReason, 'poisoned');
});

test('guard: cannot guard the same player on consecutive nights', () => {
  const ids = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];
  let st = startedNight(createGame(ids, { ...BASE_CONFIG, roles: { guard: true, hunter: false, idiot: false } }));
  st = nightActions(st, 'v2');
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  st = nightPoison(st, null);
  st = timeout(st, 'day_announcement');
  st = skipDiscussion(st);
  st = voteAll(st, null);
  st = timeout(st, 'vote_result');
  // 第二夜
  st = nightActions(st, 'v3');
  assert.equal(st.phase, 'night');
  assert.equal(st.players.g?.alive, true);
  const denied = werewolfModule.reduce(ctx, st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  assert.equal(denied.ok, false);
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v3' });
  assert.equal(st.night.guardTargetId, 'v3');
});

test('guard: can skip guarding', () => {
  const ids = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];
  let st = startedNight(createGame(ids, { ...BASE_CONFIG, roles: { guard: true, hunter: false, idiot: false } }));
  st = nightActions(st, 'v1');
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: null });
  st = nightPoison(st, null);
  assert.equal(st.phase, 'day_announcement');
  assert.deepEqual(st.lastNightDeaths, ['v1']);
});

// ---------------------------------------------------------------- 猎人

test('hunter: shot on being voted out, and the shot kills without last words', () => {
  // 7 人：w1 w2 狼 / s 预言家 / x 女巫 / h 猎人 / v1 v2 村民
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, null);
  st = skipDiscussion(st);
  st = voteAll(st, 'h');
  assert.equal(st.phase, 'hunter_shot');
  assert.equal(st.pendingShoot, 'h');
  assert.equal(st.players.h?.alive, false);
  assert.equal(st.players.h?.exitReason, 'voted_out');

  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: 'w1' });
  assert.equal(st.players.w1?.alive, false);
  assert.equal(st.players.w1?.exitReason, 'hunter_shot');
  // 枪杀者无遗言：直接进入下一夜（而非 last_words）
  assert.equal(st.phase, 'night');
});

test('hunter: declining the shot keeps the normal last-words flow', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, null);
  st = skipDiscussion(st);
  st = voteAll(st, 'h');
  assert.equal(st.phase, 'hunter_shot');
  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: null });
  assert.equal(st.phase, 'last_words');
  assert.equal(st.lastWordsPlayerId, 'h');
});

test('hunter: timeout in hunter_shot counts as declining', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, null);
  st = skipDiscussion(st);
  st = voteAll(st, 'h');
  st = timeout(st, 'hunter_shot');
  assert.equal(st.phase, 'last_words');
  assert.equal(st.players.w1?.alive, true);
});

test('hunter: killed by poison does not trigger the shot', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'v1');
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: 'h' });
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.players.h?.exitReason, 'poisoned');
  assert.equal(st.pendingShoot, null);
});

test('hunter: killed by wolf at night gets a shot before day announcement', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'h');
  st = nightPoison(st, null);
  assert.equal(st.phase, 'hunter_shot');
  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: 'w2' });
  assert.equal(st.players.w2?.alive, false);
  assert.equal(st.phase, 'day_announcement');
});

test('hunter: shot that wipes the last wolf ends the game immediately', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2', 'v3'];
  let st = startedNight(createGame(ids, configWithRoles({ hunter: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, 'w2');
  st = skipDiscussion(st);
  st = voteAll(st, 'h');
  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: 'w1' });
  assert.equal(st.phase, 'game_over');
  assert.equal(st.winner, 'village');
});

// ---------------------------------------------------------------- 白痴

test('idiot: survives the vote by revealing, keeps speaking but loses vote rights', () => {
  const ids = ['w1', 'w2', 's', 'x', 'i', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ idiot: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, null);
  st = skipDiscussion(st);
  st = voteAll(st, 'i');
  assert.equal(st.lastVoteSummary?.outcome, 'idiot_saved');
  assert.equal(st.players.i?.alive, true);
  assert.equal(st.players.i?.idiotRevealed, true);
  // 无遗言，直接进下一夜
  assert.equal(st.phase, 'vote_result');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');

  // 推进到第二天白天投票阶段，验证翻牌白痴失去投票权
  st = nightActions(st, 'v2');
  st = nightPoison(st, null);
  st = skipDiscussion(st);

  // 白痴不能再投票
  const denied = werewolfModule.reduce(ctx, st, actor('i'), { type: 'day_vote', targetPlayerId: 'w1' });
  assert.equal(denied.ok, false);
  // 别人也不能投翻牌白痴
  const denied2 = werewolfModule.reduce(ctx, st, actor('v2'), { type: 'day_vote', targetPlayerId: 'i' });
  assert.equal(denied2.ok, false);
});

test('idiot: revealed idiot still survives wolf kill by normal death', () => {
  // 翻牌后狼刀白痴 → 正常死亡
  const ids = ['w1', 'w2', 's', 'x', 'i', 'v1', 'v2'];
  let st = startedNight(createGame(ids, configWithRoles({ idiot: true })));
  st = nightActions(st, 'v1');
  st = nightPoison(st, null);
  st = skipDiscussion(st);
  st = voteAll(st, 'i');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');
  st = nightActions(st, 'i');
  st = nightPoison(st, null);
  assert.equal(st.players.i?.alive, false);
  assert.equal(st.players.i?.exitReason, 'night_kill');
});

// ---------------------------------------------------------------- 迁移

test('migrateSnapshot: v2 → v4 fills new fields and keeps the rest', () => {
  const v2 = {
    schemaVersion: 2,
    phase: 'night',
    day: 1,
    players: {
      w1: { role: 'wolf', alive: true, seat: 0, forfeited: false, exitReason: null },
      v1: { role: 'villager', alive: true, seat: 1, forfeited: false, exitReason: null },
    },
    config: { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers' },
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
    deadlineAt: null,
    phaseToken: null,
    winner: null,
    aborted: false,
  };
  const migrated = migrateSnapshot(2, v2);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.config.rulesetId, 'werewolf_legacy_platform_v2');
  assert.equal(migrated.config.wolfKillScope, 'non_wolf');
  assert.equal(migrated.night.guardDecided, true);
  assert.equal(migrated.night.guardTargetId, null);
  assert.equal(migrated.lastGuardTargetId, null);
  assert.equal(migrated.pendingShoot, null);
  assert.deepEqual(migrated.config.roles, { guard: false, hunter: false, idiot: false });
  assert.equal(migrated.players.w1?.idiotRevealed, false);
  assert.equal(migrated.night.killTargetId, 'v1');
});

test('migrateSnapshot: v1 → v4 chains legacy fields through v2/v3 defaults', () => {
  const v1 = {
    schemaVersion: 1,
    phase: 'night',
    day: 2,
    players: {
      w1: { role: 'wolf', alive: true, seat: 0 },
      v1: { role: 'villager', alive: false, seat: 1 },
    },
    night: {
      killTargetId: 'v1',
      seerChecked: true,
      seerResult: { playerId: 'w1', team: 'wolves' },
      witchSaveDecision: false,
      witchPoisonTargetId: null,
    },
    lastNightDeaths: ['v1'],
    speakingOrder: [],
    currentSpeakerIndex: 0,
    votes: {},
    witchSaveUsed: false,
    witchPoisonUsed: false,
    winner: null,
  };

  const migrated = migrateSnapshot(1, v1);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.config.rulesetId, 'werewolf_legacy_platform_v2');
  assert.equal(migrated.config.wolfKillScope, 'non_wolf');
  assert.deepEqual(migrated.config.roles, { guard: false, hunter: false, idiot: false });
  assert.deepEqual(migrated.night.wolfVotes, { w1: 'v1' });
  assert.deepEqual(migrated.night.seerResult, { night: 2, playerId: 'w1', team: 'wolves' });
  assert.equal(migrated.night.guardDecided, true);
  assert.equal(migrated.night.guardTargetId, null);
  assert.equal(migrated.players.v1?.exitReason, 'night_kill');
  assert.equal(migrated.players.v1?.idiotRevealed, false);
  assert.equal(migrated.pendingShoot, null);
});
