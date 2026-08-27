/**
 * 伪人测试 桌面模拟模式（echo_judge_sim_v1）单测：
 * 词条私密分配、题卡抽取、工具操作、无胜负判定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { echoJudgeSimModule, ECHO_JUDGE_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createEchoJudgeSimState,
  reduceEchoJudgeSim,
} from '../server/sim/rules.ts';
import {
  buildEchoJudgeSimPlayerView,
  buildEchoJudgeSimPublicView,
} from '../server/sim/views.ts';
import type { EchoJudgeSimState } from '../server/sim/types.ts';

const NOW = 1_700_000_000_000;
const seeded = (seed = 'echo-judge-sim') => createSeededRandom(seed);

function makeState(seed = 'echo-judge-sim', players = ['a', 'b', 'c']): EchoJudgeSimState {
  return createEchoJudgeSimState(players, { rulesetId: 'echo_judge_sim_v1' }, seeded(seed));
}

function accepted(state: EchoJudgeSimState, action: unknown): EchoJudgeSimState {
  const reduced = reduceEchoJudgeSim(state, action, { now: NOW, random: seeded() });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: EchoJudgeSimState }).nextState;
}

test('模拟模式 词条私密分配：每人 1 个互异词，他人视图不可见', () => {
  const state = makeState('words');
  const words = new Set(Object.values(state.triggerWords));
  assert.equal(words.size, 3, '三人词条互异');

  const viewA = buildEchoJudgeSimPlayerView(state, 'a');
  const viewB = buildEchoJudgeSimPlayerView(state, 'b');
  const pub = buildEchoJudgeSimPublicView(state);

  assert.equal(viewA.me!.triggerWord, state.triggerWords['a']);
  assert.notEqual(viewB.me!.triggerWord, state.triggerWords['a']);
  assert.equal('triggerWord' in pub, false, '公开视图不得含词条');
  assert.equal(JSON.stringify(pub).includes(state.triggerWords['a']!), false, '公开视图不得泄漏词条');
});

test('模拟模式 题卡抽取与收起：抽后入已用池，重抽避开', () => {
  let state = makeState('topics');
  state = accepted(state, { type: 'sim:draw_topic', playerId: 'a' });
  assert.ok(state.topicArea);
  assert.equal(state.usedTopicIds.length, 1);
  const firstId = state.topicArea!.card.id;

  state = accepted(state, { type: 'sim:clear_topic', playerId: 'a' });
  assert.equal(state.topicArea, null);

  // 抽 40 张应能把题库抽完并拒绝继续
  for (let i = 0; i < 36; i += 1) {
    const r = reduceEchoJudgeSim(state, { type: 'sim:draw_topic', playerId: 'a' }, { now: NOW, random: seeded() });
    if (!r.ok) break;
    state = r.nextState;
  }
  const exhausted = reduceEchoJudgeSim(state, { type: 'sim:draw_topic', playerId: 'a' }, { now: NOW, random: seeded() });
  assert.equal(exhausted.ok, false, '题卡抽完应拒绝');
  assert.ok(state.usedTopicIds.includes(firstId));
});

test('模拟模式 词条重分配 + 道具操作合法', () => {
  let state = makeState('props');
  state = accepted(state, { type: 'sim:assign_words', playerId: 'a' });
  assert.ok(state.triggerWords['a']);
  state = accepted(state, { type: 'sim:ring_bell', playerId: 'b' });
  assert.equal(state.props.bell!.rungBy, 'b');
  state = accepted(state, { type: 'sim:roll_dice', playerId: 'a' });
  assert.equal(state.props.dice!.values.length, 1);
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'set', durationSeconds: 3 });
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'start' });
  for (let i = 0; i < 3; i += 1) state = accepted(state, { type: 'sim:tick_timer' });
  assert.equal(state.props.timer!.isExploded, true);
});

test('模拟模式 玩家退出清理词条，模块无 resultCandidate', () => {
  let state = makeState('forfeit');
  state = accepted(state, { type: 'player_forfeited', playerIds: ['c'] });
  assert.deepEqual(state.players, ['a', 'b']);
  assert.equal(state.triggerWords['c'], undefined);

  const ctx = { now: NOW, random: seeded() } as never;
  const reduced = echoJudgeSimModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(reduced.ok, true);
  if (reduced.ok) assert.equal(reduced.resultCandidate, null);
  assert.equal(ECHO_JUDGE_SIM_IDENTITY.rulesetId, 'echo_judge_sim_v1');
});
