/**
 * werewolf v2 — 玩家/观战视角遮滤与终局 reveal（功能清单 7）。
 * 狼队友可见性、预言家历史、女巫受害者/药水、守卫目标均为私有；
 * 观战视角保持遮滤直至终局 reveal。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { actor, apply, startedNight, timeout } from './helpers.ts';

const IDS = ['w1', 'w2', 's', 'x', 'v1', 'v2'];

function nightMid() {
  let st = startedNight(IDS);
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  return st;
}

test('v2 观战视角全程遮滤角色，终局 reveal', () => {
  let st = nightMid();
  const spectator = werewolfV2Module.getSpectatorView(st);
  assert.ok(spectator.players.every((p) => p.revealedRole === null));
  assert.equal(spectator.reveal, null);
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  st = apply(st, actor('w1'), { type: 'confirm_announcement' });
  st = apply(st, actor('w2'), { type: 'confirm_announcement' });
  st = apply(st, actor('s'), { type: 'confirm_announcement' });
  st = apply(st, actor('x'), { type: 'confirm_announcement' });
  st = apply(st, actor('v2'), { type: 'confirm_announcement' });
  st = apply(st, actor('v1'), { type: 'confirm_announcement' });
  // 首夜死者 v1 发表遗言
  assert.equal(st.phase, 'last_words');
  // B10: 局中 exitReason 对观战者遮滤为 null
  const midSpectator = werewolfV2Module.getSpectatorView(st);
  assert.equal(midSpectator.players.find((p) => p.playerId === 'v1')?.exitReason, null);
  st = apply(st, actor('v1'), { type: 'finish_last_words' });
  for (const id of [...st.speakingOrder]) {
    if (!st.players[id]?.alive) continue;
    st = apply(st, actor(id), { type: 'finish_speech' });
  }
  if (st.phase === 'free_discussion') {
    for (const id of Object.keys(st.players).filter((i) => st.players[i]?.alive)) {
      st = apply(st, actor(id), { type: 'ready_vote' });
    }
  }
  const votes: Array<[string, string | null]> = [
    ['w1', 'v2'], ['w2', 'v2'], ['s', 'v2'], ['x', 'v2'], ['v2', 'w1'],
  ];
  for (const [from, target] of votes) st = apply(st, actor(from), { type: 'day_vote', targetPlayerId: target });
  st = timeout(st, 'vote_result');
  st = apply(st, actor('v2'), { type: 'finish_last_words' });
  assert.equal(st.phase, 'game_over');
  const finalSpectator = werewolfV2Module.getSpectatorView(st);
  // 终局揭示 exitReason
  assert.equal(finalSpectator.players.find((p) => p.playerId === 'v1')?.exitReason, 'night_kill');
  assert.equal(finalSpectator.reveal?.roles.w1, 'wolf');
  assert.equal(finalSpectator.reveal?.roles.v2, 'villager');
  assert.ok(finalSpectator.reveal?.voteHistory.length >= 1);
  assert.equal(finalSpectator.winner, 'wolves');
});

test('v2 狼队友/击杀票仅存活的狼可见', () => {
  const st = nightMid();
  const wolfView = werewolfV2Module.getPlayerView(st, 'w1').me;
  assert.deepEqual(wolfView?.wolfTeammateIds, ['w2']);
  assert.deepEqual(wolfView?.wolfVotes, { w1: 'v1', w2: 'v1' });
  assert.equal(wolfView?.hasNightVoted, true);
  assert.equal(werewolfV2Module.getPlayerView(st, 's').me?.wolfTeammateIds?.length, 0);
  assert.equal(werewolfV2Module.getPlayerView(st, 'x').me?.wolfVotes ? Object.keys(werewolfV2Module.getPlayerView(st, 'x').me!.wolfVotes).length : 0, 0);
  // 死亡狼人视角遮滤队友信息
  const dead = structuredClone(st);
  dead.players.w1!.alive = false;
  const deadWolf = werewolfV2Module.getPlayerView(dead, 'w1').me;
  assert.deepEqual(deadWolf?.wolfTeammateIds, []);
  assert.deepEqual(deadWolf?.wolfVotes, {});
  assert.equal(deadWolf?.hasNightVoted, false);
});

test('v2 预言家历史/女巫受害者与药水/守卫目标私有', () => {
  const st = nightMid();
  const seer = werewolfV2Module.getPlayerView(st, 's').me;
  assert.equal(seer?.seerResults.length, 1);
  assert.equal(seer?.seerResults[0]?.team, 'wolves');
  const witch = werewolfV2Module.getPlayerView(st, 'x').me;
  assert.equal(witch?.nightVictimId, 'v1');
  // 非预言家看不到查验历史；非女巫看不到受害者
  const wolf = werewolfV2Module.getPlayerView(st, 'w1').me;
  assert.equal(wolf?.seerResults.length, 0);
  assert.equal(wolf?.nightVictimId, null);
  assert.equal(werewolfV2Module.getPlayerView(st, 'v1').me?.nightVictimId, null);

  // 守卫目标私有
  const guarded = startedNight(['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'], {
    roles: { guard: true, hunter: false, idiot: false },
  });
  let g2 = apply(guarded, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  g2 = apply(g2, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  g2 = apply(g2, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  g2 = apply(g2, actor('x'), { type: 'witch_save', save: false });
  g2 = apply(g2, actor('g'), { type: 'guard_guard', targetPlayerId: 'v2' });
  assert.equal(werewolfV2Module.getPlayerView(g2, 'g').me?.guardTargetId, 'v2');
  assert.equal(werewolfV2Module.getPlayerView(g2, 'v2').me?.guardTargetId, null);
  assert.equal(werewolfV2Module.getPlayerView(g2, 'w1').me?.guardTargetId, null);
  assert.equal(werewolfV2Module.getSpectatorView(g2).players.find((p) => p.playerId === 'g')?.revealedRole, null);
});

test('v2 视角 me 信息对请求者一致且 canAct 正确', () => {
  const st = nightMid();
  const me = werewolfV2Module.getPlayerView(st, 'w1').me;
  assert.equal(me?.playerId, 'w1');
  assert.equal(me?.role, 'wolf');
  assert.equal(me?.canAct, false); // 已投票
  const seerMe = werewolfV2Module.getPlayerView(st, 's').me;
  assert.equal(seerMe?.canAct, false); // 已查验
  assert.equal(werewolfV2Module.getPlayerView(st, 'x').me?.canAct, true); // 女巫待决策
  const outsider = werewolfV2Module.getPlayerView(st, 'nobody').me;
  assert.equal(outsider, null);
});

test('v2 视角包含 nightStage 且单调推进：wolf -> witch -> seer -> guard -> done', () => {
  const ids = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];
  let st = startedNight(ids, { roles: { guard: true, hunter: false, idiot: false } });
  // 刚入夜，狼人未完成投票
  assert.equal(werewolfV2Module.getSpectatorView(st).nightStage, 'wolf');
  // 狼人完成投票
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  assert.equal(werewolfV2Module.getSpectatorView(st).nightStage, 'witch');
  // 女巫完成用药
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(werewolfV2Module.getSpectatorView(st).nightStage, 'seer');
  // 预言家完成查验
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  assert.equal(werewolfV2Module.getSpectatorView(st).nightStage, 'guard');
  // 守卫完成守护
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v2' });
  // 所有人完成，进入天亮公告
  assert.equal(st.phase, 'day_announcement');
});
