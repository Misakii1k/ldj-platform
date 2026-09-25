import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { JUDGE_NIGHT_HOLD_MS, JUDGE_DAY_ANNOUNCEMENT_HOLD_MS } from '../../server/judgeVoiceWrapper.ts';
import { actor, apply } from './helpers.ts';

const IDS = ['w1', 'w2', 's', 'x', 'v1', 'v2'];

test('v2 judgeVoiceWrapper: 进入夜晚和天亮公告时对 deadlineAt 补齐最短时限', () => {
  assert.ok(JUDGE_NIGHT_HOLD_MS > 30_000, '夜间保底时限应大于 30 秒');
  assert.equal(JUDGE_DAY_ANNOUNCEMENT_HOLD_MS, 20_000, '白天公告保底应为 20 秒');

  const ctx = {
    now: 1_000_000,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
  const cfg = werewolfV2Module.parseConfig({ roles: { guard: false, hunter: false, idiot: false } });
  let st = werewolfV2Module.createInitialState(ctx, IDS, cfg);
  // 契约 C / T04.c：旧局 fixture（timelineState=null）保持原 wrapper 时限补齐
  st.timelineState = null;

  assert.equal(st.phase, 'role_reveal');

  // 全员确认身份推进到第一夜
  for (let i = 0; i < IDS.length - 1; i += 1) {
    st = apply(st, actor(IDS[i]!), { type: 'confirm_role' }, ctx);
  }
  // 最后一个确认，触发阶段变迁到 night
  const lastConfirm = werewolfV2Module.reduce(ctx, st, actor(IDS[IDS.length - 1]!), { type: 'confirm_role' });
  assert.equal(lastConfirm.ok, true);
  if (!lastConfirm.ok) return;

  assert.equal(lastConfirm.nextState.phase, 'night');
  // 检查 state.deadlineAt 被补齐
  assert.ok(
    lastConfirm.nextState.deadlineAt! >= ctx.now + JUDGE_NIGHT_HOLD_MS,
    `deadlineAt (${lastConfirm.nextState.deadlineAt}) 应大于等于 now + hold (${ctx.now + JUDGE_NIGHT_HOLD_MS})`,
  );
  // 检查 schedule_timer effect 同样被 patch
  const timerEffect = lastConfirm.effects.find((e) => e.type === 'schedule_timer');
  assert.ok(timerEffect, '应存在 schedule_timer effect');
  if (timerEffect && timerEffect.type === 'schedule_timer') {
    assert.equal(timerEffect.deadlineAt, lastConfirm.nextState.deadlineAt);
  }

  // 推进夜间动作完成
  st = lastConfirm.nextState;
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' }, ctx);
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' }, ctx);
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' }, ctx);
  st = apply(st, actor('x'), { type: 'witch_save', save: false }, ctx);

  // 最后一个操作触发 night -> day_announcement
  const lastNightAction = werewolfV2Module.reduce(ctx, st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(lastNightAction.ok, true);
  if (!lastNightAction.ok) return;

  assert.equal(lastNightAction.nextState.phase, 'day_announcement');
  assert.ok(
    lastNightAction.nextState.deadlineAt! >= ctx.now + JUDGE_DAY_ANNOUNCEMENT_HOLD_MS,
    `day_announcement deadlineAt 应大于等于 now + hold (${ctx.now + JUDGE_DAY_ANNOUNCEMENT_HOLD_MS})`,
  );
});

test('v2 judgeVoiceWrapper: 权威时间线新局（timelineState.version===1）旁路旧整夜保底', () => {
  const ctx = {
    now: 1_000_000,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
  const cfg = werewolfV2Module.parseConfig({ roles: { guard: false, hunter: false, idiot: false } });
  let st = werewolfV2Module.createInitialState(ctx, IDS, cfg);
  assert.equal(st.timelineState?.version, 1);

  for (let i = 0; i < IDS.length - 1; i += 1) {
    st = apply(st, actor(IDS[i]!), { type: 'confirm_role' }, ctx);
  }
  const lastConfirm = werewolfV2Module.reduce(ctx, st, actor(IDS[IDS.length - 1]!), { type: 'confirm_role' });
  assert.equal(lastConfirm.ok, true);
  if (!lastConfirm.ok) return;

  // 新时间线流程旁路旧整夜 holdMs，保持新流程自身节奏
  assert.notEqual(lastConfirm.nextState.deadlineAt, ctx.now + JUDGE_NIGHT_HOLD_MS);
});
