import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInvariants } from '../server/invariants.ts';
import { createInitialState } from '../server/state.ts';
import type { BetPair } from '../server/types.ts';
import type { GameContext, RandomSource } from '@ldj/shared';

function createMockCtx(): GameContext {
  const mockRandom: RandomSource = {
    nextInt: (min, _max) => min,
    shuffle: (items) => [...items],
  };
  return {
    now: 1000,
    random: mockRandom,
  };
}

test('invariants: 正常初始状态通过不变量校验', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  assert.doesNotThrow(() => assertInvariants(state));
});

test('invariants: 玩家人数在 3..7 以外或重复时抛错', () => {
  const ctx = createMockCtx();
  assert.throws(() => createInitialState(ctx, ['p1', 'p2'], {}));
  assert.throws(() => createInitialState(ctx, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], {}));
  assert.throws(() => createInitialState(ctx, ['p1', 'p2', 'p1'], {}));
});

test('invariants: 非法阶段字段破坏不变量时抛错', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  // created 阶段 round 必须为 0
  assert.throws(() => assertInvariants({ ...state, round: 1 }));
  // created 阶段 roundToken 必须为空
  assert.throws(() => assertInvariants({ ...state, roundToken: 'abc' }));
  // created 阶段 deadlineAt 必须为 null
  assert.throws(() => assertInvariants({ ...state, deadlineAt: 5000 }));
});

test('invariants: 下注期筹码总额超过当前余额时抛错', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const bettingState = {
    ...state,
    phase: 'betting' as const,
    round: 1,
    roundToken: 'tok',
    scores: { p1: 5, p2: 0, p3: 0 },
    bets: {
      p1: [
        { chipId: 'A', targetId: 'g:100', extraStake: 4 },
        { chipId: 'B', targetId: 'g:100', extraStake: 2 }, // 4+2=6 > 5
      ] as BetPair,
      p2: state.bets['p2']!,
      p3: state.bets['p3']!,
    },
  };

  assert.throws(() => assertInvariants(bettingState));
});

test('invariants: 版图必须以 lower 边缘槽开头且赔率为 6，不得含已删除的 higher', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const base = {
    ...state,
    phase: 'arranging' as const,
    round: 1,
    roundToken: 'tok',
  };

  // 缺 lower
  assert.throws(() =>
    assertInvariants({
      ...base,
      board: [
        { id: 'g:100' as const, value: 100, slot: 'C' as const, odds: 2, authors: ['p1'] },
      ],
    }),
  );

  // 边缘槽赔率被改坏
  assert.throws(() =>
    assertInvariants({
      ...base,
      board: [
        { id: 'lower' as const, value: null, slot: 'LOWER' as const, odds: 3, authors: [] },
        { id: 'g:100' as const, value: 100, slot: 'C' as const, odds: 2, authors: ['p1'] },
      ],
    }),
  );

  // 旧版 higher 卡混进版图必须被拒绝
  assert.throws(() =>
    assertInvariants({
      ...base,
      board: [
        { id: 'lower' as const, value: null, slot: 'LOWER' as const, odds: 6, authors: [] },
        { id: 'g:100' as const, value: 100, slot: 'C' as const, odds: 2, authors: ['p1'] },
        { id: 'higher', value: null, slot: 'HIGHER', odds: 6, authors: [] },
      ] as unknown as typeof base.board,
    }),
  );

  // 合法版图通过
  assert.doesNotThrow(() =>
    assertInvariants({
      ...base,
      board: [
        { id: 'lower' as const, value: null, slot: 'LOWER' as const, odds: 6, authors: [] },
        { id: 'g:100' as const, value: 100, slot: 'C' as const, odds: 2, authors: ['p1'] },
      ],
    }),
  );
});

test('invariants: questionIndex 越界或落后于轮次时抛错', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  assert.throws(() => assertInvariants({ ...state, questionIndex: -1 }));
  assert.throws(() =>
    assertInvariants({ ...state, questionIndex: state.questionPlan.length }),
  );
  // 第 3 轮至少要用到第 3 题（下标 2）；下标 1 说明状态被污染
  assert.throws(() =>
    assertInvariants({ ...state, phase: 'answering' as const, round: 3, questionIndex: 1 }),
  );
  // 作废重抽会让下标跑在轮次前面，这是合法的
  assert.doesNotThrow(() =>
    assertInvariants({ ...state, phase: 'answering' as const, round: 1, questionIndex: 2 }),
  );
});
