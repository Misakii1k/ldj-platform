import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, type Actor, type GameContext } from '@ldj/shared';
import { werewolfModeratorModule } from '../../server/moderator/module.ts';
import type { WerewolfModeratorConfig } from '../../server/moderator/types.ts';

const makeCtx = (seed = 'werewolf-mod-test-seed'): GameContext => ({
  now: 1700000000000,
  random: createSeededRandom(seed),
});

const modActor = (playerId = 'host_mod'): Actor => ({
  kind: 'player',
  playerId,
});

const playerActor = (playerId: string): Actor => ({
  kind: 'player',
  playerId,
});

test('werewolf_moderator_v1 基础契约与模块身份', () => {
  assert.equal(werewolfModeratorModule.identity.engineContractVersion, 2);
  assert.equal(werewolfModeratorModule.identity.rulesetId, 'werewolf_moderator_v1');
  assert.equal(werewolfModeratorModule.identity.viewVersion, 1);
  assert.deepEqual(werewolfModeratorModule.registeredRulesets, ['werewolf_moderator_v1']);
  assert.equal(werewolfModeratorModule.defaultRulesetId, 'werewolf_moderator_v1');
});

test('发牌测试：5至12名参与抽卡玩家正确分配角色且房主作为主持人不分角色', () => {
  const ctx = makeCtx();

  // 1. 5人纯抽卡测试（1 狼 + 2 神 + 2 民）
  const p5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const state5 = werewolfModeratorModule.createInitialState(
    ctx,
    p5,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'custom_host' }),
  );
  assert.equal(state5.moderatorPlayerId, 'custom_host');
  assert.deepEqual(state5.playerOrder, p5);
  assert.equal(Object.keys(state5.assignedRoles).length, 5);
  const roles5 = Object.values(state5.assignedRoles);
  assert.equal(roles5.filter((r) => r === 'wolf').length, 1);
  assert.equal(roles5.filter((r) => r === 'seer').length, 1);
  assert.equal(roles5.filter((r) => r === 'witch').length, 1);
  assert.equal(roles5.filter((r) => r === 'villager').length, 2);
  werewolfModeratorModule.assertInvariants(state5);

  // 2. 6人房间（1 主持人 + 5 抽卡玩家）
  const p6WithHost = ['host_mod', 'p1', 'p2', 'p3', 'p4', 'p5'];
  const state6 = werewolfModeratorModule.createInitialState(
    ctx,
    p6WithHost,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'host_mod' }),
  );
  assert.equal(state6.moderatorPlayerId, 'host_mod');
  assert.equal(state6.playerOrder.includes('host_mod'), false);
  assert.equal(state6.playerOrder.length, 5);
  assert.equal(state6.assignedRoles['host_mod'], undefined);
  werewolfModeratorModule.assertInvariants(state6);

  // 3. 13人房间（1 主持人 + 12 抽卡玩家，开启守卫与猎人）
  const p12 = Array.from({ length: 12 }, (_, i) => `player_${i + 1}`);
  const all13 = ['host_mod', ...p12];
  const config12: WerewolfModeratorConfig = {
    moderatorPlayerId: 'host_mod',
    guard: true,
    hunter: true,
  };
  const state12 = werewolfModeratorModule.createInitialState(
    ctx,
    all13,
    werewolfModeratorModule.parseConfig(config12),
  );
  assert.equal(state12.playerOrder.length, 12);
  assert.equal(state12.playerOrder.includes('host_mod'), false);
  const roles12 = Object.values(state12.assignedRoles);
  assert.equal(roles12.filter((r) => r === 'wolf').length, 4);
  assert.equal(roles12.filter((r) => r === 'seer').length, 1);
  assert.equal(roles12.filter((r) => r === 'witch').length, 1);
  assert.equal(roles12.filter((r) => r === 'guard').length, 1);
  assert.equal(roles12.filter((r) => r === 'hunter').length, 1);
  assert.equal(roles12.filter((r) => r === 'villager').length, 4);
  werewolfModeratorModule.assertInvariants(state12);
});

