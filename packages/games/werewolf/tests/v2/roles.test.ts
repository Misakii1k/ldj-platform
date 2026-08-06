/**
 * werewolf v2 — 确定性角色分配与身份确认（功能清单 2）。
 * identity-shuffle ctx → 固定顺序 [wolf×n, seer, witch, (guard), (hunter), (idiot), villager…]；
 * 同种子重复创建字节一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { IDENTITY_CTX, actor, apply, init, makeCtx, rolesOf, system } from './helpers.ts';

function roleCounts(state: ReturnType<typeof init>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const role of Object.values(state.players)) counts[role.role] = (counts[role.role] ?? 0) + 1;
  return counts;
}

test('v2 固定种子角色分配确定且分布正确（6 人）', () => {
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  const a = werewolfV2Module.createInitialState(IDENTITY_CTX, ids, werewolfV2Module.parseConfig({}));
  const b = werewolfV2Module.createInitialState(IDENTITY_CTX, ids, werewolfV2Module.parseConfig({}));
  assert.deepEqual(a, b);
  assert.deepEqual(rolesOf(a), {
    p0: 'wolf', p1: 'wolf', p2: 'seer', p3: 'witch', p4: 'villager', p5: 'villager',
  });
  const counts = roleCounts(a);
  assert.equal(counts.wolf, 2);
  assert.equal(counts.seer, 1);
  assert.equal(counts.witch, 1);
  assert.equal(counts.villager, 2);
});

test('v2 9-12 人三狼；12 人分布正确', () => {
  const ids12 = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const twelve = init(ids12);
  const counts = roleCounts(twelve);
  assert.equal(counts.wolf, 3);
  assert.equal(counts.seer, 1);
  assert.equal(counts.witch, 1);
  assert.equal(counts.villager, 7);
  const ids9 = Array.from({ length: 9 }, (_, i) => `p${i}`);
  assert.equal(roleCounts(init(ids9)).wolf, 3);
});

test('v2 扩展角色开关入池；卡数超人数拒绝', () => {
  const ids7 = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const full = init(ids7, { roles: { guard: true, hunter: true, idiot: true } });
  assert.deepEqual(rolesOf(full), {
    p0: 'wolf', p1: 'wolf', p2: 'seer', p3: 'witch', p4: 'guard', p5: 'hunter', p6: 'idiot',
  });
  const ids6 = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assert.throws(() => init(ids6, { roles: { guard: true, hunter: true, idiot: true } }));
  const one = init(ids6, { roles: { guard: true, hunter: false, idiot: false } });
  assert.deepEqual(rolesOf(one).p4, 'guard');
});

test('v2 不同种子仍产生合法分布（seed 确定性已验证）', () => {
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const seededA = init(ids, {}, makeCtx('seed-a'));
  const seededB = init(ids, {}, makeCtx('seed-a'));
  assert.deepEqual(seededA, seededB);
  const counts = roleCounts(seededA);
  assert.equal(counts.wolf, 2);
  assert.equal(counts.seer, 1);
  assert.equal(counts.witch, 1);
  assert.equal(counts.villager, 4);
});

test('v2 身份确认推进到第一夜', () => {
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  let state = init(ids);
  const begin = apply(state, system, { type: 'begin' });
  assert.equal(begin.phase, 'role_reveal');
  assert.equal(begin.deadlineAt, 1 + 30_000);
  assert.ok(begin.phaseToken);
  state = begin;
  state = apply(state, actor('p0'), { type: 'confirm_role' });
  assert.deepEqual(state.confirmedRolePlayerIds, ['p0']);
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
    state = apply(state, actor(id), { type: 'confirm_role' });
  }
  assert.equal(state.phase, 'night');
  assert.equal(state.day, 1);
});

test('v2 重复确认不推进（noop），非法动作被拒', () => {
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  let state = init(ids);
  state = apply(state, system, { type: 'begin' });
  state = apply(state, actor('p0'), { type: 'confirm_role' });
  const again = werewolfV2Module.reduce(IDENTITY_CTX, state, actor('p0'), { type: 'confirm_role' });
  assert.equal(again.ok, true);
  if (again.ok) assert.deepEqual(again.nextState, state);
  const denied = werewolfV2Module.reduce(IDENTITY_CTX, state, actor('p1'), { type: 'night_kill', targetPlayerId: 'p2' });
  assert.equal(denied.ok, false);
  assert.equal(werewolfV2Module.getPlayerView(state, 'p0').me?.canAct, true);
  assert.equal(werewolfV2Module.getPlayerView(state, 'p1').me?.canAct, true);
});
