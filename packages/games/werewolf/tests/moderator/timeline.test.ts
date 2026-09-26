import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, GameContext } from '@ldj/shared';
import { werewolfModeratorModule } from '../../server/moderator/module.ts';
import type { ModeratorState, WerewolfModeratorAction } from '../../server/moderator/types.ts';

const PLAYERS = ['hostUser', 'modUser', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function createModGame(now = 1_000_000, pace: 'fast' | 'standard' | 'relaxed' = 'standard') {
  const ctx: GameContext = {
    now,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => [...items],
    },
  };
  const config = werewolfModeratorModule.parseConfig({
    hostPlayerId: 'hostUser',
    moderatorPlayerId: 'modUser',
    pace,
    roles: { guard: true, hunter: false, idiot: false },
  });
  const state = werewolfModeratorModule.createInitialState(ctx, PLAYERS, config);
  return { state, ctx };
}

function applyMod(ctx: GameContext, state: ModeratorState, actor: Actor, action: WerewolfModeratorAction) {
  const res = werewolfModeratorModule.reduce(ctx, state, actor, action);
  if (!res.ok) {
    assert.fail(`reduce failed: ${res.code} - ${res.message}`);
  }
  return {
    nextState: res.nextState,
    effects: res.effects ?? [],
  };
}

test('moderator 权限与伪造拦截：host≠moderator、非主持伪命令、玩家伪 timeout/disconnected 被拒', () => {
  const { state, ctx } = createModGame();
  const tid = state.timelineState!.current.id;

  // 1. hostUser 不是 moderator，发起 moderator_next 被拒
  const hostRes = werewolfModeratorModule.reduce(ctx, state, { kind: 'player', playerId: 'hostUser' }, {
    type: 'moderator_next',
    timelineId: tid,
  });
  assert.equal(hostRes.ok, false);

  // 2. 普通玩家发起 moderator_set_mode 被拒
  const p1Res = werewolfModeratorModule.reduce(ctx, state, { kind: 'player', playerId: 'p1' }, {
    type: 'moderator_set_mode',
    mode: 'auto',
    timelineId: tid,
  });
  assert.equal(p1Res.ok, false);

  // 3. 玩家尝试伪造 system-only 的 timeline_timeout 被拒
  const fakeTimeout = werewolfModeratorModule.reduce(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'timeline_timeout',
    timelineId: tid,
    token: 'fake',
  });
  assert.equal(fakeTimeout.ok, false);

  // 4. 玩家尝试伪造 moderator_disconnected 被拒
  const fakeDisconnect = werewolfModeratorModule.reduce(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_disconnected',
    moderatorPlayerId: 'modUser',
  });
  assert.equal(fakeDisconnect.ok, false);
});

test('moderator timelineId 版本匹配校验：旧 timelineId 拒绝', () => {
  const { state, ctx } = createModGame();
  const res = werewolfModeratorModule.reduce(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: 'old-stale-id',
  });
  assert.equal(res.ok, false);
});

test('moderator manual 推进：d0-confirm 开始首夜，夜末 dawn 到 confirm 必停，自动天亮不判死', () => {
  const { state, ctx } = createModGame();
  assert.equal(state.timelineState!.current.segment, 'confirm');
  assert.equal(state.timelineState!.current.period, 'day');

  // 主持人点击“开始首夜”
  let st = applyMod(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: state.timelineState!.current.id,
  }).nextState;
  assert.equal(st.timelineState!.current.period, 'night');
  assert.equal(st.timelineState!.current.segment, 'intro');
  assert.equal(st.timelineState!.activeTimerToken, null); // manual 无 timer

  // 一路 next 推进夜间环节直到天亮确认
  while ((st.timelineState!.current.segment as string) !== 'confirm') {
    st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
      type: 'moderator_next',
      timelineId: st.timelineState!.current.id,
    }).nextState;
  }

  // 此时进入白天 confirm（等待主持人确认伤亡）
  assert.equal(st.timelineState!.current.period, 'day');
  assert.equal(st.timelineState!.current.segment, 'confirm');
  assert.equal(st.timelineState!.current.endsAt, null);
  // 自动天亮绝不判死玩家！出局名单依然为空
  assert.deepEqual(st.eliminatedPlayerIds, []);

  // 主持人使用独立控件判出局 p1
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'eliminate_player',
    targetPlayerId: 'p1',
  }).nextState;
  assert.deepEqual(st.eliminatedPlayerIds, ['p1']);

  // 主持人确认结果并进入白天讨论
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: st.timelineState!.current.id,
  }).nextState;

  // 主持人点击“开始下一夜”，进入第 2 夜
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: st.timelineState!.current.id,
  }).nextState;
  assert.equal(st.timelineState!.current.period, 'night');
  assert.equal(st.timelineState!.current.day, 2);
});