test('安全投影：玩家视角严格保密他人身份，主持人视角掌控全场', () => {
  const ctx = makeCtx();
  const players = ['mod', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const state = werewolfModeratorModule.createInitialState(
    ctx,
    players,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'mod' }),
  );

  // 1. 主持人视角 (mod)
  const modView = werewolfModeratorModule.getPlayerView(state, 'mod');
  assert.equal(modView.isModerator, true);
  assert.equal(modView.moderatorPlayerId, 'mod');
  assert.equal(modView.myRole, null);
  assert.ok(modView.statistics);
  assert.equal(modView.statistics.totalPlayers, 6);
  assert.equal(modView.statistics.totalAlive, 6);
  assert.equal(modView.statistics.totalEliminated, 0);
  for (const p of modView.players) {
    assert.ok(p.role, `主持人应能看到玩家 ${p.playerId} 的角色`);
    assert.ok(p.roleInfo, `主持人应能看到玩家 ${p.playerId} 的角色详情`);
  }

  // 2. 普通玩家视角 (p1)
  const p1View = werewolfModeratorModule.getPlayerView(state, 'p1');
  assert.equal(p1View.isModerator, false);
  assert.ok(p1View.myRole, '普通玩家能看到自己的角色牌');
  assert.equal(p1View.myRole.role, state.assignedRoles['p1']);
  assert.equal(p1View.isMeEliminated, false);

  // 严禁向普通玩家泄露任何他人的角色！
  for (const p of p1View.players) {
    assert.equal(p.role, undefined, `普通玩家视角不得泄露他人角色（玩家 ${p.playerId}）`);
    assert.equal(p.roleInfo, undefined, `普通玩家视角不得泄露他人角色详情（玩家 ${p.playerId}）`);
  }

  // 3. 观战视角
  const spectatorView = werewolfModeratorModule.getSpectatorView(state);
  assert.equal(spectatorView.isModerator, false);
  assert.equal(spectatorView.myRole, null);
  for (const p of spectatorView.players) {
    assert.equal(p.role, undefined, `观战者不得在未终局前看到他人角色`);
  }
});

test('出局控制与撤销操作：权限校验与状态同步', () => {
  const ctx = makeCtx();
  const players = ['mod', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  let state = werewolfModeratorModule.createInitialState(
    ctx,
    players,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'mod' }),
  );

  // 非法权限：普通玩家尝试出局他人
  const unauthorized = werewolfModeratorModule.reduce(
    ctx,
    state,
    playerActor('p1'),
    { type: 'eliminate_player', targetPlayerId: 'p2' },
  );
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) {
    assert.equal(unauthorized.code, 'NOT_AUTHORIZED');
  }

  // 主持人标记 p2 出局
  const elimRes = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'eliminate_player', targetPlayerId: 'p2' },
  );
  assert.equal(elimRes.ok, true);
  if (elimRes.ok) {
    state = elimRes.nextState;
  }
  assert.deepEqual(state.eliminatedPlayerIds, ['p2']);

  // 视角验证：p2 本人看到自己出局
  const p2View = werewolfModeratorModule.getPlayerView(state, 'p2');
  assert.equal(p2View.isMeEliminated, true);

  // 视角验证：p1 看到 p2 出局，但依然看不到 p2 的角色
  const p1View = werewolfModeratorModule.getPlayerView(state, 'p1');
  const p2InView = p1View.players.find((p) => p.playerId === 'p2')!;
  assert.equal(p2InView.isEliminated, true);
  assert.equal(p2InView.role, undefined);

  // 视角验证：主持人看到 p2 出局且能看到角色
  const modView = werewolfModeratorModule.getPlayerView(state, 'mod');
  const modP2 = modView.players.find((p) => p.playerId === 'p2')!;
  assert.equal(modP2.isEliminated, true);
  assert.ok(modP2.role);
  assert.equal(modView.statistics?.totalEliminated, 1);
  assert.equal(modView.statistics?.totalAlive, 5);

  // 重复标记出局应当拒绝
  const duplicateElim = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'eliminate_player', targetPlayerId: 'p2' },
  );
  assert.equal(duplicateElim.ok, false);

  // 主持人撤销 p2 出局
  const reviveRes = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'revive_player', targetPlayerId: 'p2' },
  );
  assert.equal(reviveRes.ok, true);
  if (reviveRes.ok) {
    state = reviveRes.nextState;
  }
  assert.deepEqual(state.eliminatedPlayerIds, []);
  assert.equal(werewolfModeratorModule.getPlayerView(state, 'p2').isMeEliminated, false);
});

