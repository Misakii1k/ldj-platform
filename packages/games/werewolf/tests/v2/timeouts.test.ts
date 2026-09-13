/**
 * werewolf v2 — 计时器/陈旧 token/确定性超时兜底/effects（功能清单 6）。
 * schedule_timer/cancel_timer/system_message 以 effect 描述；
 * 错误 phase/day/token 的超时一律 noop，不推进状态。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { actor, apply, reduce, skipDiscussion, startedNight, timeout, voteAll } from './helpers.ts';

const IDS = ['w1', 'w2', 's', 'x', 'v1', 'v2'];

function hasEffect(effects: readonly { type: string }[], type: string): boolean {
  return effects.some((e) => e.type === type);
}

test('v2 begin 调度 role_reveal 计时器并发出系统消息', () => {
  const state = werewolfV2Module.createInitialState(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    IDS,
    werewolfV2Module.parseConfig({}),
  );
  const out = reduce(state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.equal(out.state.deadlineAt, 1 + 30_000);
  assert.ok(out.state.phaseToken);
  assert.ok(hasEffect(out.effects, 'schedule_timer'));
  assert.ok(hasEffect(out.effects, 'system_message'));
});

test('v2 阶段推进取消旧计时器并调度新计时器', () => {
  let st = startedNight(IDS);
  // 狼刀+查验+女巫 → 结算进入 day_announcement
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  const out = reduce(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(out.state.phase, 'day_announcement');
  assert.ok(hasEffect(out.effects, 'cancel_timer'));
  assert.ok(hasEffect(out.effects, 'schedule_timer'));
  assert.equal(out.state.phaseToken, 'day_announcement:1');
});

test('v2 陈旧 phase/day/token 超时被拒（noop 不推进）', () => {
  const st = startedNight(IDS);
  const stale = werewolfV2Module.reduce(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    st,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', phase: 'night', day: 1, token: 'night:1:stale' },
  );
  assert.equal(stale.ok, true);
  if (stale.ok) {
    assert.deepEqual(stale.nextState, st);
    assert.deepEqual(stale.publicEvents, []);
    assert.deepEqual(stale.effects, []);
  }
  const wrongPhase = werewolfV2Module.reduce(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    st,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', phase: 'discussion', day: 1, token: 'discussion:1:0' },
  );
  assert.equal(wrongPhase.ok, true);
  if (wrongPhase.ok) assert.deepEqual(wrongPhase.nextState, st);
  const wrongDay = werewolfV2Module.reduce(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    st,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', phase: 'night', day: 2, token: st.phaseToken! },
  );
  assert.equal(wrongDay.ok, true);
  if (wrongDay.ok) assert.deepEqual(wrongDay.nextState, st);
});

test('v2 各阶段超时确定性兜底', () => {
  // role_reveal 超时 → 第一夜
  let st = werewolfV2Module.createInitialState(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    IDS,
    werewolfV2Module.parseConfig({}),
  );
  st = apply(st, { kind: 'system', source: 'admin' }, { type: 'begin' });
  st = timeout(st, 'role_reveal');
  assert.equal(st.phase, 'night');
  assert.equal(st.day, 1);

  // night 超时 → day_announcement（首个合法候选）
  let st2 = startedNight(IDS);
  st2 = timeout(st2, 'night');
  assert.equal(st2.phase, 'day_announcement');
  assert.equal(st2.night.killTargetId, 'w1');

  // day_announcement 超时 → discussion
  let st3 = apply(st2, actor('w1'), { type: 'confirm_announcement' });
  st3 = apply(st3, actor('w2'), { type: 'confirm_announcement' });
  st3 = apply(st3, actor('s'), { type: 'confirm_announcement' });
  st3 = apply(st3, actor('x'), { type: 'confirm_announcement' });
  st3 = apply(st3, actor('v1'), { type: 'confirm_announcement' });
  st3 = apply(st3, actor('v2'), { type: 'confirm_announcement' });
  assert.equal(st3.phase, 'last_words');
  st3 = apply(st3, actor('w1'), { type: 'finish_last_words' });
  assert.equal(st3.phase, 'discussion');

  // discussion 超时 → 下一发言者（最后发言者后进投票）
  st3 = timeout(st3, 'discussion');
  assert.equal(st3.phase, 'discussion');
  const speaker = st3.speakingOrder[st3.currentSpeakerIndex];
  assert.notEqual(speaker, st3.speakingOrder[0]);

  // voting 超时 → 结算
  let st4 = startedNight(IDS);
  st4 = apply(st4, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st4 = apply(st4, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st4 = apply(st4, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st4 = apply(st4, actor('x'), { type: 'witch_save', save: false });
  st4 = apply(st4, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st4 = skipDiscussion(st4);
  st4 = timeout(st4, 'voting');
  assert.equal(st4.lastVoteSummary?.outcome, 'no_votes');

  // hunter_shot 超时 → 视为弃权，首夜死者进遗言
  let st5 = startedNight(['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'], { roles: { guard: false, hunter: true, idiot: false } });
  st5 = apply(st5, actor('w1'), { type: 'night_kill', targetPlayerId: 'h' });
  st5 = apply(st5, actor('w2'), { type: 'night_kill', targetPlayerId: 'h' });
  st5 = apply(st5, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st5 = apply(st5, actor('x'), { type: 'witch_save', save: false });
  st5 = apply(st5, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(st5.phase, 'day_announcement');
  st5 = timeout(st5, 'day_announcement');
  assert.equal(st5.phase, 'hunter_shot');
  st5 = timeout(st5, 'hunter_shot');
  assert.equal(st5.phase, 'last_words');
  st5 = timeout(st5, 'last_words');
  assert.equal(st5.phase, 'discussion');
  assert.equal(st5.players.h?.alive, false);
});

test('v2 终局取消计时器并产出 game_finished 事件', () => {
  let st = startedNight(IDS);
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st = skipDiscussion(st);
  st = voteAll(st, 'v2');
  st = timeout(st, 'vote_result');
  const out = reduce(st, actor('v2'), { type: 'finish_last_words' });
  assert.equal(out.state.phase, 'game_over');
  assert.equal(out.state.deadlineAt, null);
  assert.equal(out.state.phaseToken, null);
  assert.ok(out.events.some((e) => (e as { type?: string }).type === 'game_finished'));
  assert.ok(hasEffect(out.effects, 'cancel_timer'));
});
