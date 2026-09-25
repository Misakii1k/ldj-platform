import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNightPlan,
  createInitialTimelineState,
  advanceTimelineStep,
  pauseTimeline,
  resumeTimeline,
  setTimelineMode,
  type TimelineStep,
} from '../server/timeline.ts';
import { werewolfTimelineSchema, getVoiceCueDurationMs } from '@ldj/shared';

test('buildNightPlan：角色顺序固定且仅包含已配置角色，首夜包含确认，次夜无确认', () => {
  // 1. 标准 4 神配置：女巫、预言家、守卫、猎人
  const planDay1 = buildNightPlan({ witch: true, seer: true, guard: true, hunter: true }, 1, 'standard');
  const rolesDay1 = planDay1.map((s) => `${s.role ?? 'none'}:${s.segment}`);

  // 必须按顺序：intro -> wolf -> witch -> seer -> guard -> hunter confirm -> close
  assert.equal(rolesDay1[0], 'none:intro');
  assert.equal(rolesDay1[1], 'wolf:open');
  assert.equal(rolesDay1[2], 'wolf:action');
  assert.equal(rolesDay1[3], 'wolf:close');
  assert.equal(rolesDay1[4], 'witch:open');
  assert.equal(rolesDay1[5], 'witch:action');
  assert.equal(rolesDay1[6], 'witch:close');
  assert.equal(rolesDay1[7], 'seer:open');
  assert.equal(rolesDay1[8], 'seer:action');
  assert.equal(rolesDay1[9], 'seer:close');
  assert.equal(rolesDay1[10], 'guard:open');
  assert.equal(rolesDay1[11], 'guard:action');
  assert.equal(rolesDay1[12], 'guard:close');
  assert.equal(rolesDay1[13], 'hunter:confirm');
  assert.equal(rolesDay1[14], 'hunter:close');

  // 第 2 夜：无 hunter 确认环节
  const planDay2 = buildNightPlan({ witch: true, seer: true, guard: true, hunter: true }, 2, 'standard');
  const rolesDay2 = planDay2.map((s) => `${s.role ?? 'none'}:${s.segment}`);
  assert.equal(rolesDay2.includes('hunter:confirm'), false);
  assert.equal(rolesDay2.includes('hunter:close'), false);

  // 无守卫配置：计划中绝不包含 guard
  const planNoGuard = buildNightPlan({ witch: true, seer: true, guard: false }, 1, 'standard');
  assert.equal(planNoGuard.some((s) => s.role === 'guard'), false);
});

test('buildNightPlan：猎人白痴单配与双配的语音及图层契约', () => {
  // 仅猎人：无合适单职业组合语音，cue 为 null，时长固定 3s
  const planHunterOnly = buildNightPlan({ hunter: true, idiot: false }, 1, 'standard');
  const hunterConfirm = planHunterOnly.find((s) => s.segment === 'confirm')!;
  assert.equal(hunterConfirm.role, 'hunter');
  assert.equal(hunterConfirm.cue, null);
  assert.equal(hunterConfirm.durationMs, 3000);

  // 仅白痴：cue 为 null，role 为 idiot，时长固定 3s
  const planIdiotOnly = buildNightPlan({ hunter: false, idiot: true }, 1, 'standard');
  const idiotConfirm = planIdiotOnly.find((s) => s.segment === 'confirm')!;
  assert.equal(idiotConfirm.role, 'idiot');
  assert.equal(idiotConfirm.cue, null);
  assert.equal(idiotConfirm.durationMs, 3000);

  // 双配：role 为 hunter_idiot，cue 为 hunter_idiot_confirm
  const planBoth = buildNightPlan({ hunter: true, idiot: true }, 1, 'standard');
  const bothConfirm = planBoth.find((s) => s.segment === 'confirm')!;
  assert.equal(bothConfirm.role, 'hunter_idiot');
  assert.equal(bothConfirm.cue, 'hunter_idiot_confirm');
  assert.equal(bothConfirm.durationMs, 3500);
});

test('buildNightPlan：pace 操作窗口时长严格匹配', () => {
  const paces = ['fast', 'standard', 'relaxed'] as const;
  const expectedWolf = { fast: 20000, standard: 30000, relaxed: 45000 };
  const expectedGod = { fast: 12000, standard: 20000, relaxed: 30000 };

  for (const pace of paces) {
    const plan = buildNightPlan({ witch: true, seer: true }, 1, pace);
    const wolfAction = plan.find((s) => s.role === 'wolf' && s.segment === 'action')!;
    const witchAction = plan.find((s) => s.role === 'witch' && s.segment === 'action')!;
    assert.equal(wolfAction.durationMs - getVoiceCueDurationMs('wolf_kill'), expectedWolf[pace]);
    assert.equal(witchAction.durationMs - getVoiceCueDurationMs('witch_cure_prompt') - getVoiceCueDurationMs('witch_poison_prompt'), expectedGod[pace]);
  }
});