test('终局结算与亮底牌：终局后公开全场身份', () => {
  const ctx = makeCtx();
  const players = ['mod', 'p1', 'p2', 'p3', 'p4', 'p5'];
  let state = werewolfModeratorModule.createInitialState(
    ctx,
    players,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'mod' }),
  );

  // 找出唯一的狼人并将其出局
  const wolfId = Object.entries(state.assignedRoles).find(([, r]) => r === 'wolf')![0];
  const elimWolf = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'eliminate_player', targetPlayerId: wolfId },
  );
  assert.equal(elimWolf.ok, true);
  if (elimWolf.ok) state = elimWolf.nextState;

  // 主持人端应当显示好人获胜的辅助建议
  const modViewBeforeEnd = werewolfModeratorModule.getPlayerView(state, 'mod');
  assert.equal(modViewBeforeEnd.suggestedOutcome, 'village_win');

  // 主持人结束对局
  const endRes = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'end_game' },
  );
  assert.equal(endRes.ok, true);
  if (endRes.ok) {
    state = endRes.nextState;
    assert.equal(endRes.resultCandidate?.winner, 'good');
  }
  assert.equal(state.gameEnded, true);
  assert.equal(state.winner, 'good');

  // 终局后：普通玩家端全场身份亮牌！
  const p1ViewEnded = werewolfModeratorModule.getPlayerView(state, 'p1');
  assert.equal(p1ViewEnded.gameEnded, true);
  assert.equal(p1ViewEnded.winner, 'good');
  for (const p of p1ViewEnded.players) {
    assert.ok(p.role, `终局后玩家 ${p.playerId} 的角色应当完全公开`);
    assert.ok(p.roleInfo, `终局后玩家 ${p.playerId} 的角色详情应当完全公开`);
  }

  // 终局后不可再标记出局
  const afterEndElim = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'eliminate_player', targetPlayerId: 'p1' },
  );
  assert.equal(afterEndElim.ok, false);
});

test('parseAction 严格校验与异常动作拒绝', () => {
  // 合法动作解析
  const beginAction = werewolfModeratorModule.parseAction({ type: 'begin' });
  assert.deepEqual(beginAction, { type: 'begin' });

  const elimAction = werewolfModeratorModule.parseAction({
    type: 'eliminate_player',
    targetPlayerId: 'p1',
  });
  assert.deepEqual(elimAction, { type: 'eliminate_player', targetPlayerId: 'p1' });

  // 缺失 targetPlayerId 抛出异常
  assert.throws(() => {
    werewolfModeratorModule.parseAction({ type: 'eliminate_player' });
  });

  // 未知动作类型抛出异常
  assert.throws(() => {
    werewolfModeratorModule.parseAction({ type: 'unknown_magic' });
  });
});

test('未分胜负提前结束对局时 winner 为 null', () => {
  const ctx = makeCtx();
  const players = ['mod', 'p1', 'p2', 'p3', 'p4', 'p5'];
  const state = werewolfModeratorModule.createInitialState(
    ctx,
    players,
    werewolfModeratorModule.parseConfig({ moderatorPlayerId: 'mod' }),
  );

  // 未标记任何人出局，直接由主持人提前结束
  const endRes = werewolfModeratorModule.reduce(
    ctx,
    state,
    modActor('mod'),
    { type: 'end_game' },
  );
  assert.equal(endRes.ok, true);
  if (endRes.ok) {
    assert.equal(endRes.nextState.gameEnded, true);
    assert.equal(endRes.nextState.winner, null);
    assert.equal(endRes.resultCandidate?.winner, null);
  }
});

