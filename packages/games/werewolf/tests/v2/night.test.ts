/**
 * werewolf v2 — 夜夜行动与结算（功能清单 3）。
 * wolfKillScope=any：狼人可以投任意存活玩家（含自己与同伴）；
 * 女巫解药/毒药/自救约束；守卫禁自守/禁连守；猎人夜死触发开枪、毒死不触发；
 * 夜晚超时确定性兜底。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { IDENTITY_CTX, actor, apply, byRole, deny, startedNight, timeout } from './helpers.ts';

const IDS = ['w1', 'w2', 's', 'x', 'g', 'v1', 'v2', 'v3'];

/** 完成狼刀+查验+女巫不用解药；女巫毒药与守卫由调用方决定 */
function nightBase(
  killTarget: string,
  guardTarget: string | null = null,
  poisonTarget: string | null = null,
  guardEnabled = true,
) {
  let st = startedNight(IDS, { roles: { guard: guardEnabled, hunter: false, idiot: false } });
  for (const wolf of byRole(st, 'wolf')) st = apply(st, actor(wolf), { type: 'night_kill', targetPlayerId: killTarget });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: killTarget });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  if (guardEnabled) st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: guardTarget });
  if (poisonTarget !== null) st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: poisonTarget });
  else st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  return st;
}

test('v2 any：狼人可自刀并正常结算', () => {
  let st = startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'w1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'w1' });
  assert.equal(st.night.killTargetId, 'w1');
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  assert.equal(werewolfV2Module.getPlayerView(st, 'x').me?.nightVictimId, 'w1');
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.players.w1?.alive, false);
  assert.equal(st.players.w1?.exitReason, 'night_kill');
  assert.deepEqual(st.lastNightDeaths, ['w1']);
});

test('v2 any：狼人可刀同伴，平票按座位确定', () => {
  let st = startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'w2' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v2' });
  // w2 座位 1、v2 座位 6：一票对一票时取座位较小者
  assert.equal(st.night.killTargetId, 'w2');
});

test('v2 any：女巫解药可救回被自刀的狼人', () => {
  let st = startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'w1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'w1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'v1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: true });
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.players.w1?.alive, true);
  assert.deepEqual(st.lastNightDeaths, []);
});

test('v2 女巫自救受 witchSelfSave 约束', () => {
  const runSelfSave = (witchSelfSave: 'first_night' | 'never' | 'always') => {
    let st = startedNight(IDS, { witchSelfSave, roles: { guard: false, hunter: false, idiot: false } });
    st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'x' });
    st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'x' });
    st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
    return werewolfV2Module.reduce(IDENTITY_CTX, st, actor('x'), { type: 'witch_save', save: true });
  };
  assert.equal(runSelfSave('always').ok, true);
  assert.equal(runSelfSave('first_night').ok, true);
  assert.equal(runSelfSave('never').ok, false);
});

test('v2 女巫不能同时使用解药和毒药；解药毒药各一次', () => {
  let st = startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: true });
  assert.equal(st.night.witchPoisonDecided, true);
  deny(st, actor('x'), { type: 'witch_poison', targetPlayerId: 'v2' });
  deny(st, actor('x'), { type: 'witch_poison', targetPlayerId: 'x' });
});

