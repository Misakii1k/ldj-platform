/**
 * 一智千金桌面模拟模式（wits_wagers_sim_v1）单测：
 * 抽题确定性、私密猜测与答案不外泄、越界拒绝、版图由 buildBoard 排出且只有 lower 边缘卡、
 * 无胜负判定（resultCandidate 恒 null）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { witsWagersSimModule, WITS_WAGERS_SIM_IDENTITY } from '../server/sim/module.ts';
import {
  createWitsWagersSimState,
  reduceWitsWagersSim,
} from '../server/sim/rules.ts';
import {
  buildWitsWagersSimPlayerView,
  buildWitsWagersSimPublicView,
  parseWitsWagersSimPlayerView,
  parseWitsWagersSimPublicView,
} from '../server/sim/views.ts';
import type { WitsWagersSimState } from '../server/sim/types.ts';
import { SAMPLE_TEST_QUESTIONS } from '../server/state.ts';

const NOW = 1_700_000_000_000;
const PLAYERS = ['a', 'b', 'c'];

function seeded(seed = 'wits-sim') {
  return createSeededRandom(seed);
}

function makeState(seed = 'wits-sim', players = PLAYERS): WitsWagersSimState {
  return createWitsWagersSimState(players, { rulesetId: 'wits_wagers_sim_v1' }, seeded(seed), SAMPLE_TEST_QUESTIONS);
}

function accepted(state: WitsWagersSimState, action: unknown): WitsWagersSimState {
  const reduced = reduceWitsWagersSim(state, action, { now: NOW, random: seeded(), questionPool: SAMPLE_TEST_QUESTIONS });
  assert.equal(reduced.ok, true, JSON.stringify(reduced));
  return (reduced as { ok: true; nextState: WitsWagersSimState }).nextState;
}

function rejected(state: WitsWagersSimState, action: unknown): void {
  const reduced = reduceWitsWagersSim(state, action, { now: NOW, random: seeded(), questionPool: SAMPLE_TEST_QUESTIONS });
  assert.equal(reduced.ok, false, `应被拒绝：${JSON.stringify(action)}`);
}

/** 三人各交一个猜测并亮牌 */
function revealedState(): WitsWagersSimState {
  let s = makeState();
  s = accepted(s, { type: 'sim:submit_guess', playerId: 'a', value: 100 });
  s = accepted(s, { type: 'sim:submit_guess', playerId: 'b', value: 300 });
  s = accepted(s, { type: 'sim:submit_guess', playerId: 'c', value: 300 });
  return accepted(s, { type: 'sim:reveal_guesses' });
}

test('模拟模式 抽题确定性：同种子两次状态一致，开局已有第一题且每人起始 2 分', () => {
  const s1 = makeState('fixed');
  const s2 = makeState('fixed');
  assert.deepEqual(s1, s2);
  assert.equal(s1.questionHistory.length, 1);
  for (const pid of PLAYERS) {
    assert.equal(s1.money[pid], 2);
    assert.equal(s1.guesses[pid], null);
    assert.deepEqual(s1.chips[pid], [{ chipId: 'A', targetId: null }, { chipId: 'B', targetId: null }]);
  }
  assert.equal(s1.revealed, false);
  assert.deepEqual(s1.board, []);
});

test('模拟模式 私密猜测不外泄：亮牌前公共视图无数值，他人视图只见"谁已交"', () => {
  let s = makeState();
  s = accepted(s, { type: 'sim:submit_guess', playerId: 'a', value: 12345 });

  const pub = buildWitsWagersSimPublicView(s);
  assert.equal(pub.guesses, null);
  assert.deepEqual(pub.submittedIds, ['a']);
  assert.ok(!JSON.stringify(pub).includes('12345'), '公共视图不得含猜测数值');

  const viewB = buildWitsWagersSimPlayerView(s, 'b');
  assert.equal(viewB.guesses, null);
  assert.equal(viewB.me?.myGuess, null);
  assert.ok(!JSON.stringify(viewB).includes('12345'), 'B 的视图不得含 A 的猜测');

  const viewA = buildWitsWagersSimPlayerView(s, 'a');
  assert.equal(viewA.me?.myGuess, 12345);

  const revealed = accepted(s, { type: 'sim:reveal_guesses' });
  assert.deepEqual(buildWitsWagersSimPublicView(revealed).guesses, { a: 12345 });
});

