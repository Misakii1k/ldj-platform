import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAdjustedNow,
  calculateRemainingSeconds,
  formatTimelineTimer,
  type ServerClockSample,
} from '../src/shared-ui/serverClock.ts';
import { applyEnvelope } from '../src/connection/envelopeReducer.ts';
import { INITIAL_CONNECTION_STATE } from '../src/connection/types.ts';
import type { ServerEnvelope } from '@ldj/shared';

test('serverClock: 纯函数时钟，入参传入 monotonic，相同 sample 推进 5 秒必须少 5 秒', () => {
  const sample: ServerClockSample = {
    serverNow: 1_000_000,
    receivedAtMonotonic: 10_000,
  };
  const deadlineAt = 1_020_000; // 20 秒后到期

  // 1. 在采样时刻 (monotonic = 10_000)
  const remAtStart = calculateRemainingSeconds(deadlineAt, sample, 10_000);
  assert.equal(remAtStart, 20);

  // 2. 推进 5 秒 (monotonic = 15_000)
  const remAfter5s = calculateRemainingSeconds(deadlineAt, sample, 15_000);
  assert.equal(remAfter5s, 15);
  assert.equal(remAtStart - remAfter5s, 5);

  // 3. 推进 20 秒 (monotonic = 30_000) -> 0
  const remAtDeadline = calculateRemainingSeconds(deadlineAt, sample, 30_000);
  assert.equal(remAtDeadline, 0);

  // 4. 推进 25 秒 (monotonic = 35_000) -> 0 (不为负数)
  const remAfterDeadline = calculateRemainingSeconds(deadlineAt, sample, 35_000);
  assert.equal(remAfterDeadline, 0);
});

test('serverClock: 本地 Date.now 偏 ±5 分钟，adjustedNow 与倒数仍完全正常不受偏误影响', () => {
  const sample: ServerClockSample = {
    serverNow: 1_700_000_000_000,
    receivedAtMonotonic: 5_000,
  };
  const deadlineAt = 1_700_000_030_000; // 30秒

  // 无论全局 Date.now 是什么，calculateAdjustedNow 仅由 serverNow + (monotonic - receivedAtMonotonic) 计算
  const adjusted1 = calculateAdjustedNow(sample, 5_000);
  assert.equal(adjusted1, 1_700_000_000_000);

  const adjusted2 = calculateAdjustedNow(sample, 15_000);
  assert.equal(adjusted2, 1_700_000_010_000);

  const rem = calculateRemainingSeconds(deadlineAt, sample, 15_000);
  assert.equal(rem, 20);
});

test('serverClock: formatTimelineTimer 格式化各种状态', () => {
  const sample: ServerClockSample = {
    serverNow: 100_000,
    receivedAtMonotonic: 1_000,
  };

  // 1. 暂停状态
  const paused = formatTimelineTimer(
    {
      mode: 'auto',
      paused: true,
      pauseRemainingMs: 8_500,
      endsAt: 110_000,
    },
    sample,
    1_000,
  );
  assert.equal(paused.status, 'paused');
  assert.equal(paused.label, '已暂停');
  assert.equal(paused.secondsLeft, 9);

  // 2. 手动模式
  const manual = formatTimelineTimer(
    {
      mode: 'manual',
      paused: false,
      pauseRemainingMs: null,
      endsAt: null,
    },
    sample,
    1_000,
  );
  assert.equal(manual.status, 'waiting');
  assert.equal(manual.label, '等待主持人');
  assert.equal(manual.secondsLeft, 0);

  // 3. 自动播报环节 (intro/cue)
  const broadcasting = formatTimelineTimer(
    {
      mode: 'auto',
      paused: false,
      pauseRemainingMs: null,
      segment: 'intro',
      cue: 'voice_night_intro',
      endsAt: 105_000,
      actionDeadlineAt: null,
    },
    sample,
    1_000,
  );
  assert.equal(broadcasting.status, 'broadcasting');
  assert.equal(broadcasting.label, '正在播报');

  // 4. 操作倒数环节 (action)
  const counting = formatTimelineTimer(
    {
      mode: 'auto',
      paused: false,
      pauseRemainingMs: null,
      segment: 'action',
      cue: null,
      endsAt: 120_000,
      actionDeadlineAt: 120_000,
    },
    sample,
    6_000, // 推进 5 秒
  );
  assert.equal(counting.status, 'counting');
  assert.equal(counting.secondsLeft, 15);
});

test('serverClock: 连接层收到有效 envelope 注入 clockSample，坏帧不改变 clockSample', () => {
  const initial = { ...INITIAL_CONNECTION_STATE, clockSample: null };
  const validEnvelope: ServerEnvelope = {
    v: 1,
    type: 'ack',
    serverNow: 1_700_000_123_456,
    payload: {},
  };

  // 传入 receivedAtMonotonic = 1234.5
  const result = applyEnvelope(initial, validEnvelope, 1234.5);
  assert.ok(result.state.clockSample);
  assert.equal(result.state.clockSample.serverNow, 1_700_000_123_456);
  assert.equal(result.state.clockSample.receivedAtMonotonic, 1234.5);
});