test('v2 守卫可自守、禁连守、可守下狼刀目标', () => {
  let st = startedNight(IDS, { roles: { guard: true, hunter: false, idiot: false } });
  assert.equal(st.players.g?.role, 'guard');
  // 允许自守
  const probe = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'g' });
  assert.equal(probe.night.guardTargetId, 'g');
  // 实测守护 w2
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'w2' });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'w2' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'w2' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'v2' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.players.w2?.alive, true);
  assert.deepEqual(st.lastNightDeaths, []);

  // 第二夜禁连守
  st = timeout(st, 'day_announcement');
  let st2 = st;
  for (const id of Object.keys(st2.players).filter((i) => st2.players[i]?.alive)) {
    st2 = apply(st2, actor(id), { type: 'confirm_announcement' });
  }
  for (const id of [...st2.speakingOrder]) st2 = apply(st2, actor(id), { type: 'finish_speech' });
  if (st2.phase === 'free_discussion') {
    for (const id of Object.keys(st2.players).filter((i) => st2.players[i]?.alive)) {
      st2 = apply(st2, actor(id), { type: 'ready_vote' });
    }
  }
  assert.equal(st2.phase, 'voting');
  for (const id of Object.keys(st2.players).filter((i) => st2.players[i]?.alive)) {
    if (st2.players[id]?.idiotRevealed) continue;
    st2 = apply(st2, actor(id), { type: 'day_vote', targetPlayerId: null });
  }
  assert.equal(st2.phase, 'vote_result');
  st2 = timeout(st2, 'vote_result');
  assert.equal(st2.phase, 'night');
  deny(st2, actor('g'), { type: 'guard_guard', targetPlayerId: 'w2' });
  st2 = apply(st2, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  assert.equal(st2.night.guardTargetId, 'v1');
});

test('v2 守卫挡不住女巫毒药', () => {
  const st = nightBase('v1', 'v1', 'v1');
  assert.equal(st.phase, 'day_announcement');
  assert.deepEqual(st.lastNightDeaths, ['v1']);
  assert.equal(st.players.v1?.exitReason, 'poisoned');
});

test('v2 猎人在夜死触发开枪阶段；毒死不触发；开枪/弃权/超时', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  // 夜刀猎人 → hunter_shot
  let st = startedNight(ids, { roles: { guard: false, hunter: true, idiot: false } });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'h' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'h' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: false });
  st = apply(st, actor('x'), { type: 'witch_poison', targetPlayerId: null });
  // 夜刀猎人 → 先进入天亮公告 day_announcement，公告后触发 hunter_shot
  assert.equal(st.phase, 'day_announcement');
  assert.equal(st.pendingShoot, 'h');
  st = timeout(st, 'day_announcement');
  assert.equal(st.phase, 'hunter_shot');
  assert.equal(st.pendingShoot, 'h');
  deny(st, actor('w1'), { type: 'hunter_shoot', targetPlayerId: 'h' });
  st = apply(st, actor('h'), { type: 'hunter_shoot', targetPlayerId: 'w2' });
  assert.equal(st.players.w2?.alive, false);
  assert.equal(st.phase, 'last_words');
  st = apply(st, actor('h'), { type: 'finish_last_words' });
  assert.equal(st.phase, 'discussion');

  // 毒死猎人 → 不触发开枪
  let st2 = startedNight(ids, { roles: { guard: false, hunter: true, idiot: false } });
  st2 = apply(st2, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st2 = apply(st2, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st2 = apply(st2, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st2 = apply(st2, actor('x'), { type: 'witch_save', save: false });
  st2 = apply(st2, actor('x'), { type: 'witch_poison', targetPlayerId: 'h' });
  assert.equal(st2.phase, 'day_announcement');
  assert.equal(st2.players.h?.exitReason, 'poisoned');
  assert.equal(st2.pendingShoot, null);

  // 刀中同时被毒死 → 女巫毒药优先级压制，猎人技能被封印不可开枪
  let st3 = startedNight(ids, { roles: { guard: false, hunter: true, idiot: false } });
  st3 = apply(st3, actor('w1'), { type: 'night_kill', targetPlayerId: 'h' });
  st3 = apply(st3, actor('w2'), { type: 'night_kill', targetPlayerId: 'h' });
  st3 = apply(st3, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st3 = apply(st3, actor('x'), { type: 'witch_save', save: false });
  st3 = apply(st3, actor('x'), { type: 'witch_poison', targetPlayerId: 'h' });
  assert.equal(st3.phase, 'day_announcement');
  assert.equal(st3.players.h?.exitReason, 'poisoned');
  assert.equal(st3.pendingShoot, null);
});

test('v2 女巫使用解药后后续夜晚无法获知死者（nightVictimId 为 null）', () => {
  const ids = ['w1', 'w2', 's', 'x', 'h', 'v1', 'v2'];
  let st = startedNight(ids, { roles: { guard: false, hunter: true, idiot: false } });
  // 首夜女巫使用解药救人
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  st = apply(st, actor('x'), { type: 'witch_save', save: true });
  assert.equal(st.witchSaveUsed, true);
  // 进入白天并推进到第二夜
  st = timeout(st, 'day_announcement');
  st = apply(st, actor('w1'), { type: 'finish_speech' });
  st = apply(st, actor('w2'), { type: 'finish_speech' });
  st = apply(st, actor('s'), { type: 'finish_speech' });
  st = apply(st, actor('x'), { type: 'finish_speech' });
  st = apply(st, actor('h'), { type: 'finish_speech' });
  st = apply(st, actor('v1'), { type: 'finish_speech' });
  st = apply(st, actor('v2'), { type: 'finish_speech' });
  st = timeout(st, 'free_discussion');
  // 白天无人得票弃权进第二夜
  st = timeout(st, 'voting');
  st = timeout(st, 'vote_result');
  assert.equal(st.phase, 'night');
  assert.equal(st.day, 2);
  // 狼人刀 v2
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v2' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v2' });
  // 女巫视角：nightVictimId 必须为 null，不能再看到死者
  const witchView = werewolfV2Module.getPlayerView(st, 'x');
  assert.equal(witchView.me?.nightVictimId, null);
});

