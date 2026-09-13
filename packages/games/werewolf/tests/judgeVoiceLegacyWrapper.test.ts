import test from 'node:test';
import assert from 'node:assert/strict';
import { JUDGE_NIGHT_HOLD_MS, wrapLegacyWithJudgeVoice } from '../server/judgeVoiceWrapper.ts';
import type { GameContext, GameEffect, GameModule } from '@ldj/shared';

interface StubState {
  phase: string;
  day: number;
  deadlineAt: number;
}

const ctx: GameContext = {
  now: 1_000_000,
  random: {
    nextInt: () => 0,
    shuffle: <T,>(items: readonly T[]) => [...items],
  },
};

function makeStubInner(nextPhase: string, deadlineAt: number): {
  module: GameModule<unknown, StubState, unknown, unknown, unknown, GameEffect, unknown>;
  effects: GameEffect[];
} {
  const effects: GameEffect[] = [
    {
      type: 'schedule_timer',
      timerId: `stub:${nextPhase}:1`,
      deadlineAt,
      action: { type: 'phase_timeout', phase: nextPhase, day: 1, token: 't1' },
    },
  ];
  const module = {
    manifest: { gameId: 'stub', rulesetId: 'stub_v1' },
    parseConfig: (input: unknown) => input,
    parseAction: (input: unknown) => input,
    createInitialState: () => ({ phase: 'idle', day: 0, deadlineAt: 0 }),
    reduce: () => ({ ok: true, state: { phase: nextPhase, day: 1, deadlineAt }, effects }),
    getPlayerView: () => null,
    getSpectatorView: () => null,
    getResult: () => null,
  } as unknown as GameModule<unknown, StubState, unknown, unknown, unknown, GameEffect, unknown>;
  return { module, effects };
}

function reduceWrapped(nextPhase: string, deadlineAt: number) {
  const inner = makeStubInner(nextPhase, deadlineAt);
  const wrapped = wrapLegacyWithJudgeVoice(inner.module);
  const result = wrapped.reduce(ctx, { phase: 'idle', day: 0, deadlineAt: 0 }, { playerId: 'p1' } as never, {} as never);
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  return { result, effects: inner.effects };
}

test('legacy judgeVoiceWrapper: 进入夜晚时把 deadlineAt 与 schedule_timer 补齐到最短时限', () => {
  const { result } = reduceWrapped('night', ctx.now + 30_000);
  assert.equal(result.state.phase, 'night');
  assert.ok(
    result.state.deadlineAt >= ctx.now + JUDGE_NIGHT_HOLD_MS,
    `deadlineAt (${result.state.deadlineAt}) 应补齐到 now + hold (${ctx.now + JUDGE_NIGHT_HOLD_MS})`,
  );
});

test('legacy judgeVoiceWrapper: 时限本就更长时不缩短', () => {
  const longDeadline = ctx.now + JUDGE_NIGHT_HOLD_MS + 60_000;
  const { result } = reduceWrapped('night', longDeadline);
  assert.equal(result.state.deadlineAt, longDeadline);
});

test('legacy judgeVoiceWrapper: 非夜晚阶段切换不受影响', () => {
  const deadline = ctx.now + 5_000;
  const { result } = reduceWrapped('voting', deadline);
  assert.equal(result.state.deadlineAt, deadline);
});

test('legacy judgeVoiceWrapper: 透传原模块字段与玩家可见视图', () => {
  const inner = makeStubInner('night', ctx.now);
  const wrapped = wrapLegacyWithJudgeVoice(inner.module);
  assert.equal(wrapped.manifest, inner.module.manifest);
  assert.equal(wrapped.parseConfig('x'), 'x');
  assert.equal(wrapped.parseAction('y'), 'y');
  const state = wrapped.createInitialState(ctx, ['p1'], undefined as never);
  assert.deepEqual(wrapped.getPlayerView(state, 'p1'), null);
  assert.deepEqual(wrapped.getSpectatorView(state), null);
});
