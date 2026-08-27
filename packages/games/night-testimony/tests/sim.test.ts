/**
 * 囚徒之夜 桌面模拟模式（night_testimony_sim_v1）单测：
 * 罪行/狱警私密分配、问题卡抽取、工具操作、无胜负判定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { nightTestimonySimModule, NIGHT_TESTIMONY_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createNightTestimonySimState,
  reduceNightTestimonySim,
} from '../server/sim/rules.ts';
import {
  buildNightTestimonySimPlayerView,
  buildNightTestimonySimPublicView,
} from '../server/sim/views.ts';
import type { NightTestimonySimState } from '../server/sim/types.ts';

const NOW = 1_700_000_000_000;
const seeded = (seed = 'night-testimony-sim') => createSeededRandom(seed);

function makeState(seed = 'night-testimony-sim', players = ['a', 'b', 'c', 'd']): NightTestimonySimState {
  return createNightTestimonySimState(players, { rulesetId: 'night_testimony_sim_v1' }, seeded(seed));
}

function accepted(state: NightTestimonySimState, action: unknown): NightTestimonySimState {
  const reduced = reduceNightTestimonySim(state, action, { now: NOW, random: seeded() });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: NightTestimonySimState }).nextState;
}

test('模拟模式 罪行/狱警分配：一名狱警无罪行，囚犯罪行互异，干扰卡公开', () => {
  const state = makeState('crimes');
  const inmates = state.players.filter((p) => p !== state.wardenId);
  assert.equal(inmates.length, 3);
  const crimeSet = new Set(inmates.map((p) => state.crimes[p]));
  assert.equal(crimeSet.size, 3, '囚犯罪行互异');
  assert.equal(state.crimes[state.wardenId], undefined, '狱警无罪行');
  assert.ok(state.extraCrime);
});

test('模拟模式 狱警身份与罪行私密：他人视图看不到我的罪行，公开视图无身份', () => {
  const state = makeState('privacy');
  const viewA = buildNightTestimonySimPlayerView(state, 'a');
  const viewB = buildNightTestimonySimPlayerView(state, 'b');
  const pub = buildNightTestimonySimPublicView(state);

  const aIsWarden = state.wardenId === 'a';
  assert.equal(viewA.me!.isWarden, aIsWarden);
  assert.equal(viewA.me!.crime, state.crimes['a'] ?? null);
  assert.notEqual(viewB.me!.crime, state.crimes['a'], 'B 不得看到 A 的罪行');
  assert.equal('wardenId' in pub, false, '公开视图不得含狱警');
  assert.equal('crimes' in pub, false, '公开视图不得含罪行表');
  assert.equal(JSON.stringify(pub).includes(state.crimes['a']!), false, '公开视图不得泄漏罪行');
  assert.equal(pub.extraCrime, state.extraCrime, '干扰卡公开');
});

test('模拟模式 问题卡抽取与重分配', () => {
  let state = makeState('questions');
  state = accepted(state, { type: 'sim:draw_question', playerId: 'a' });
  assert.ok(state.questionArea);
  assert.equal(state.usedQuestionIds.length, 1);

  state = accepted(state, { type: 'sim:assign_crimes', playerId: 'a' });
  assert.ok(state.wardenId);
  assert.ok(Object.values(state.crimes).length >= 2);
});

test('模拟模式 道具操作与玩家退出', () => {
  let state = makeState('props');
  state = accepted(state, { type: 'sim:ring_bell', playerId: 'b' });
  assert.equal(state.props.bell!.rungBy, 'b');
  state = accepted(state, { type: 'sim:roll_dice', playerId: 'a' });
  assert.equal(state.props.dice!.values.length, 1);
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'set', durationSeconds: 2 });
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'start' });
  state = accepted(state, { type: 'sim:tick_timer' });
  state = accepted(state, { type: 'sim:tick_timer' });
  assert.equal(state.props.timer!.isExploded, true);

  state = accepted(state, { type: 'player_forfeited', playerIds: ['d'] });
  assert.deepEqual(state.players, ['a', 'b', 'c']);
  assert.equal(state.crimes['d'], undefined);
});

test('模拟模式 模块级：无 resultCandidate', () => {
  assert.equal(NIGHT_TESTIMONY_SIM_IDENTITY.rulesetId, 'night_testimony_sim_v1');
  const ctx = { now: NOW, random: seeded() } as never;
  const state = makeState('module');
  const reduced = nightTestimonySimModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(reduced.ok, true);
  if (reduced.ok) assert.equal(reduced.resultCandidate, null);
});