test('v2 夜晚超时确定性兜底取合法候选首位（含狼人）', () => {
  const st = startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } });
  const after = timeout(st, 'night');
  assert.equal(after.phase, 'day_announcement');
  assert.equal(after.night.killTargetId, 'w1');
  assert.deepEqual(after.lastNightDeaths, ['w1']);
});

test('v2 非狼/非对应角色夜间动作被拒', () => {
  let st = startedNight(IDS, { roles: { guard: true, hunter: false, idiot: false } });
  deny(st, actor('s'), { type: 'night_kill', targetPlayerId: 'v1' });
  deny(st, actor('w1'), { type: 'seer_check', targetPlayerId: 'v1' });
  deny(st, actor('v1'), { type: 'guard_guard', targetPlayerId: 'w1' });
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  // 女巫在尚无击杀目标时不能决定解药
  const beforeTarget = werewolfV2Module.reduce(
    { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
    startedNight(IDS, { roles: { guard: false, hunter: false, idiot: false } }),
    actor('x'),
    { type: 'witch_save', save: false },
  );
  assert.equal(beforeTarget.ok, false);
});

test('v2 同守同救死亡（奶穿）：守卫守护且女巫救人时目标依然死亡', () => {
  let st = startedNight(IDS, { roles: { guard: true, hunter: false, idiot: false } });
  // 狼刀 v1
  st = apply(st, actor('w1'), { type: 'night_kill', targetPlayerId: 'v1' });
  st = apply(st, actor('w2'), { type: 'night_kill', targetPlayerId: 'v1' });
  // 预言家验人
  st = apply(st, actor('s'), { type: 'seer_check', targetPlayerId: 'w1' });
  // 守卫守护 v1
  st = apply(st, actor('g'), { type: 'guard_guard', targetPlayerId: 'v1' });
  // 女巫使用解药救 v1
  st = apply(st, actor('x'), { type: 'witch_save', save: true });
  assert.equal(st.phase, 'day_announcement');
  // 同守同救失效，v1 死亡
  assert.equal(st.players.v1?.alive, false);
  assert.equal(st.players.v1?.exitReason, 'night_kill');
  assert.deepEqual(st.lastNightDeaths, ['v1']);
});
