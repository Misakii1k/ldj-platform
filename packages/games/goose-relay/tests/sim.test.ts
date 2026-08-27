/**
 * 以鹅传鹅 桌面模拟模式（goose_relay_sim_v1）单测：
 * 候选鹅卡/头鹅/案情卡分配、案情私密、工具操作、无胜负判定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { gooseRelaySimModule, GOOSE_RELAY_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createGooseRelaySimState,
  reduceGooseRelaySim,
} from '../server/sim/rules.ts';
import {
  buildGooseRelaySimPlayerView,
  buildGooseRelaySimPublicView,
} from '../server/sim/views.ts';
import type { GooseRelaySimState } from '../server/sim/types.ts';

const NOW = 1_700_000_000_000;
const seeded = (seed = 'goose-relay-sim') => createSeededRandom(seed);

function makeState(seed = 'goose-relay-sim', players = ['a', 'b', 'c']): GooseRelaySimState {
  return createGooseRelaySimState(players, { rulesetId: 'goose_relay_sim_v1' }, seeded(seed));
}

function accepted(state: GooseRelaySimState, action: unknown): GooseRelaySimState {
  const reduced = reduceGooseRelaySim(state, action, { now: NOW, random: seeded() });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: GooseRelaySimState }).nextState;
}

test('模拟模式 候选鹅卡 9 张互异、头鹅随机指定、案情在候选中', () => {
  const state = makeState('table');
  assert.equal(state.candidateCards.length, 9);
  assert.equal(new Set(state.candidateCards).size, 9, '候选鹅卡互异');
  assert.ok(state.players.includes(state.headPlayerId));
  assert.ok(state.candidateCards.includes(state.caseCard!.murderer));
  assert.ok(state.candidateCards.includes(state.caseCard!.victim));
  assert.notEqual(state.caseCard!.murderer, state.caseCard!.victim);
});

test('模拟模式 案情卡仅头鹅可见', () => {
  const state = makeState('privacy');
  const headView = buildGooseRelaySimPlayerView(state, state.headPlayerId);
  const other = state.players.find((p) => p !== state.headPlayerId)!;
  const otherView = buildGooseRelaySimPlayerView(state, other);
  const pub = buildGooseRelaySimPublicView(state);

  assert.equal(headView.me!.isHead, true);
  assert.deepEqual(headView.me!.caseCard, state.caseCard);
  assert.equal(otherView.me!.isHead, false);
  assert.equal(otherView.me!.caseCard, null, '他人视图的案情卡必须为 null');
  assert.equal('caseCard' in pub, false, '公开视图不得含案情卡字段');
  assert.equal(JSON.stringify(pub).includes('"murderer"'), false, '公开视图不得泄漏案情结构');
});

test('模拟模式 重布置 + 道具操作 + 玩家退出', () => {
  let state = makeState('ops');
  state = accepted(state, { type: 'sim:redeal', playerId: 'a' });
  assert.equal(state.candidateCards.length, 9);
  assert.ok(state.players.includes(state.headPlayerId));

  state = accepted(state, { type: 'sim:ring_bell', playerId: 'b' });
  assert.equal(state.props.bell!.rungBy, 'b');
  state = accepted(state, { type: 'sim:roll_dice', playerId: 'a' });
  assert.equal(state.props.dice!.values.length, 1);

  const head = state.headPlayerId;
  state = accepted(state, { type: 'player_forfeited', playerIds: [head] });
  assert.equal(state.players.includes(head), false);
  assert.ok(state.players.includes(state.headPlayerId), '头鹅退出后重新指派');
});

test('模拟模式 模块级：无 resultCandidate', () => {
  assert.equal(GOOSE_RELAY_SIM_IDENTITY.rulesetId, 'goose_relay_sim_v1');
  const ctx = { now: NOW, random: seeded() } as never;
  const state = makeState('module');
  const reduced = gooseRelaySimModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(reduced.ok, true);
  if (reduced.ok) assert.equal(reduced.resultCandidate, null);
});
