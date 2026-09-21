import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameContext } from '@ldj/shared';
import { witsWagersModule } from '../server/module.ts';
import { pickWitsWagersBotAction, estimateGuess, pickBestBets } from '../server/bot.ts';
import { buildWitsWagersBotPrompt } from '../server/botPrompt.ts';

function createMockCtx(now = 1000): GameContext {
  return {
    now,
    random: {
      nextInt: (min, _max) => min,
      shuffle: (items) => [...items],
    },
  };
}

test('bot: 启发式估数始终产出合法正整数', () => {
  const random = { nextInt: (min: number, max: number) => Math.floor((min + max) / 2), shuffle: <T>(a: T[]) => a };

  const cases = [
    { prompt: '阿波罗11号登月是在哪一年？', unit: '年' },
    { prompt: '珠穆朗玛峰的海拔高度是多少米？', unit: '米' },
    { prompt: '赤道的周长是多少公里？', unit: '公里' },
    { prompt: '成年非洲象的平均体重是多少公斤？', unit: '公斤' },
    { prompt: '世界上现存多少种企鹅？', unit: '种' },
  ];

  for (const c of cases) {
    const val = estimateGuess(c.prompt, c.unit, random);
    assert.ok(Number.isInteger(val), `${c.prompt} 应为整数`);
    assert.ok(val >= 1 && val <= 999_999_999_999, `${c.prompt} 应在安全正整数范围: ${val}`);
  }
});

test('bot: 作答阶段机器自动产出合法 submit_guess 动作，已作答则停动', () => {
  const ctx = createMockCtx();
  const config = witsWagersModule.parseConfig({});
  const state = witsWagersModule.createInitialState(ctx, ['bot1', 'bot2', 'p1'], config);

  // 开始对局进入 answering 阶段
  const beginRes = witsWagersModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  const answeringState = beginRes.nextState;

  const botView = witsWagersModule.getPlayerView(answeringState, 'bot1');
  const input = {
    view: botView,
    playerId: 'bot1',
    random: ctx.random,
    recentChat: [],
  };

  const action = pickWitsWagersBotAction(input);
  assert.ok(action !== null, '未提交作答时应产出动作');
  assert.equal(action.type, 'submit_guess');
  assert.equal(action.roundToken, botView.roundToken);
  assert.ok(action.value >= 1);

  // 校验动作符合 Schema
  assert.doesNotThrow(() => witsWagersModule.parseAction(action));

  // 执行作答后，再次决策应返回 null
  const guessRes = witsWagersModule.reduce(ctx, answeringState, { kind: 'player', playerId: 'bot1' }, action);
  assert.ok(guessRes.ok);
  const updatedView = witsWagersModule.getPlayerView(guessRes.nextState, 'bot1');
  const nextAction = pickWitsWagersBotAction({ ...input, view: updatedView });
  assert.equal(nextAction, null, '已提交作答后不应再提交');
});

test('bot: 下注阶段自动生成合法筹码 A/B 下注动作', () => {
  const ctx = createMockCtx();
  const config = witsWagersModule.parseConfig({});
  let state = witsWagersModule.createInitialState(ctx, ['bot1', 'bot2', 'p1'], config);
  const beginRes = witsWagersModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // 全员提交估数推进到版图阶段
  const g1 = witsWagersModule.reduce(ctx, state, { kind: 'player', playerId: 'bot1' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 100 });
  assert.ok(g1.ok);
  state = g1.nextState;
  const g2 = witsWagersModule.reduce(ctx, state, { kind: 'player', playerId: 'bot2' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 200 });
  assert.ok(g2.ok);
  state = g2.nextState;
  const g3 = witsWagersModule.reduce(ctx, state, { kind: 'player', playerId: 'p1' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 300 });
  assert.ok(g3.ok);
  state = g3.nextState;

  // 此时进入 arranging 阶段，推进时间并处理超时进入 betting 阶段
  ctx.now = (state.deadlineAt ?? ctx.now) + 1;
  const timeoutRes = witsWagersModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'phase_timeout', roundToken: state.roundToken, phaseEpoch: state.phaseEpoch, phase: 'arranging' });
  assert.ok(timeoutRes.ok, 'arranging 超时应成功');
  state = timeoutRes.nextState;
  assert.equal(state.phase, 'betting');

  const botView = witsWagersModule.getPlayerView(state, 'bot1');
  const input = {
    view: botView,
    playerId: 'bot1',
    random: ctx.random,
    recentChat: [],
  };

  const action = pickWitsWagersBotAction(input);
  assert.ok(action !== null, '未下注时应产出 set_bets 动作');
  assert.equal(action.type, 'set_bets');
  assert.equal(action.roundToken, botView.roundToken);
  assert.equal(action.chips.length, 2);
  assert.equal(action.chips[0].chipId, 'A');
  assert.equal(action.chips[1].chipId, 'B');

  // 校验合法性
  assert.doesNotThrow(() => witsWagersModule.parseAction(action));

  // 执行下注后，再次调用返回 null
  const betRes = witsWagersModule.reduce(ctx, state, { kind: 'player', playerId: 'bot1' }, action);
  assert.ok(betRes.ok);
  const updatedView = witsWagersModule.getPlayerView(betRes.nextState, 'bot1');
  const nextAction = pickWitsWagersBotAction({ ...input, view: updatedView });
  assert.equal(nextAction, null, '已下注后不应重复下注');
});

test('botPrompt: 大模型决策上下文输出合法的 prompt 结构', () => {
  const ctx = createMockCtx();
  const config = witsWagersModule.parseConfig({});
  const state = witsWagersModule.createInitialState(ctx, ['bot1', 'p1', 'p2'], config);
  const beginRes = witsWagersModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  const nextState = beginRes.nextState;

  const view = witsWagersModule.getPlayerView(nextState, 'bot1');
  const input = { view, playerId: 'bot1', random: ctx.random, recentChat: [] };

  const prompt = buildWitsWagersBotPrompt(input);
  assert.ok(prompt !== null);
  assert.ok(prompt.options.length >= 3, '应提供不少于 3 个估数候选项');
  for (const opt of prompt.options) {
    assert.equal(opt.action.type, 'submit_guess');
  }
});
