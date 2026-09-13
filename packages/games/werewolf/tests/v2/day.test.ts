/**
 * werewolf v2 — 白天流程与胜负（功能清单 4、5）。
 * 公告→发言→投票→加赛→结果→遗言→下一夜；白痴翻牌免死失投票权；
 * 猎人放逐开枪；numbers/roles 胜负；forfeit/aborted。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { actor, aliveIds, apply, deny, reduce, skipDiscussion, startedNight, timeout, voteAll } from './helpers.ts';

const IDS6 = ['w1', 'w2', 's', 'x', 'v1', 'v2'];
const IDS7 = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];

function dayAfterNight(config: Record<string, unknown> = {}) {
  let st = startedNight(IDS6, config);
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(st.phase, 'day_announcement');
  return st;
}

test('v2 公告确认→发言顺序→投票→结果→遗言→终局（numbers 狼胜）', () => {
  let st = dayAfterNight();
  for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'confirm_announcement' });
  assert.equal(st.phase, 'last_words');
  assert.equal(st.lastWordsPlayerId, 'v1');
  st = apply(st, actor('v1'), { type: 'finish_last_words' });
  assert.equal(st.phase, 'discussion');
  const order = [...st.speakingOrder];
  for (const id of order) st = apply(st, actor(id), { type: 'finish_speech' });
  assert.equal(st.phase, 'free_discussion');
  for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'ready_vote' });
  assert.equal(st.phase, 'voting');
  const votes: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 'v2'], ['s', 'v2'], ['x', 'v2'], ['v2', 'w1'],
  ];
  for (const [from, target] of votes) st = apply(st, actor(from), { type: 'day_vote', targetPlayerId: target });
  assert.equal(st.phase, 'vote_result');
  assert.equal(st.lastVoteSummary?.eliminatedPlayerId, 'v2');
  assert.equal(st.players.v2?.alive, false);
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'last_words');
  assert.equal(st.lastWordsPlayerId, 'v2');
  const finished = reduce(st, actor('v2'), { type: 'finish_last_words' });
  assert.equal(finished.state.phase, 'game_over');
  assert.equal(finished.state.winner, 'wolves');
  assert.deepEqual(finished.resultCandidate, {
    winner: 'wolves', days: 1, aborted: false,
    roles: { w1: 'wolf', w2: 'wolf', s: 'seer', x: 'witch', v1: 'villager', v2: 'villager' },
  });
});

test('v2 平票进入加赛；加赛平票进入下一夜', () => {
  let st = dayAfterNight();
  for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'confirm_announcement' });
  st = apply(st, actor('v1'), { type: 'finish_last_words' });
  for (const id of [...st.speakingOrder]) st = apply(st, actor(id), { type: 'finish_speech' });
  assert.equal(st.phase, 'free_discussion');
  for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'ready_vote' });
  assert.equal(st.phase, 'voting');
  const normal: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 's'], ['s', 'v2'], ['x', 's'], ['v2', 'w1'],
  ];
  for (const [from, target] of normal) st = apply(st, actor(from), { type: 'day_vote', targetPlayerId: target });
  assert.equal(st.lastVoteSummary?.outcome, 'tie');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'runoff_voting');
  // B9: 加赛候选人 v2, s 不参与投票，投票被拒
  deny(st, actor('v2'), { type: 'day_vote', targetPlayerId: 's' });
  deny(st, actor('s'), { type: 'day_vote', targetPlayerId: null });
  // 仅非候选人 w1, w2, x 投票
  const runoff: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 's'], ['x', null],
  ];
  for (const [from, target] of runoff) st = apply(st, actor(from), { type: 'day_vote', targetPlayerId: target });
  assert.equal(st.lastVoteSummary?.outcome, 'runoff_tie');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');
  assert.equal(st.players.v2?.alive, true);
});

test('v2 白痴被放逐翻牌免死、失投票权、不可被投、无遗言', () => {
  const ids = ['w1', 'w2', 's', 'x', 'i', 'v1', 'v2'];
  let st = startedNight(ids, { roles: { guard: false, hunter: false, idiot: true } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st = skipDiscussion(st);
  st = voteAll(st, 'i');
  assert.equal(st.lastVoteSummary?.outcome, 'idiot_saved');
  assert.equal(st.players.i?.alive, true);
  assert.equal(st.players.i?.idiotRevealed, true);
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');
  deny(st, actor('i'), { type: 'day_vote', targetPlayerId: 'w1' });
  // 推进到第二天投票阶段，翻牌白痴不可被投
  let st2 = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v2' });
  st2 = apply(st2, actor('w2'), { type: 'night_kill', targetPlayerId: 'v2' });
  st2 = apply(st2, actor('s'), { type: 'seer_check', targetPlayerId: 'w2' });
  st2 = apply(st2, actor('x'), { type: 'witch_save', save: false });
  st2 = apply(st2, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st2 = skipDiscussion(st2);
  deny(st2, actor('v2'), { type: 'day_vote', targetPlayerId: 'i' });
  assert.equal(werewolfV2Module.getPlayerView(st2, 'i').me?.hasVoted, false);
});

test('v2 猎人放逐开枪：开枪无遗言直进下一夜，弃权走遗言', () => {
  let st = startedNight(IDS7, { roles: { guard: false, hunter: true, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st = skipDiscussion(st);
  st = voteAll(st, 'h');
  assert.equal(st.phase, 'vote_result');
  assert.equal(st.lastVoteSummary?.eliminatedPlayerId, 'h');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'hunter_shot');
  assert.equal(st.players.h?.alive, false);
  assert.equal(st.players.h?.exitReason, 'voted_out');
  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: 'w1' });
  assert.equal(st.players.w1?.alive, false);
  assert.equal(st.phase, 'night');

  let st2 = startedNight(IDS7, { roles: { guard: false, hunter: true, idiot: false } });
  st2 = apply(st2, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st2 = apply(st2, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st2 = apply(st2, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st2 = apply(st2, actor('x'), { type: 'witch_save', save: false });
  st2 = apply(st2, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st2 = skipDiscussion(st2);
  st2 = voteAll(st2, 'h');
  assert.equal(st2.phase, 'vote_result');
  st2 = timeout(st2, 'vote_result');
  assert.equal(st2.phase, 'hunter_shot');
  st2 = apply(st2, actor('h'), { type: 'hunter_shoot', targetPlayerId: null });
  assert.equal(st2.phase, 'last_words');
  assert.equal(st2.lastWordsPlayerId, 'h');
});

test('v2 roles 胜负：神职全灭即狼胜（numbers 下继续）', () => {
  const build = (winCondition: 'numbers' | 'roles') => {
    let st = startedNight(['w1', 'w2', 's', 'x', 'v1', 'v2', 'v3', 'v4'], {
      winCondition,
      roles: { guard: false, hunter: false, idiot: false },
    });
    st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
    st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
    st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
    st = apply(st, actor('x'), { type: 'witch_save', save: false });
    st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
    st = skipDiscussion(st);
    st.players.s!.alive = false;
    st.players.x!.alive = false;
    // 与 legacy 参考场景一致：放逐狼人 w1，留下 1 狼 vs 3 好人
    // （numbers 按人数继续；roles 因神职全灭判狼胜）。
    st = voteAll(st, 'w1');
    st = timeout(st, 'vote_result');
    return st;
  };
  const roles = build('roles');
  assert.equal(roles.phase, 'last_words');
  const afterRoles = apply(roles, actor('w1'), { type: 'finish_last_words' });
  assert.equal(afterRoles.phase, 'game_over');
  assert.equal(afterRoles.winner, 'wolves');
  const nums = build('numbers');
  assert.equal(nums.phase, 'last_words');
  const afterNums = apply(nums, actor('w1'), { type: 'finish_last_words' });
  assert.equal(afterNums.phase, 'night');
  assert.equal(afterNums.winner, null);
});

test('v2 全部弃权进入下一夜（no_votes）', () => {
  let st = dayAfterNight();
  st = skipDiscussion(st);
  st = voteAll(st, null);
  assert.equal(st.lastVoteSummary?.outcome, 'no_votes');
  assert.equal(st.players.v2?.alive, true);
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');
});

test('v2 forfeit：弃权即出局，全员弃权对局中止', () => {
  let st = dayAfterNight();
  st = apply(st, { kind: 'system', source: 'admin' }, { type: 'player_forfeited', playerIds: ['w1'] });
  assert.equal(st.players.w1?.alive, false);
  assert.equal(st.players.w1?.forfeited, true);
  // 全部玩家弃权 → aborted
  const remaining = aliveIds(st);
  st = apply(st, { kind: 'system', source: 'admin' }, { type: 'player_forfeited', playerIds: remaining });
  assert.equal(st.phase, 'game_over');
  assert.equal(st.winner, null);
  assert.equal(st.aborted, true);
});

test('v2 终局后拒绝一切玩家动作', () => {
  let st = dayAfterNight();
  st = skipDiscussion(st);
  st = voteAll(st, 'v2');
  st = timeout(st, 'vote_result');
  st = apply(st, actor('v2'), { type: 'finish_last_words' });
  assert.equal(st.phase, 'game_over');
  deny(st, actor('w1'), { type: 'night_kill', targetPlayerId: 's' });
});
