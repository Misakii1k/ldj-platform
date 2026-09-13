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

test('v2 不同人数下的阵营分布（6-12人科学梯队分配）', () => {
  // 6人局: 2狼 1预 1女 2民 (经典2-2-2)
  const ids6 = Array.from({ length: 6 }, (_, i) => `p${i}`);
  const six = init(ids6);
  const counts6 = roleCounts(six);
  assert.equal(counts6.wolf, 2);
  assert.equal(counts6.seer, 1);
  assert.equal(counts6.witch, 1);
  assert.equal(counts6.villager, 2);

  // 8人局: 2狼 1预 1女 4民 (双狼局)
  const ids8 = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const eight = init(ids8);
  const counts8 = roleCounts(eight);
  assert.equal(counts8.wolf, 2);
  assert.equal(counts8.villager, 4);

  // 9人局: 3狼 1预 1女 4民 (未开扩展)
  const ids9 = Array.from({ length: 9 }, (_, i) => `p${i}`);
  const nine = init(ids9);
  const counts9 = roleCounts(nine);
  assert.equal(counts9.wolf, 3);
  assert.equal(counts9.seer, 1);
  assert.equal(counts9.witch, 1);
  assert.equal(counts9.villager, 4);

  // 9人局开猎人: 3狼 3神 3民 (黄金3-3-3标准板子)
  const nineHunter = init(ids9, { roles: { guard: false, hunter: true, idiot: false } });
  const counts9H = roleCounts(nineHunter);
  assert.equal(counts9H.wolf, 3);
  assert.equal(counts9H.seer, 1);
  assert.equal(counts9H.witch, 1);
  assert.equal(counts9H.hunter, 1);
  assert.equal(counts9H.villager, 3);

  // 10人局: 3狼 1预 1女 5民
  const ids10 = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const ten = init(ids10);
  assert.equal(roleCounts(ten).wolf, 3);

  // 11人局: 4狼 1预 1女 5民
  const ids11 = Array.from({ length: 11 }, (_, i) => `p${i}`);
  const eleven = init(ids11);
  const counts11 = roleCounts(eleven);
  assert.equal(counts11.wolf, 4);
  assert.equal(counts11.villager, 5);

  // 12人局: 4狼 1预 1女 6民 (未开扩展)
  const ids12 = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const twelve = init(ids12);
  const counts12 = roleCounts(twelve);
  assert.equal(counts12.wolf, 4);
  assert.equal(counts12.seer, 1);
  assert.equal(counts12.witch, 1);
  assert.equal(counts12.villager, 6);

  // 12人局开守卫+猎人: 4狼 4神 4民 (殿堂级4-4-4标准板子)
  const twelveStd = init(ids12, { roles: { guard: true, hunter: true, idiot: false } });
  const counts12Std = roleCounts(twelveStd);
  assert.equal(counts12Std.wolf, 4);
  assert.equal(counts12Std.seer, 1);
  assert.equal(counts12Std.witch, 1);
  assert.equal(counts12Std.guard, 1);
  assert.equal(counts12Std.hunter, 1);
  assert.equal(counts12Std.villager, 4);
});

test('v2 扩展角色开关入池；平民保底 2 人与超载拒绝', () => {
  // 8 人局开守卫+猎人：2狼 + 4神 + 2民 = 8 人（平民保底 2 人刚好满足）
  const ids8 = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const valid8 = init(ids8, { roles: { guard: true, hunter: true, idiot: false } });
  assert.deepEqual(rolesOf(valid8), {
    p0: 'wolf', p1: 'wolf', p2: 'seer', p3: 'witch', p4: 'guard', p5: 'hunter', p6: 'villager', p7: 'villager',
  });

  // 7 人局开 3 扩展神职（2狼+5神=7人，平民0人）需抛出平民保底异常拒绝
  const ids7 = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  assert.throws(() => init(ids7, { roles: { guard: true, hunter: true, idiot: true } }));

  // 6 人局默认 2 狼若开守卫，平民仅剩 1 人，同样拒绝
  const ids6 = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assert.throws(() => init(ids6, { roles: { guard: true, hunter: false, idiot: false } }));

  // 6 人局若微调为 1 狼，则 1狼 + 3神 + 2民 = 6人，合法允许
  const sixAdjusted = init(ids6, { roles: { guard: true, hunter: false, idiot: false }, wolfDelta: -1 });
  assert.deepEqual(rolesOf(sixAdjusted), {
    p0: 'wolf', p1: 'seer', p2: 'witch', p3: 'guard', p4: 'villager', p5: 'villager',
  });
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
