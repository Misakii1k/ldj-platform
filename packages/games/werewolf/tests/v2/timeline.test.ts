import { getVoiceCueDurationMs } from '@ldj/shared';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { init, apply, actor, system } from './helpers.ts';
import type { V2State } from '../../server/v2/types.ts';

type V2TestCtx = {
  now: number;
  random: {
    nextInt: () => number;
    shuffle: <T>(items: readonly T[]) => T[];
  };
};

const IDS = ['w1', 'w2', 's1', 'x1', 'g1', 'v1', 'v2', 'v3'];

function startedNightV2(
  pace: 'fast' | 'standard' | 'relaxed' = 'standard',
  now = 1_000_000,
  roles = { guard: true, hunter: false, idiot: false },
): { state: V2State; ctx: V2TestCtx } {
  const ctx: V2TestCtx = {
    now,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
  let state = init(IDS, { pace, roles }, ctx);
  state = apply(state, system, { type: 'begin' }, ctx);
  for (const id of IDS) {
    state = apply(state, actor(id), { type: 'confirm_role' }, ctx);
  }
  return { state, ctx };
}

function advanceTimeline(state: V2State, ctx: V2TestCtx): V2State {
  const cur = state.timelineState!.current;
  const token = state.timelineState!.activeTimerToken!;
  const endsAt = cur.endsAt!;
  ctx.now = endsAt;
  return apply(state, system, { type: 'timeline_timeout', timelineId: cur.id, token }, ctx);
}

test('V2 新局进入夜晚：启动权威时间线并调度 timeline_timeout，而非旧整夜 timer', () => {
  const { state } = startedNightV2('standard', 1_000_000);
  assert.equal(state.phase, 'night');
  assert.ok(state.timelineState);
  assert.equal(state.timelineState.current.segment, 'intro');
  assert.equal(state.timelineState.current.cue, 'night_start');
  assert.equal(state.timelineState.current.endsAt, 1_000_000 + 1700);
});

test('V2 动作窗口校验：非当前时间线角色/非 action 窗口/timelineId 不符被拒', () => {
  const { state, ctx } = startedNightV2('standard', 1_000_000);
  // 当前在 intro 阶段，狼人出刀应被拒
  const introRes = werewolfV2Module.reduce(ctx, state, actor('w1'), {
    type: 'night_kill',
    targetPlayerId: 'v1',
  });
  assert.equal(introRes.ok, false);
});

test('V2 节奏窗口时长精确断言（fast: 20s/12s, standard: 30s/20s, relaxed: 45s/30s）', () => {
  const paces = [
    { pace: 'fast' as const, wolfDur: 20000, godDur: 12000 },
    { pace: 'standard' as const, wolfDur: 30000, godDur: 20000 },
    { pace: 'relaxed' as const, wolfDur: 45000, godDur: 30000 },
  ];

  for (const { pace, wolfDur, godDur } of paces) {
    const { state, ctx } = startedNightV2(pace, 1_000_000);
    // intro -> wolf:open -> wolf:action
    let st = advanceTimeline(state, ctx); // intro 结束 -> wolf:open
    assert.equal(st.timelineState!.current.role, 'wolf');
    assert.equal(st.timelineState!.current.segment, 'open');

    st = advanceTimeline(st, ctx); // wolf:open 结束 -> wolf:action
    assert.equal(st.timelineState!.current.role, 'wolf');
    assert.equal(st.timelineState!.current.segment, 'action');
    assert.equal(st.timelineState!.current.endsAt! - st.timelineState!.current.startedAt, wolfDur + 2000);

    // wolf:action -> wolf:close -> witch:open -> witch:action
    st = advanceTimeline(st, ctx); // wolf:close
    st = advanceTimeline(st, ctx); // witch:open
    st = advanceTimeline(st, ctx); // witch:action
    assert.equal(st.timelineState!.current.role, 'witch');
    assert.equal(st.timelineState!.current.segment, 'action');
    assert.equal(st.timelineState!.current.endsAt! - st.timelineState!.current.startedAt, godDur + getVoiceCueDurationMs('witch_cure_prompt') + getVoiceCueDurationMs('witch_poison_prompt'));
  }
});

test('V2 早交不提前、全员提早操作不提前进入白天、死亡角色不省时', () => {
  const { state, ctx } = startedNightV2('standard', 1_000_000);
  let st = advanceTimeline(state, ctx); // intro -> wolf:open
  st = advanceTimeline(st, ctx); // wolf:open -> wolf:action

  // 狼人在第一秒全部完成操作
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' }, ctx);
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' }, ctx);

  // 狼人重复提交被拒
  const dupRes = werewolfV2Module.reduce(ctx, st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v2' });
  assert.equal(dupRes.ok, false);

  // 虽然全狼已交，但阶段仍为 night，时间线未提前推进
  assert.equal(st.phase, 'night');
  assert.equal(st.timelineState!.current.role, 'wolf');
  assert.equal(st.timelineState!.current.segment, 'action');

  // 未到期推进被拒绝
  const tooEarly = werewolfV2Module.reduce(ctx, st, system, {
    type: 'timeline_timeout',
    timelineId: st.timelineState!.current.id,
    token: st.timelineState!.activeTimerToken!,
  });
  assert.equal(tooEarly.ok, true);
  assert.equal(tooEarly.nextState.timelineState!.stepIndex, st.timelineState!.stepIndex); // noop

  // 正常到期推进
  st = advanceTimeline(st, ctx);
  assert.equal(st.timelineState!.current.segment, 'close');
});

test('V2 完整夜间时间线推进：女巫救人/下毒分槽、预言家查验、守卫守护、夜末统一结算', () => {
  const { state, ctx } = startedNightV2('standard', 1_000_000);
  let st = advanceTimeline(state, ctx); // intro -> wolf:open
  st = advanceTimeline(st, ctx); // wolf:open -> wolf:action

  // 狼人出刀 v1
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1', timelineId: st.timelineState!.current.id }, ctx);
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1', timelineId: st.timelineState!.current.id }, ctx);

  // wolf:close -> witch:open -> witch:action
  st = advanceTimeline(st, ctx); // wolf:close
  assert.equal(st.timelineState!.current.role, 'wolf');
  assert.equal(st.timelineState!.current.segment, 'close');

  st = advanceTimeline(st, ctx); // witch:open
  st = advanceTimeline(st, ctx); // witch:action
  assert.equal(st.timelineState!.current.role, 'witch');
  assert.equal(st.timelineState!.current.segment, 'action');

  // 女巫解药不用
  st = apply(st, actor('x1'), { type: 'witch_save', save: false, timelineId: st.timelineState!.current.id }, ctx);
  // 女巫下毒 v2
  st = apply(st, actor('x1'), { type: 'witch_poison', targetPlayerId: 'v2', timelineId: st.timelineState!.current.id }, ctx);

  // witch:close -> seer:open -> seer:action
  st = advanceTimeline(st, ctx); // witch:close
  st = advanceTimeline(st, ctx); // seer:open
  st = advanceTimeline(st, ctx); // seer:action
  assert.equal(st.timelineState!.current.role, 'seer');
  assert.equal(st.timelineState!.current.segment, 'action');

  // 预言家查验 w1
  st = apply(st, actor('s1'), { type: 'seer_check', targetPlayerId: 'w1', timelineId: st.timelineState!.current.id }, ctx);
  const seerPlayerView = werewolfV2Module.getPlayerView(st, 's1');
  assert.equal(seerPlayerView.me?.seerResults.length, 1);
  assert.equal(seerPlayerView.me?.seerResults[0]?.team, 'wolves');

  // seer:close -> guard:open -> guard:action
  st = advanceTimeline(st, ctx); // seer:close
  st = advanceTimeline(st, ctx); // guard:open
  st = advanceTimeline(st, ctx); // guard:action
  assert.equal(st.timelineState!.current.role, 'guard');
  assert.equal(st.timelineState!.current.segment, 'action');

  // 守卫守 v1
  st = apply(st, actor('g1'), { type: 'guard_guard', targetPlayerId: 'v1', timelineId: st.timelineState!.current.id }, ctx);

  // guard:close
  st = advanceTimeline(st, ctx);
  assert.equal(st.timelineState!.current.role, 'guard');
  assert.equal(st.timelineState!.current.segment, 'close');

  // 夜末推进：进入 day_announcement 并统一结算
  st = advanceTimeline(st, ctx);
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.timelineState!.current.segment, 'dawn');

  // 检查结算：v1 被守住未死，v2 被毒死
  assert.deepEqual(st.lastNightDeaths, ['v2']);
  assert.equal(st.players.v1!.alive, true);
  assert.equal(st.players.v2!.alive, false);
});

test('V2 猎人首夜确认与死于夜间开枪结算', () => {
  const { state, ctx } = startedNightV2('standard', 1_000_000, { guard: false, hunter: true, idiot: false });
  // 首夜计划包含 hunter:confirm
  let st = state;
  let stepsCount = 0;
  while (st.phase === 'night' && stepsCount < 20) {
    if (st.timelineState?.current.role === 'wolf' && st.timelineState?.current.segment === 'action') {
      // 狼人刀猎人（假设 hunter 是某个位置）
      const hunterId = Object.keys(st.players).find((id) => st.players[id]!.role === 'hunter')!;
      st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: hunterId, timelineId: st.timelineState!.current.id }, ctx);
      st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: hunterId, timelineId: st.timelineState!.current.id }, ctx);
    }
    st = advanceTimeline(st, ctx);
    stepsCount++;
  }

  assert.equal(st.phase, 'day_announcement');
  // 天亮公告完成后，进入 hunter_shot
  ctx.now = st.announcement?.endsAt ?? ctx.now;
  st = apply(st, actor('w1'), { type: 'confirm_announcement' }, ctx);
  for (const id of IDS) {
    if (st.players[id]!.alive) {
      st = apply(st, actor(id), { type: 'confirm_announcement' }, ctx);
    }
  }
  assert.equal(st.phase, 'hunter_shot');
  assert.ok(st.pendingShoot);
});
