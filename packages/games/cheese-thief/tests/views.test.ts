import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { cheeseThiefModule } from '../server/module.ts';
import { createCheeseThiefState, reduceCheeseThiefState } from '../server/rules.ts';
import type { CheeseThiefState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const NOW = 1_700_000_000_000;

function initial() {
  const ctx = deterministicContext();
  return cheeseThiefModule.createInitialState(ctx, players, cheeseThiefModule.parseConfig({ rulesetId: 'cheese_thief_classic_v1' }));
}

/** 确定性状态：a/b 时刻 1，c 时刻 3（独醒 → 盗贼），d 时刻 5，e 时刻 6 */
function deterministic(): CheeseThiefState {
  return createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
  );
}

function toDawn(state: CheeseThiefState): CheeseThiefState {
  let s = state;
  for (const hour of [1, 2, 3, 4, 5, 6]) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  if (s.phase === 'night') {
    const r = reduceCheeseThiefState(s, { type: 'end_night' }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  if (s.phase === 'accomplice_select') {
    const r = reduceCheeseThiefState(s, { type: 'select_accomplice', playerId: s.thiefId!, accompliceIds: ['a'] }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  return s;
}

function toVote(state: CheeseThiefState): CheeseThiefState {
  const dawn = toDawn(state);
  const r = reduceCheeseThiefState(dawn, { type: 'end_discussion' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  return r.nextState;
}

test('奶酪大盗 视图严格解析：build→parse 往返一致', () => {
  const state = initial();
  for (const id of players) {
    const view = cheeseThiefModule.getPlayerView(state, id);
    assert.deepEqual(cheeseThiefModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
  }
  const spectator = cheeseThiefModule.getSpectatorView(state);
  assert.deepEqual(cheeseThiefModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('奶酪大盗 终局前私密信息不进视图：wakeHours/thiefId/stealHour/accomplices 不外泄', () => {
  const state = deterministic();
  const vote = toVote(state);
  assert.equal(vote.phase, 'vote');

  // 结构断言：观战视角不得含醒来时刻表/盗贼/盗取时刻/共犯名单等字段
  // （roleCardsEnabled 是公开布尔字段，roleCards 分配表才是私密——用带引号的完整字段名区分）
  const spectatorJson = JSON.stringify(cheeseThiefModule.getSpectatorView(vote));
  for (const key of ['wakeHours', 'thiefId', 'stealHour', 'accomplices', 'isThief', 'isAccomplice', 'wakeHour', 'peeks', '"roleCards"']) {
    assert.equal(spectatorJson.includes(key), false, `观战视角不得含 ${key}`);
  }

  for (const id of players) {
    const playerJson = JSON.stringify(cheeseThiefModule.getPlayerView(vote, id));
    // 本人视图只允许出现单个 wakeHour 键（自己的醒来时刻），不得含全表 wakeHours
    assert.equal((playerJson.match(/wakeHour/g) ?? []).length, 1, '仅含本人 wakeHour');
    assert.equal(playerJson.includes('wakeHours'), false, '不得含醒来时刻全表');
    assert.equal(playerJson.includes('stealHour'), false, '不得含盗取时刻');
    assert.equal(playerJson.includes('peeks'), false, '不得含偷看记录全表');
  }

  // 设计内泄漏（目击）：a 与 b 同刻 1 → 互见；c 独醒 3 → 无目击
  const a = cheeseThiefModule.getPlayerView(vote, 'a');
  assert.deepEqual(a.me?.coWakers, ['b']);
  const b = cheeseThiefModule.getPlayerView(vote, 'b');
  assert.deepEqual(b.me?.coWakers, ['a']);
  const c = cheeseThiefModule.getPlayerView(vote, 'c');
  assert.deepEqual(c.me?.coWakers, []);
  assert.equal(c.me?.isThief, true, 'c 独醒时刻 3 应为盗贼');
  assert.equal(c.me?.cheeseWasMissing, false);
  const d = cheeseThiefModule.getPlayerView(vote, 'd');
  assert.equal(d.me?.isThief, false);
  assert.equal(d.me?.isAccomplice, false);
});

test('奶酪大盗 终局视图披露完整真相（wakeHours/盗贼/盗取时刻/共犯/偷看记录）', () => {
  let s = toVote(deterministic());
  for (const id of players) {
    const r = reduceCheeseThiefState(s, { type: 'cast_abstention', playerId: id }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.phase, 'game_over');
  const spectator = cheeseThiefModule.getSpectatorView(s);
  assert.ok(spectator.reveal, '终局应披露真相');
  assert.deepEqual(spectator.reveal.wakeHours, s.wakeHours);
  assert.equal(spectator.reveal.thiefId, s.thiefId);
  assert.equal(spectator.reveal.stealHour, s.stealHour);
  assert.deepEqual(spectator.reveal.accomplices, s.accomplices);
  assert.deepEqual(spectator.reveal.peeks, s.peeks);
});

test('奶酪大盗 玩家视角含本人身份卡与 4 人局候选时刻', () => {
  // 启用身份卡：a 猫
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  const a = cheeseThiefModule.getPlayerView(state, 'a');
  assert.equal(a.me?.roleCard, 'cat');
  const b = cheeseThiefModule.getPlayerView(state, 'b');
  assert.equal(b.me?.roleCard, 'none');
  assert.equal(a.me?.hourChoices, null, '5 人局无两骰候选');

  // 4 人局：hourChoices 仅本人可见
  const state4 = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  const a4 = cheeseThiefModule.getPlayerView(state4, 'a');
  assert.deepEqual(a4.me?.hourChoices, [1, 6]);
  const b4 = cheeseThiefModule.getPlayerView(state4, 'b');
  assert.deepEqual(b4.me?.hourChoices, [2, 5]);
});

test('奶酪大盗 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = cheeseThiefModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => cheeseThiefModule.parsePlayerView({ ...playerView, wakeHours: {} }), /字段无效/);
  const spectator = cheeseThiefModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => cheeseThiefModule.parseSpectatorView({ ...spectator, thiefId: 'a' }), /字段无效/);
});

test('奶酪大盗 非参局观察者没有本人视角', () => {
  const view = cheeseThiefModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(cheeseThiefModule.parsePlayerView(view), view);
});