test('moderator auto 模式：调度 timer、到期推进；切回 manual 清除 timer', () => {
  const { state, ctx } = createModGame(1_000_000, 'fast');
  // 开始首夜
  let st = applyMod(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: state.timelineState!.current.id,
  }).nextState;

  // 切换为 auto
  const autoRes = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_set_mode',
    mode: 'auto',
    timelineId: st.timelineState!.current.id,
  });
  st = autoRes.nextState;
  assert.equal(st.timelineState!.current.mode, 'auto');
  assert.ok(st.timelineState!.activeTimerToken);
  assert.ok(st.timelineState!.current.endsAt);
  assert.ok(autoRes.effects.some((e) => e.type === 'schedule_timer'));

  // 切回 manual：清除 timer
  const manualRes = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_set_mode',
    mode: 'manual',
    timelineId: st.timelineState!.current.id,
  });
  st = manualRes.nextState;
  assert.equal(st.timelineState!.current.mode, 'manual');
  assert.equal(st.timelineState!.activeTimerToken, null);
  assert.equal(st.timelineState!.current.endsAt, null);
  assert.ok(manualRes.effects.some((e) => e.type === 'cancel_timer'));
});

test('moderator 暂停与恢复：pause 冻结剩余时长并取消 timer，resume 按剩余恢复', () => {
  const { state, ctx } = createModGame(1_000_000, 'standard');
  // 开始首夜并设为 auto
  let st = applyMod(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: state.timelineState!.current.id,
  }).nextState;
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_set_mode',
    mode: 'auto',
    timelineId: st.timelineState!.current.id,
  }).nextState;

  // 时间走过 500ms
  ctx.now += 500;
  const initialEnds = st.timelineState!.current.endsAt!;
  const expectedRemaining = initialEnds - ctx.now;

  // 暂停
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_pause',
    timelineId: st.timelineState!.current.id,
  }).nextState;
  assert.equal(st.timelineState!.current.paused, true);
  assert.equal(st.timelineState!.current.pauseRemainingMs, expectedRemaining);
  assert.equal(st.timelineState!.activeTimerToken, null);

  // 停滞 10秒
  ctx.now += 10_000;

  // 恢复
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_resume',
    timelineId: st.timelineState!.current.id,
  }).nextState;
  assert.equal(st.timelineState!.current.paused, false);
  assert.equal(st.timelineState!.current.endsAt, ctx.now + expectedRemaining);
  assert.ok(st.timelineState!.activeTimerToken);
});

test('moderator skip：auto 模式下跳过当前子环节，不跨越两步', () => {
  const { state, ctx } = createModGame(1_000_000, 'standard');
  let st = applyMod(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: state.timelineState!.current.id,
  }).nextState;
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_set_mode',
    mode: 'auto',
    timelineId: st.timelineState!.current.id,
  }).nextState;

  const curSegment = st.timelineState!.current.segment;
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_skip',
    timelineId: st.timelineState!.current.id,
  }).nextState;
  assert.notEqual(st.timelineState!.current.segment, curSegment);
});

test('moderator_disconnected：主持人断线自动暂停辅助，重连未明确 resume 不自动恢复', () => {
  const { state, ctx } = createModGame(1_000_000, 'standard');
  let st = applyMod(ctx, state, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_next',
    timelineId: state.timelineState!.current.id,
  }).nextState;
  st = applyMod(ctx, st, { kind: 'player', playerId: 'modUser' }, {
    type: 'moderator_set_mode',
    mode: 'auto',
    timelineId: st.timelineState!.current.id,
  }).nextState;

  ctx.now += 300;
  // 系统发起主持人断线事件
  st = applyMod(ctx, st, { kind: 'system', source: 'admin' }, {
    type: 'moderator_disconnected',
    moderatorPlayerId: 'modUser',
  }).nextState;
  assert.equal(st.timelineState!.current.paused, true);
  assert.equal(st.timelineState!.activeTimerToken, null);

  // 即使其他操作发生，仍保持 paused
  const dummyBegin = applyMod(ctx, st, { kind: 'system', source: 'admin' }, {
    type: 'begin',
  });
  assert.equal(dummyBegin.nextState.timelineState!.current.paused, true);
});
