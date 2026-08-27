/**
 * 奶酪大盗 桌面模拟模式（cheese_thief_sim_v1）单测：
 * 苏醒时辰/角色牌私密分配、工具操作、无胜负判定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { cheeseThiefSimModule, CHEESE_THIEF_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createCheeseThiefSimState,
  reduceCheeseThiefSim,
} from '../server/sim/rules.ts';
import {
  buildCheeseThiefSimPlayerView,
  buildCheeseThiefSimPublicView,
} from '../server/sim/views.ts';
import type { CheeseThiefSimState } from '../server/sim/types.ts';

const NOW = 1_700_000_000_000;
const seeded = (seed = 'cheese-thief-sim') => createSeededRandom(seed);

function makeState(seed = 'cheese-thief-sim', players = ['a', 'b', 'c', 'd']): CheeseThiefSimState {
  return createCheeseThiefSimState(players, { rulesetId: 'cheese_thief_sim_v1', roleCards: true }, seeded(seed));
}

function accepted(state: CheeseThiefSimState, action: unknown): CheeseThiefSimState {
  const reduced = reduceCheeseThiefSim(state, action, { now: NOW, random: seeded() });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: CheeseThiefSimState }).nextState;
}

test('模拟模式 苏醒时辰每人 1–6 私密，角色牌可分配', () => {
  const state = makeState('wake');
  for (const pid of state.players) {
    const hour = state.wakeHours[pid]!;
    assert.ok(hour >= 1 && hour <= 6, `苏醒时辰 ${hour} 越界`);
  }
  assert.equal(Object.keys(state.roleCards).length, 4, '角色牌开启时每人一张');
  assert.equal(new Set(Object.values(state.roleCards)).size >= 1, true);
});

test('模拟模式 苏醒时辰与角色牌私密：他人视图不可见', () => {
  const state = makeState('privacy');
  const viewA = buildCheeseThiefSimPlayerView(state, 'a');
  const viewB = buildCheeseThiefSimPlayerView(state, 'b');
  const pub = buildCheeseThiefSimPublicView(state);

  assert.equal(viewA.me!.wakeHour, state.wakeHours['a']);
  assert.equal(viewA.me!.roleCard, state.roleCards['a']);
  // 他人视图的 me 只含自己的私密值（值可能巧合相同，但结构上不含别人的表）
  assert.equal(viewB.me!.wakeHour, state.wakeHours['b']);
  assert.equal(viewB.me!.roleCard, state.roleCards['b']);
  assert.equal('wakeHours' in pub, false, '公开视图不得含时辰表');
  assert.equal('roleCards' in pub, false, '公开视图不得含角色牌表');
  assert.equal(JSON.stringify(pub).includes('"wakeHours"'), false, '公开视图不得泄漏时辰字段');
  assert.equal(JSON.stringify(pub).includes('"roleCards":{'), false, '公开视图不得泄漏角色牌表结构');
});

test('模拟模式 重掷时辰/重发角色牌/收起角色牌', () => {
  let state = makeState('ops');
  state = accepted(state, { type: 'sim:assign_wake', playerId: 'a' });
  assert.ok(state.wakeHours['a']! >= 1 && state.wakeHours['a']! <= 6);
  state = accepted(state, { type: 'sim:assign_roles', playerId: 'a' });
  assert.equal(Object.keys(state.roleCards).length, 4);
  state = accepted(state, { type: 'sim:clear_roles', playerId: 'a' });
  assert.deepEqual(state.roleCards, {});
});

test('模拟模式 骰子/计时器/按铃 + 玩家退出', () => {
  let state = makeState('props');
  state = accepted(state, { type: 'sim:roll_dice', playerId: 'a' });
  assert.equal(state.props.dice!.values.length, 2, '默认两骰');
  state = accepted(state, { type: 'sim:ring_bell', playerId: 'b' });
  assert.equal(state.props.bell!.rungBy, 'b');
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'set', durationSeconds: 1 });
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'start' });
  state = accepted(state, { type: 'sim:tick_timer' });
  assert.equal(state.props.timer!.isExploded, true);

  state = accepted(state, { type: 'player_forfeited', playerIds: ['d'] });
  assert.deepEqual(state.players, ['a', 'b', 'c']);
  assert.equal(state.wakeHours['d'], undefined);
  assert.equal(state.roleCards['d'], undefined);
});

test('模拟模式 模块级：无 resultCandidate', () => {
  assert.equal(CHEESE_THIEF_SIM_IDENTITY.rulesetId, 'cheese_thief_sim_v1');
  const ctx = { now: NOW, random: seeded() } as never;
  const state = makeState('module');
  const reduced = cheeseThiefSimModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(reduced.ok, true);
  if (reduced.ok) assert.equal(reduced.resultCandidate, null);
});
