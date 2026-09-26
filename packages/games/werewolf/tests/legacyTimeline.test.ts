import { test } from 'node:test';
import assert from 'node:assert/strict';
import { werewolfModule } from '../server/module.ts';
import { werewolfV2Module } from '../server/v2/module.ts';
import type { WerewolfState } from '../server/module.ts';

type TestCtx = {
  now: number;
  random: {
    nextInt: () => number;
    shuffle: <T>(items: readonly T[]) => T[];
  };
};

const PLAYERS = ['w1', 'w2', 's1', 'x1', 'g1', 'v1', 'v2', 'v3'];

function startedLegacyTimelineNight(pace: 'fast' | 'standard' | 'relaxed' = 'standard', now = 1_000_000): { state: WerewolfState; ctx: TestCtx } {
  const ctx: TestCtx = {
    now,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
  const config = werewolfModule.parseConfig({
    rulesetId: 'werewolf_legacy_platform_v2',
    pace,
    roles: { guard: true, hunter: false, idiot: false },
  });
  let state = werewolfModule.createInitialState(ctx, PLAYERS, config);
  const beginRes = werewolfModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(beginRes.ok, true);
  state = beginRes.state;

  for (const id of PLAYERS) {
    const confirmRes = werewolfModule.reduce(ctx, state, { kind: 'player', playerId: id }, { type: 'confirm_role' });
    assert.equal(confirmRes.ok, true);
    state = confirmRes.state;
  }
  return { state, ctx };
}

function advanceLegacyTimeline(state: WerewolfState, ctx: TestCtx): WerewolfState {
  const cur = state.timelineState!.current;
  const token = state.timelineState!.activeTimerToken!;
  const endsAt = cur.endsAt!;
  ctx.now = endsAt;
  const res = werewolfModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, {
    type: 'timeline_timeout',
    timelineId: cur.id,
    token,
  });
  assert.equal(res.ok, true);
  return res.state;
}

test('legacy werewolf: 新局进入夜晚启动时间线并精确匹配 pace 窗口', () => {
  const { state, ctx } = startedLegacyTimelineNight('fast', 1_000_000);
  assert.equal(state.phase, 'night');
  assert.ok(state.timelineState);
  assert.equal(state.timelineState.current.segment, 'intro');
  assert.equal(state.timelineState.current.endsAt, 1_000_000 + 1700);

  let st = advanceLegacyTimeline(state, ctx); // intro -> wolf:open
  assert.equal(st.timelineState!.current.role, 'wolf');
  assert.equal(st.timelineState!.current.segment, 'open');

  st = advanceLegacyTimeline(st, ctx); // wolf:open -> wolf:action
  assert.equal(st.timelineState!.current.role, 'wolf');
  assert.equal(st.timelineState!.current.segment, 'action');
  assert.equal(st.timelineState!.current.endsAt! - st.timelineState!.current.startedAt, 22000); // fast wolf: 20s
});

test('legacy werewolf 与 V2 对比：相同配置产生相同公共时间线，但夜刀目标规则保持自身独立', () => {
  const { state: legacyState, ctx: legacyCtx } = startedLegacyTimelineNight('standard', 1_000_000);

  // V2 同样参数
  const v2Config = werewolfV2Module.parseConfig({
    pace: 'standard',
    roles: { guard: true, hunter: false, idiot: false },
  });
  let v2State = werewolfV2Module.createInitialState(legacyCtx, PLAYERS, v2Config);
  const beginRes = werewolfV2Module.reduce(legacyCtx, v2State, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(beginRes.ok, true);
  v2State = (beginRes as { ok: true; nextState: typeof v2State }).nextState;
  for (const id of PLAYERS) {
    const confirmRes = werewolfV2Module.reduce(legacyCtx, v2State, { kind: 'player', playerId: id }, { type: 'confirm_role' });
    assert.equal(confirmRes.ok, true);
    v2State = (confirmRes as { ok: true; nextState: typeof v2State }).nextState;
  }

  // 1. 公共时间线在首夜 intro 处结构完全一致
  const legacyPub = werewolfModule.getSpectatorView(legacyState);
  const v2Pub = werewolfV2Module.getSpectatorView(v2State);
  assert.deepEqual(
    { role: legacyPub.timeline?.role, segment: legacyPub.timeline?.segment, cue: legacyPub.timeline?.cue },
    { role: v2Pub.timeline?.role, segment: v2Pub.timeline?.segment, cue: v2Pub.timeline?.cue },
  );

  // 推进到 wolf:action
  let legSt = advanceLegacyTimeline(legacyState, legacyCtx);
  legSt = advanceLegacyTimeline(legSt, legacyCtx);

  // 2. 规则差异：legacy 下狼人不能自刀（non_wolf 语义），而 open-kill v2 允许自刀
  const legacySelfKill = werewolfModule.reduce(legacyCtx, legSt, { kind: 'player', playerId: 'w1' }, {
    type: 'night_kill',
    targetPlayerId: 'w1',
    timelineId: legSt.timelineState!.current.id,
  });
  assert.equal(legacySelfKill.ok, false); // legacy 必须拒绝自刀！
});

test('legacy werewolf: 早交不提前、死亡角色不省时、夜末统一结算', () => {
  const { state, ctx } = startedLegacyTimelineNight('standard', 1_000_000);
  let st = advanceLegacyTimeline(state, ctx); // intro -> wolf:open
  st = advanceLegacyTimeline(st, ctx); // wolf:open -> wolf:action

  // 狼人刀 v1
  const kill1 = werewolfModule.reduce(ctx, st, { kind: 'player', playerId: 'w1' }, {
    type: 'night_kill',
    targetPlayerId: 'v1',
    timelineId: st.timelineState!.current.id,
  });
  assert.equal(kill1.ok, true);
  st = kill1.state;

  const kill2 = werewolfModule.reduce(ctx, st, { kind: 'player', playerId: 'w2' }, {
    type: 'night_kill',
    targetPlayerId: 'v1',
    timelineId: st.timelineState!.current.id,
  });
  assert.equal(kill2.ok, true);
  st = kill2.state;

  // 全狼已交，但时间线未提前推进
  assert.equal(st.phase, 'night');
  assert.equal(st.timelineState!.current.segment, 'action');

  // 未到期时间提前推进被拒绝 (noop)
  const tooEarly = werewolfModule.reduce(ctx, st, { kind: 'system', source: 'admin' }, {
    type: 'timeline_timeout',
    timelineId: st.timelineState!.current.id,
    token: st.timelineState!.activeTimerToken!,
  });
  assert.equal(tooEarly.ok, true);
  assert.equal(tooEarly.state.timelineState!.stepIndex, st.timelineState!.stepIndex);

  // 一路推进至夜末，统一进入天亮公告
  while (st.phase === 'night') {
    st = advanceLegacyTimeline(st, ctx);
  }
  assert.equal(st.phase, 'day_announcement');
  assert.deepEqual(st.lastNightDeaths, ['v1']);
});