test('createInitialTimelineState 与 advanceTimelineStep：状态推进、单调 revision 与 token 校验', () => {
  const plan = buildNightPlan({ witch: true }, 1, 'standard');
  let now = 1000000;
  let state = createInitialTimelineState(plan, 1, 'auto', now);

  // 校验当前生成的 public timeline 严格符合 schema
  assert.equal(werewolfTimelineSchema.safeParse(state.current).success, true);
  assert.equal(state.stepIndex, 0);
  assert.equal(state.revision, 1);
  assert.equal(state.current.segment, 'intro');
  assert.ok(state.activeTimerToken);

  const introEndsAt = state.current.endsAt!;
  assert.equal(introEndsAt, now + 1700);

  // 使用错误 token 推进被拒绝
  const wrongTokenRes = advanceTimelineStep(state, plan, introEndsAt, 'wrong-token');
  assert.equal(wrongTokenRes.advanced, false);
  assert.equal(wrongTokenRes.state, state);

  // 未到期时间提前推进被拒绝
  const tooEarlyRes = advanceTimelineStep(state, plan, introEndsAt - 1, state.activeTimerToken!);
  assert.equal(tooEarlyRes.advanced, false);

  // 正确推进到第 1 步 (wolf:open)
  const step1Res = advanceTimelineStep(state, plan, introEndsAt, state.activeTimerToken!);
  assert.equal(step1Res.advanced, true);
  state = step1Res.state;

  assert.equal(werewolfTimelineSchema.safeParse(state.current).success, true);
  assert.equal(state.stepIndex, 1);
  assert.equal(state.revision, 2);
  assert.equal(state.current.role, 'wolf');
  assert.equal(state.current.segment, 'open');
  assert.notEqual(state.activeTimerToken, null);

  // 推进到最后一步直到 nightResolved 信号
  while (state.stepIndex < plan.length - 1) {
    const nextNow = state.current.endsAt!;
    const res = advanceTimelineStep(state, plan, nextNow, state.activeTimerToken!);
    assert.equal(res.advanced, true);
    state = res.state;
    assert.equal(werewolfTimelineSchema.safeParse(state.current).success, true);
  }

  // 此时在最后一步 (witch:close)，再次推进应当触发 nightResolved 信号
  const finalRes = advanceTimelineStep(state, plan, state.current.endsAt!, state.activeTimerToken!);
  assert.equal(finalRes.advanced, true);
  assert.equal(finalRes.nightResolved, true);
});

test('pauseTimeline 与 resumeTimeline：冻结剩余时间，作废旧 token，产生新 revision', () => {
  const plan = buildNightPlan({ witch: true }, 1, 'standard');
  const now = 1000000;
  let state = createInitialTimelineState(plan, 1, 'auto', now);

  // 在 intro 环节进行 1000ms 后暂停（总长 1700ms，剩余 700ms）
  const pauseNow = now + 1000;
  const oldToken = state.activeTimerToken;
  const pausedState = pauseTimeline(state, pauseNow);

  assert.equal(werewolfTimelineSchema.safeParse(pausedState.current).success, true);
  assert.equal(pausedState.current.paused, true);
  assert.equal(pausedState.current.endsAt, null);
  assert.equal(pausedState.current.actionDeadlineAt, null);
  assert.equal(pausedState.current.pauseRemainingMs, 700);
  assert.equal(pausedState.pausedRemainingMs, 700);
  assert.equal(pausedState.activeTimerToken, null);
  assert.equal(pausedState.revision, state.revision + 1);

  // 旧 token 已失效，即使到原 endsAt 也不能推进
  const advanceWhilePaused = advanceTimelineStep(pausedState, plan, now + 1700, oldToken!);
  assert.equal(advanceWhilePaused.advanced, false);

  // 恢复：经历任意等待后 resume（例如 pauseNow + 5000）
  const resumeNow = pauseNow + 5000;
  const resumedState = resumeTimeline(pausedState, resumeNow);

  assert.equal(werewolfTimelineSchema.safeParse(resumedState.current).success, true);
  assert.equal(resumedState.current.paused, false);
  assert.equal(resumedState.current.endsAt, resumeNow + 700);
  assert.equal(resumedState.current.pauseRemainingMs, null);
  assert.equal(resumedState.pausedRemainingMs, null);
  assert.notEqual(resumedState.activeTimerToken, null);
  assert.notEqual(resumedState.activeTimerToken, oldToken);
  assert.equal(resumedState.revision, pausedState.revision + 1);

  // 到达新 endsAt 可以推进
  const res = advanceTimelineStep(resumedState, plan, resumeNow + 700, resumedState.activeTimerToken!);
  assert.equal(res.advanced, true);
});

test('setTimelineMode：manual 与 auto 切换', () => {
  const plan = buildNightPlan({ witch: true }, 1, 'standard');
  const now = 1000000;
  const autoState = createInitialTimelineState(plan, 1, 'auto', now);

  // 切到 manual：作废计时器，endsAt 置 null
  const manualState = setTimelineMode(autoState, 'manual', now + 500);
  assert.equal(werewolfTimelineSchema.safeParse(manualState.current).success, true);
  assert.equal(manualState.current.mode, 'manual');
  assert.equal(manualState.current.endsAt, null);
  assert.equal(manualState.activeTimerToken, null);

  // 从 manual 切回 auto：为当前环节重新起算完整时长
  const backToAuto = setTimelineMode(manualState, 'auto', now + 2000);
  assert.equal(werewolfTimelineSchema.safeParse(backToAuto.current).success, true);
  assert.equal(backToAuto.current.mode, 'auto');
  assert.equal(backToAuto.current.endsAt, now + 2000 + 1700);
  assert.notEqual(backToAuto.activeTimerToken, null);
});
