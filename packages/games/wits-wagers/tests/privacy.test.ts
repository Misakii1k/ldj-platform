import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../server/state.ts';
import { reduce } from '../server/reducer.ts';
import { buildPlayerView, buildSpectatorView } from '../server/views.ts';
import type { GameContext } from '@ldj/shared';

function createMockCtx(now = 1000): GameContext {
  return {
    now,
    random: {
      nextInt: (min, _max) => min,
      shuffle: (items) => [...items],
    },
  };
}

test('privacy: 非参赛者调用 buildPlayerView 返回 me: null，绝不泄露状态', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const outsiderView = buildPlayerView(state, 'spectator-or-stranger');
  assert.equal(outsiderView.me, null);
  const raw = outsiderView as unknown as Record<string, unknown>;
  assert.equal('scores' in raw, false);
  assert.equal('questionPlan' in raw, false);
});

test('privacy: 观战视角严格无 me 属性', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const specView = buildSpectatorView(state);
  assert.equal('me' in specView, false);
  assert.equal(Object.prototype.hasOwnProperty.call(specView, 'me'), false);
});

test('privacy: 作答阶段防偷看他人猜测与防提前泄题', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // p1 提交 500
  const p1Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 500,
    },
  );
  assert.ok(p1Res.ok);
  state = p1Res.nextState;

  // 检查公共事件：只有 guess_submitted(playerId)，绝不包含 value
  assert.equal(p1Res.publicEvents.length, 1);
  assert.equal(p1Res.publicEvents[0]?.type, 'guess_submitted');
  const eventRaw = p1Res.publicEvents[0] as unknown as Record<string, unknown>;
  assert.equal('value' in eventRaw, false);

  // 检查 p2 的视角：p2 绝不能看到 p1 提交的 500
  const p2View = buildPlayerView(state, 'p2');
  assert.deepEqual(p2View.board, []);
  assert.deepEqual(p2View.publicBets, {});
  assert.equal(p2View.me?.playerId, 'p2');
  assert.equal(p2View.me?.submittedGuess, null);

  // 检查公共视角中题目的保密性：不得出现答案、来源
  assert.ok(p2View.question);
  const qRaw = p2View.question as unknown as Record<string, unknown>;
  assert.equal('answer' in qRaw, false);
  assert.equal('sourceUrl' in qRaw, false);
  assert.equal('explanation' in qRaw, false);
});

test('privacy: 错误返回信息中不夹带私密状态', () => {
  const ctx = createMockCtx(1000);
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const errRes = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: 'fake',
      expectedRevision: 0,
      value: 100,
    },
  );
  assert.equal(errRes.ok, false);
  if (!errRes.ok) {
    assert.equal(errRes.code, 'INVALID_PHASE');
    assert.equal(typeof errRes.message, 'string');
    assert.equal(errRes.message.includes('questionPlan'), false);
    assert.equal(errRes.message.includes('schemaVersion'), false);
  }
});
