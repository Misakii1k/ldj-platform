import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  werewolfTimelineSchema,
  type WerewolfTimeline,
} from '@ldj/shared';

const validTimeline: WerewolfTimeline = {
  version: 1,
  id: 'n1-wolf-action-r1',
  day: 1,
  period: 'night',
  role: 'wolf',
  segment: 'action',
  cue: 'wolf_action',
  label: '狼人请选择袭击目标',
  startedAt: 1000,
  endsAt: 31000,
  actionDeadlineAt: 31000,
  mode: 'auto',
  paused: false,
  pauseRemainingMs: null,
};

test('werewolfTimelineSchema：合法 timeline 通过校验', () => {
  const parsed = werewolfTimelineSchema.safeParse(validTimeline);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data, validTimeline);
  }
});

test('werewolfTimelineSchema：允许 null role 与 null cue', () => {
  const data = {
    ...validTimeline,
    role: null,
    cue: null,
    segment: 'intro' as const,
    label: '天黑请闭眼',
  };
  const parsed = werewolfTimelineSchema.safeParse(data);
  assert.equal(parsed.success, true);
});

test('werewolfTimelineSchema：拒绝 NaN 与负数时间', () => {
  const cases: unknown[] = [
    { ...validTimeline, startedAt: -1 },
    { ...validTimeline, startedAt: NaN },
    { ...validTimeline, endsAt: -500 },
    { ...validTimeline, endsAt: NaN },
    { ...validTimeline, actionDeadlineAt: -10 },
    { ...validTimeline, actionDeadlineAt: NaN },
    { ...validTimeline, pauseRemainingMs: -1 },
    { ...validTimeline, pauseRemainingMs: NaN },
  ];
  for (const c of cases) {
    assert.equal(werewolfTimelineSchema.safeParse(c).success, false, JSON.stringify(c));
  }
});

test('werewolfTimelineSchema：拒绝未知字段（strict 契约）', () => {
  const data = {
    ...validTimeline,
    playerId: 'p1', // 泄露玩家
  };
  assert.equal(werewolfTimelineSchema.safeParse(data).success, false);

  const data2 = {
    ...validTimeline,
    targetSeat: 3, // 泄露目标
  };
  assert.equal(werewolfTimelineSchema.safeParse(data2).success, false);
});

test('werewolfTimelineSchema：校验 deadline 逻辑关系（endsAt >= startedAt, actionDeadlineAt <= endsAt）', () => {
  // endsAt < startedAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      startedAt: 10000,
      endsAt: 9000,
      actionDeadlineAt: 9000,
    }).success,
    false,
  );

  // actionDeadlineAt > endsAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      startedAt: 1000,
      endsAt: 20000,
      actionDeadlineAt: 25000,
    }).success,
    false,
  );

  // actionDeadlineAt < startedAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      startedAt: 1000,
      endsAt: 20000,
      actionDeadlineAt: 500,
    }).success,
    false,
  );
});

test('werewolfTimelineSchema：manual 模式与 paused 状态下禁止活动截止时间', () => {
  // manual 模式有 endsAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      mode: 'manual',
      endsAt: 30000,
      actionDeadlineAt: null,
    }).success,
    false,
  );

  // manual 模式有 actionDeadlineAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      mode: 'manual',
      endsAt: null,
      actionDeadlineAt: 30000,
    }).success,
    false,
  );

  // paused 状态有 endsAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      paused: true,
      pauseRemainingMs: 15000,
      endsAt: 30000,
      actionDeadlineAt: null,
    }).success,
    false,
  );

  // paused 状态有 actionDeadlineAt
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      paused: true,
      pauseRemainingMs: 15000,
      endsAt: null,
      actionDeadlineAt: 30000,
    }).success,
    false,
  );

  // 未暂停时 pauseRemainingMs 必须为 null
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      paused: false,
      pauseRemainingMs: 5000,
    }).success,
    false,
  );

  // 合法的 manual
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      mode: 'manual',
      endsAt: null,
      actionDeadlineAt: null,
      paused: false,
      pauseRemainingMs: null,
    }).success,
    true,
  );

  // 合法的 paused
  assert.equal(
    werewolfTimelineSchema.safeParse({
      ...validTimeline,
      endsAt: null,
      actionDeadlineAt: null,
      paused: true,
      pauseRemainingMs: 15000,
    }).success,
    true,
  );
});
