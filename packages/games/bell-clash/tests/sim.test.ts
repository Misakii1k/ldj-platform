/**
 * 铃铛对决（Ding）桌面模拟模式（bell_clash_sim_v1）单测：
 * 发牌确定性、私密手牌不外泄、工具操作合法、无胜负判定（resultCandidate 恒 null）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { bellClashSimModule, BELL_CLASH_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createBellClashSimState,
  reduceBellClashSim,
} from '../server/sim/rules.ts';
import {
  buildBellClashSimPlayerView,
  buildBellClashSimPublicView,
} from '../server/sim/views.ts';
import type { BellClashSimState } from '../server/sim/types.ts';

const NOW = 1_700_000_000_000;

function seeded(seed = 'bell-clash-sim') {
  return createSeededRandom(seed);
}

function makeState(seed = 'bell-clash-sim', players = ['a', 'b', 'c']): BellClashSimState {
  return createBellClashSimState(players, { rulesetId: 'bell_clash_sim_v1' }, seeded(seed));
}

function accepted(state: BellClashSimState, action: unknown): BellClashSimState {
  const reduced = reduceBellClashSim(state, action, { now: NOW, random: seeded() });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: BellClashSimState }).nextState;
}

test('模拟模式 初始发牌确定性：同种子两次状态一致，每人默认 8 张', () => {
  const s1 = makeState('fixed');
  const s2 = makeState('fixed');
  assert.deepEqual(s1, s2);
  for (const pid of ['a', 'b', 'c']) {
    assert.equal(s1.hands[pid]!.length, 8);
  }
  assert.equal(s1.drawPile.length, 96 - 3 * 8 - 1); // 96 张 - 发牌 - 起始展示牌
  assert.ok(s1.discardTop);
  assert.equal(s1.discardTop!.kind, 'number', '起始展示牌必须是数字卡');
});

test('模拟模式 私密手牌不外泄：他人视图只见数量，公开视图无任何手牌内容', () => {
  const state = makeState();
  const viewA = buildBellClashSimPlayerView(state, 'a');
  const viewB = buildBellClashSimPlayerView(state, 'b');
  const pub = buildBellClashSimPublicView(state);

  assert.equal(viewA.me!.playerId, 'a');
  assert.equal(viewA.me!.hand.length, 8);
  assert.equal(viewB.me!.hand.length, 8);
  // B 的视图绝不能包含 A 的手牌内容
  assert.deepEqual(viewB.me!.hand, state.hands['b']);
  // 公开视图只有手牌数量，没有具体牌
  assert.equal(pub.handCounts['a'], 8);
  assert.equal('hand' in pub, false);
  assert.equal(JSON.stringify(pub).includes(JSON.stringify(state.hands['a']![0]!)), false, '公开视图不得泄漏手牌');
});

test('模拟模式 工具操作合法：摸牌/发牌/翻牌/桌面出牌/按铃/骰子/计时器', () => {
  let state = makeState();
  const beforeDraw = state.drawPile.length;

  // 摸牌（私密）
  state = accepted(state, { type: 'sim:draw', playerId: 'a' });
  assert.equal(state.hands['a']!.length, 9);
  assert.equal(state.drawPile.length, beforeDraw - 1);

  // 全桌各发 1 张
  state = accepted(state, { type: 'sim:deal_all', playerId: 'b' });
  assert.equal(state.hands['b']!.length, 9);
  assert.equal(state.hands['c']!.length, 9);

  // 桌面出牌
  state = accepted(state, { type: 'sim:play_table', playerId: 'a', cardIndex: 0 });
  assert.equal(state.hands['a']!.length, 9);
  assert.equal(state.tableCards.length, 1);
  assert.equal(state.tableCards[0]!.playedBy, 'a');

  // 翻顶牌
  state = accepted(state, { type: 'sim:flip_top', playerId: 'a' });
  assert.ok(state.discardTop);

  // 按铃：首响记录
  state = accepted(state, { type: 'sim:ring_bell', playerId: 'b' });
  assert.equal(state.props.bell!.rungBy, 'b');
  assert.equal(state.props.bell!.ringCount, 1);
  state = accepted(state, { type: 'sim:ring_bell', playerId: 'c' });
  assert.equal(state.props.bell!.rungBy, 'b', '首响者不变');
  assert.equal(state.props.bell!.ringCount, 2);

  // 掷骰
  state = accepted(state, { type: 'sim:roll_dice', playerId: 'a' });
  assert.equal(state.props.dice!.values.length, 1);
  assert.ok(state.props.dice!.values[0]! >= 1 && state.props.dice!.values[0]! <= 6);

  // 计时器：启动 → 滴答到爆炸
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'set', durationSeconds: 2 });
  state = accepted(state, { type: 'sim:operate_timer', playerId: 'a', op: 'start' });
  state = accepted(state, { type: 'sim:tick_timer' });
  assert.equal(state.props.timer!.remainingSeconds, 1);
  state = accepted(state, { type: 'sim:tick_timer' });
  assert.equal(state.props.timer!.isExploded, true);

  // 非法操作被拒
  const bad = reduceBellClashSim(state, { type: 'sim:play_table', playerId: 'a', cardIndex: 999 }, { now: NOW, random: seeded() });
  assert.equal(bad.ok, false);
  const outsider = reduceBellClashSim(state, { type: 'sim:draw', playerId: 'ghost' }, { now: NOW, random: seeded() });
  assert.equal(outsider.ok, false);
});

test('模拟模式 玩家退出仅记日志，牌堆与道具保留', () => {
  let state = makeState();
  state = accepted(state, { type: 'player_forfeited', playerIds: ['c'] });
  assert.deepEqual(state.players, ['a', 'b']);
  assert.equal(state.hands['c'], undefined);
  assert.ok(state.activityLogs.some((l) => l.text.includes('c')));
  assert.equal(state.props.bell!.ringCount, 0, '道具保留');
});

test('模拟模式 重发牌：清空桌牌与手牌，按当前人数重发', () => {
  let state = makeState();
  state = accepted(state, { type: 'sim:play_table', playerId: 'a', cardIndex: 0 });
  assert.equal(state.tableCards.length, 1);
  state = accepted(state, { type: 'sim:redeal' });
  assert.equal(state.tableCards.length, 0);
  for (const pid of state.players) {
    assert.equal(state.hands[pid]!.length, 8);
  }
});

test('模拟模式 模块级：identity 正确、无 resultCandidate（不判胜负）', () => {
  assert.deepEqual(BELL_CLASH_SIM_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'bell_clash_sim_v1',
    viewVersion: 1,
  });
  assert.equal(bellClashSimModule.registeredRulesets[0], 'bell_clash_sim_v1');
  assert.equal(bellClashSimModule.defaultRulesetId, 'bell_clash_sim_v1');
  assert.equal(bellClashSimModule.manifest.id, 'bell-clash');

  const ctx = { now: NOW, random: seeded() } as never;
  const state = makeState();
  const reduced = bellClashSimModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(reduced.ok, true);
  if (reduced.ok) {
    assert.equal(reduced.resultCandidate, null, '模拟模式不得产出胜负结果');
  }
});