test('模拟模式 标准答案不外泄：翻面前任何视图都没有 answer 字段，翻面后公开，可再盖回', () => {
  const s = makeState();
  const answer = s.questionHistory[0]!.answer;

  for (const view of [buildWitsWagersSimPublicView(s), buildWitsWagersSimPlayerView(s, 'a')]) {
    assert.equal(view.answerRevealed, false);
    assert.ok(view.question);
    assert.equal('answer' in view.question!, false, '翻面前不得有 answer 键');
  }

  const flipped = accepted(s, { type: 'sim:reveal_answer' });
  assert.equal(buildWitsWagersSimPublicView(flipped).question?.answer, answer);

  const back = accepted(flipped, { type: 'sim:reveal_answer' });
  assert.equal(back.answerRevealed, false);
  assert.equal('answer' in buildWitsWagersSimPublicView(back).question!, false);
});

test('模拟模式 亮牌复用 buildBoard：去重升序、赔率查表、最前是 lower、不存在 higher', () => {
  const s = revealedState();
  assert.equal(s.revealed, true);
  // 两个唯一值 → L1/R1 各 3 倍，前面加一张 lower
  assert.deepEqual(s.board.map((t) => t.id), ['lower', 'g:100', 'g:300']);
  assert.deepEqual(s.board.map((t) => t.odds), [6, 3, 3]);
  assert.deepEqual(s.board.map((t) => t.slot), ['LOWER', 'L1', 'R1']);
  assert.deepEqual(s.board[2]!.authors, ['b', 'c']);
  assert.ok(!s.board.some((t) => (t.id as string) === 'higher'));
  assert.deepEqual(buildWitsWagersSimPublicView(s).guesses, { a: 100, b: 300, c: 300 });
});

test('模拟模式 越界拒绝：亮牌后不能改猜测、筹码不能指向版图外、钞票不能为负、猜测越界', () => {
  const fresh = makeState();
  rejected(fresh, { type: 'sim:submit_guess', playerId: 'a', value: 0 });
  rejected(fresh, { type: 'sim:submit_guess', playerId: 'a', value: 1.5 });
  rejected(fresh, { type: 'sim:submit_guess', playerId: 'zz', value: 10 });
  rejected(fresh, { type: 'sim:reveal_guesses' }); // 还没人交
  rejected(fresh, { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: 'g:100' }); // 亮牌前版图为空

  const s = revealedState();
  rejected(s, { type: 'sim:submit_guess', playerId: 'a', value: 500 });
  rejected(s, { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: 'g:999' });
  rejected(s, { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: 'higher' });
  rejected(s, { type: 'sim:adjust_money', playerId: 'a', delta: -3 }); // 只有 2
  rejected(s, { type: 'sim:adjust_money', playerId: 'a', delta: 0 });

  // 合法路径：押 lower、收回、加钱减钱
  let n = accepted(s, { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: 'lower' });
  assert.equal(n.chips['a']![0].targetId, 'lower');
  n = accepted(n, { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: null });
  assert.equal(n.chips['a']![0].targetId, null);
  n = accepted(n, { type: 'sim:adjust_money', playerId: 'a', delta: 5 });
  n = accepted(n, { type: 'sim:adjust_money', playerId: 'a', delta: -7 });
  assert.equal(n.money['a'], 0);
});

test('模拟模式 换题与重来：next_question 抽新题并清空一轮；reset_round 保留题目只清空', () => {
  const s = revealedState();
  const placed = accepted(s, { type: 'sim:place_chip', playerId: 'a', chipId: 'B', targetId: 'g:100' });

  const reset = accepted(placed, { type: 'sim:reset_round' });
  assert.equal(reset.questionHistory.length, 1);
  assert.equal(reset.revealed, false);
  assert.deepEqual(reset.board, []);
  assert.equal(reset.chips['a']![1].targetId, null);
  assert.equal(reset.guesses['a'], null);

  const next = accepted(placed, { type: 'sim:next_question' });
  assert.equal(next.questionHistory.length, 2);
  assert.notEqual(next.questionHistory[1]!.id, next.questionHistory[0]!.id);
  assert.equal(next.revealed, false);
  assert.equal(next.answerRevealed, false);
  assert.equal(next.money['a'], 2, '换题不动钞票');
});

test('模拟模式 道具：计时器只在 running 时滴答，骰子与按铃正常', () => {
  let s = makeState();
  s = accepted(s, { type: 'sim:tick_timer' }); // 没有计时器时幂等
  s = accepted(s, { type: 'sim:operate_timer', playerId: 'a', op: 'set', durationSeconds: 3 });
  s = accepted(s, { type: 'sim:tick_timer' });
  assert.equal(s.props.timer!.remainingSeconds, 3, '未启动不应走秒');
  s = accepted(s, { type: 'sim:operate_timer', playerId: 'a', op: 'start' });
  s = accepted(s, { type: 'sim:tick_timer' });
  s = accepted(s, { type: 'sim:tick_timer' });
  s = accepted(s, { type: 'sim:tick_timer' });
  assert.equal(s.props.timer!.isExploded, true);

  s = accepted(s, { type: 'sim:roll_dice', playerId: 'b' });
  assert.equal(s.props.dice!.values.length, 1);
  assert.ok(s.props.dice!.values[0]! >= 1 && s.props.dice!.values[0]! <= 6);

  s = accepted(s, { type: 'sim:ring_bell', playerId: 'c' });
  assert.equal(s.props.bell!.rungBy, 'c');
});

test('模拟模式 视图解析器：玩家/观战视图都能被严格解析，含 higher 的视图被拒', () => {
  const s = revealedState();
  const pv = buildWitsWagersSimPlayerView(s, 'a');
  const sv = buildWitsWagersSimPublicView(s);
  assert.doesNotThrow(() => parseWitsWagersSimPlayerView(pv));
  assert.doesNotThrow(() => parseWitsWagersSimPublicView(sv));
  assert.equal(parseWitsWagersSimPlayerView(buildWitsWagersSimPlayerView(s, 'nobody')).me, null);

  const poisoned = { ...sv, board: [...sv.board, { id: 'higher', value: null, slot: 'HIGHER', odds: 6, authors: [] }] };
  assert.throws(() => parseWitsWagersSimPublicView(poisoned));
});

test('模拟模式 模块契约：identity 正确，全部动作 resultCandidate 恒 null，无 bot 钩子', () => {
  assert.equal(WITS_WAGERS_SIM_IDENTITY.rulesetId, 'wits_wagers_sim_v1');
  assert.deepEqual(witsWagersSimModule.registeredRulesets, ['wits_wagers_sim_v1']);
  assert.equal(witsWagersSimModule.manifest.id, 'wits-wagers');
  assert.equal('pickBotAction' in witsWagersSimModule, false);

  const ctx = { now: NOW, random: seeded('module') } as never;
  // 模块层走真实题库，不注入测试池
  let state = witsWagersSimModule.createInitialState(ctx, [...PLAYERS], { rulesetId: 'wits_wagers_sim_v1' });
  const actor = { kind: 'player', playerId: 'a' } as never;
  const steps: unknown[] = [
    { type: 'begin' },
    { type: 'sim:submit_guess', playerId: 'a', value: 10 },
    { type: 'sim:submit_guess', playerId: 'b', value: 20 },
    { type: 'sim:reveal_guesses' },
    { type: 'sim:place_chip', playerId: 'a', chipId: 'A', targetId: 'g:20' },
    { type: 'sim:adjust_money', playerId: 'b', delta: 3 },
    { type: 'sim:reveal_answer' },
    { type: 'sim:roll_dice', playerId: 'c' },
    { type: 'sim:next_question' },
  ];
  for (const action of steps) {
    const r = witsWagersSimModule.reduce(ctx, state, actor, action as never);
    assert.equal(r.ok, true, JSON.stringify({ action, r }));
    if (r.ok) {
      assert.equal(r.resultCandidate, null);
      state = r.nextState;
    }
  }
  // 主模式的配置默认值（answerSeconds/betSeconds）混进来也不应抛错
  assert.doesNotThrow(() =>
    witsWagersSimModule.createInitialState(ctx, [...PLAYERS], { rulesetId: 'wits_wagers_sim_v1', answerSeconds: 30, betSeconds: 30 } as never),
  );
});
