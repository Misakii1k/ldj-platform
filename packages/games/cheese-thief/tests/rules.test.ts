import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { parseCheeseThiefAction, parseCheeseThiefConfig } from '../server/schemas.ts';
import {
  assertCheeseThiefInvariants,
  createCheeseThiefState,
  reduceCheeseThiefState,
  rollHourChoices,
  rollWakeHours,
} from '../server/rules.ts';
import type { CheeseThiefState } from '../server/types.ts';

const NOW = 1_700_000_000_000;
const random = createSeededRandom('cheese-thief-rules');

function accepted(state: CheeseThiefState, action: unknown, now = NOW) {
  const result = reduceCheeseThiefState(state, action, { now, random });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/**
 * 确定性状态（5 人局，跳过 4 人两骰变体）：
 * a/b 时刻 1（同醒不盗）；c 时刻 3（独醒 → 盗贼）；d 时刻 5；e 时刻 6。
 */
function makeState(players: string[] = ['a', 'b', 'c', 'd', 'e']) {
  return createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
  );
}

/** 推进夜间 1→6 并处理共犯选择（相识模式自动选队首 N 人） */
function toDawn(state: CheeseThiefState): CheeseThiefState {
  let s = state;
  for (let hour = 1; hour <= 6; hour += 1) {
    s = accepted(s, { type: 'advance_night', hour });
  }
  if (s.phase === 'accomplice_select') {
    s = accepted(s, { type: 'auto_select_accomplice' });
  }
  assert.equal(s.phase, 'dawn');
  return s;
}

/** 推进到投票阶段 */
function toVote(state: CheeseThiefState): CheeseThiefState {
  return accepted(toDawn(state), { type: 'end_discussion' });
}

test('掷骰产生 1–6 的醒来时刻且覆盖全部玩家', () => {
  const rolls = rollWakeHours(['a', 'b', 'c', 'd', 'e'], {
    nextInt(_min, _max) {
      return _min;
    },
  });
  assert.deepEqual(rolls, { a: 1, b: 1, c: 1, d: 1, e: 1 });
  const state = makeState();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    assert.ok(state.wakeHours[id]! >= 1 && state.wakeHours[id]! <= 6);
  }
});

test('4 人局掷两骰产生两枚候选时刻', () => {
  const choices = rollHourChoices(['a', 'b', 'c', 'd'], random);
  for (const id of ['a', 'b', 'c', 'd']) {
    const pair = choices[id]!;
    assert.equal(pair.length, 2);
    assert.ok(pair.every((h) => h >= 1 && h <= 6));
  }
});

test('初始化接受 4 至 8 人并拒绝边界外、重复玩家及缺失两骰候选', () => {
  const state5 = makeState();
  assert.equal(state5.players.length, 5);
  assert.equal(state5.phase, 'night', '5 人局直接进入夜晚');
  // 4 人局需要 hourChoices 且进入 hour_choice
  const state4 = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  assert.equal(state4.phase, 'hour_choice');
  assert.throws(() => createCheeseThiefState(['a', 'b', 'c', 'd'], {}, {}, null), /需要提供两骰候选/);
  assert.throws(() => makeState(['a', 'b', 'c']), /4 至 8/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd', 'e']), /玩家列表无效/);
  assert.throws(
    () => createCheeseThiefState(['a', 'b', 'c', 'd'], {}, {}, { a: [1, 6], b: [2, 5], c: [3, 4], d: [7, 2] }),
    /候选时刻无效/,
  );
});

test('解析器严格拒绝多余字段与非法配置', () => {
  assert.deepEqual(parseCheeseThiefAction({ type: 'cast_abstention', playerId: 'a' }), {
    type: 'cast_abstention',
    playerId: 'a',
  });
  assert.throws(
    () => parseCheeseThiefAction({ type: 'cast_abstention', playerId: 'a', extra: true }),
    /字段无效/,
  );
  assert.throws(() => parseCheeseThiefConfig({ nightHourSeconds: 0 }), /时长无效/);
  assert.throws(() => parseCheeseThiefConfig({ accomplicesByPlayers: { 4: { count: 5, known: true } } }), /共犯数量无效/);
});

test('独醒且奶酪在场 → 该玩家成为盗贼；同醒/无人醒不盗取', () => {
  let state = makeState();
  state = accepted(state, { type: 'advance_night', hour: 1 });
  assert.equal(state.thiefId, null, '多人同醒不盗取');
  state = accepted(state, { type: 'advance_night', hour: 2 });
  assert.equal(state.thiefId, null, '无人醒来不盗取');
  state = accepted(state, { type: 'advance_night', hour: 3 });
  assert.equal(state.thiefId, 'c');
  assert.equal(state.stealHour, 3);
  assert.equal(state.cheeseStolen, true);
});

test('整夜未盗（每个时刻 0 或 ≥2 人醒）→ 无盗贼，投票后全员获胜', () => {
  // a/b 时刻 1；c/d/e 时刻 2 → 每个时刻 ≥2 人醒
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd', 'e'],
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 2, d: 2, e: 2 },
  );
  let s = toVote(state);
  assert.equal(s.thiefId, null);
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    s = accepted(s, { type: 'cast_abstention', playerId: id });
  }
  assert.equal(s.phase, 'game_over');
  assert.equal(s.thiefCaught, false);
  assert.deepEqual(s.winners.sort(), ['a', 'b', 'c', 'd', 'e'], '整夜未盗应为全员获胜');
});

test('5 人局：大盗选择 1 名共犯（相识）；超时自动选队首', () => {
  let state = makeState();
  for (let hour = 1; hour <= 6; hour += 1) {
    state = accepted(state, { type: 'advance_night', hour });
  }
  assert.equal(state.phase, 'accomplice_select', '5 人局共犯 1 名且相识');
  // 非大盗不能选择
  const denied = reduceCheeseThiefState(
    state,
    { type: 'select_accomplice', playerId: 'a', accompliceIds: ['b'] },
    { now: NOW, random },
  );
  assert.equal(denied.ok, false);
  // 大盗 c 选择 d
  state = accepted(state, { type: 'select_accomplice', playerId: 'c', accompliceIds: ['d'] });
  assert.equal(state.phase, 'dawn');
  assert.deepEqual(state.accomplices, ['d']);
  assert.equal(state.accomplicesKnown, true);
});

test('7 人局：不相识模式随机分配 2 名共犯，无需选择', () => {
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 3, d: 5, e: 6, f: 2, g: 4 },
  );
  let s = state;
  for (let hour = 1; hour <= 6; hour += 1) {
    s = accepted(s, { type: 'advance_night', hour });
  }
  assert.equal(s.phase, 'dawn', '不相识模式夜间后直接天亮');
  assert.equal(s.accomplices.length, 2, '7 人局 2 名共犯');
  assert.equal(s.accomplicesKnown, false);
  assert.ok(!s.accomplices.includes('c'), '共犯不能是盗贼');
});

test('独醒村民（奶酪已失）可偷看他人骰子；已看/他人不可重复', () => {
  // c 时刻 3 盗取后；d 时刻 5 独醒可偷看 e
  let state = makeState();
  for (let hour = 1; hour <= 5; hour += 1) {
    state = accepted(state, { type: 'advance_night', hour });
  }
  assert.equal(state.thiefId, 'c');
  assert.equal(state.wakeHours['d'], 5);
  assert.equal(state.currentHour, 5, 'd 时刻窗口内');
  // 非独醒村民（b 时刻 1 已过）不能偷看
  const denied = reduceCheeseThiefState(
    state,
    { type: 'peek_die', playerId: 'b', targetPlayerId: 'a' },
    { now: NOW, random },
  );
  assert.equal(denied.ok, false);
  // d 偷看 e
  state = accepted(state, { type: 'peek_die', playerId: 'd', targetPlayerId: 'e' });
  assert.deepEqual(state.peeks, [{ viewer: 'd', target: 'e' }]);
  // 重复偷看被拒
  const again = reduceCheeseThiefState(
    state,
    { type: 'peek_die', playerId: 'd', targetPlayerId: 'a' },
    { now: NOW, random },
  );
  assert.equal(again.ok, false);
});

test('投中大盗 → 好人（村民）胜，共犯不算好人', () => {
  // 盗贼 c，共犯 a（auto 选队首）
  let state = toVote(makeState());
  assert.deepEqual(state.accomplices, ['a'], 'auto 选队首 N 人');
  // b、d、e 投 c；a(共犯) 弃票；c 弃票
  for (const id of ['b', 'd', 'e']) {
    state = accepted(state, { type: 'cast_vote', playerId: id, targetPlayerId: 'c' });
  }
  state = accepted(state, { type: 'cast_abstention', playerId: 'a' });
  state = accepted(state, { type: 'cast_abstention', playerId: 'c' });
  assert.equal(state.phase, 'game_over');
  assert.equal(state.thiefCaught, true);
  assert.deepEqual(state.eliminated, ['c']);
  assert.deepEqual(state.winners.sort(), ['b', 'd', 'e'], '好人胜不含共犯与盗贼');
});

test('未投中大盗（平票或低票）→ 大盗 + 共犯胜', () => {
  let state = toVote(makeState());
  // 共犯 a；盗贼 c。好人 b、d、e 各自投不同人 → 平票且无人集中
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'd' });
  state = accepted(state, { type: 'cast_vote', playerId: 'd', targetPlayerId: 'e' });
  state = accepted(state, { type: 'cast_vote', playerId: 'e', targetPlayerId: 'b' });
  state = accepted(state, { type: 'cast_abstention', playerId: 'a' });
  state = accepted(state, { type: 'cast_abstention', playerId: 'c' });
  assert.equal(state.thiefCaught, false);
  assert.deepEqual(state.eliminated, ['b', 'd', 'e'], '平票一并出局');
  assert.deepEqual(state.winners.sort(), ['a', 'c'], '大盗+共犯胜');
});

test('平票时并列最高票一并出局；若并列含大盗则好人胜', () => {
  // 构造 c 与 d 各 2 票：a→d、b→c、d→c、e→d → 平票 c/d 出局
  let state = toVote(makeState());
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'd' });
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'c' });
  state = accepted(state, { type: 'cast_vote', playerId: 'd', targetPlayerId: 'c' });
  state = accepted(state, { type: 'cast_vote', playerId: 'e', targetPlayerId: 'd' });
  state = accepted(state, { type: 'cast_abstention', playerId: 'c' });
  assert.equal(state.thiefCaught, true, '平票含大盗 → 大盗出局');
  assert.deepEqual(state.eliminated, ['c', 'd'], '并列最高票一并出局');
  assert.deepEqual(state.winners.sort(), ['b', 'd', 'e'], '好人胜（不含大盗 c 与共犯 a）');
});

test('零票 / 全员弃票 → 大盗逃脱', () => {
  let state = toVote(makeState());
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    state = accepted(state, { type: 'cast_abstention', playerId: id });
  }
  assert.equal(state.thiefCaught, false);
  assert.deepEqual(state.eliminated, [], '全员弃票无人出局');
  assert.deepEqual(state.winners.sort(), ['a', 'c'], '大盗+共犯胜');
});

test('白老鼠被投出 → 单独胜利（优先于其他判定）', () => {
  // 启用身份卡：a 为白老鼠；盗贼 c 时刻 3
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd', 'e'],
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'whiteMouse', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  let s = toVote(state);
  // b、d、e 投 a（白老鼠）→ a 出局 → 单独胜利
  for (const id of ['b', 'd', 'e']) {
    s = accepted(s, { type: 'cast_vote', playerId: id, targetPlayerId: 'a' });
  }
  s = accepted(s, { type: 'cast_abstention', playerId: 'a' });
  s = accepted(s, { type: 'cast_abstention', playerId: 'c' });
  assert.equal(s.phase, 'game_over');
  assert.equal(s.thiefCaught, false);
  assert.deepEqual(s.winners, ['a'], '白老鼠单独胜利');
});

test('身份卡：猫天亮展示后查看一名玩家骰子；狗展示并指定先投票', () => {
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd', 'e'],
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'dog', c: 'none', d: 'none', e: 'none' },
  );
  let s = toDawn(state);
  // 非猫不能展示
  const denied = reduceCheeseThiefState(
    s,
    { type: 'reveal_cat', playerId: 'c', targetPlayerId: 'a' },
    { now: NOW, random },
  );
  assert.equal(denied.ok, false);
  s = accepted(s, { type: 'reveal_cat', playerId: 'a', targetPlayerId: 'e' });
  assert.equal(s.catPeekTarget, 'e');
  s = accepted(s, { type: 'reveal_dog', playerId: 'b', firstVoterId: 'd' });
  assert.equal(s.dogFirstVoter, 'd');
  // 重复展示被拒
  const again = reduceCheeseThiefState(
    s,
    { type: 'reveal_cat', playerId: 'a', targetPlayerId: 'b' },
    { now: NOW, random },
  );
  assert.equal(again.ok, false);
});

test('4 人局：两骰自选，全员选毕进入夜晚', () => {
  let state = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  assert.equal(state.phase, 'hour_choice');
  // 不能选非候选时刻
  const denied = reduceCheeseThiefState(
    state,
    { type: 'choose_hour', playerId: 'a', hour: 5 },
    { now: NOW, random },
  );
  assert.equal(denied.ok, false);
  state = accepted(state, { type: 'choose_hour', playerId: 'a', hour: 6 });
  assert.equal(state.phase, 'hour_choice', '未全员选毕不进入夜晚');
  state = accepted(state, { type: 'choose_hour', playerId: 'b', hour: 2 });
  state = accepted(state, { type: 'choose_hour', playerId: 'c', hour: 3 });
  state = accepted(state, { type: 'choose_hour', playerId: 'd', hour: 2 });
  assert.equal(state.phase, 'night', '全员选毕进入夜晚');
  assert.deepEqual(
    { a: state.wakeHours['a'], b: state.wakeHours['b'], c: state.wakeHours['c'], d: state.wakeHours['d'] },
    { a: 6, b: 2, c: 3, d: 2 },
  );
  // a 时刻 6、c 时刻 3 → c 先独醒成盗贼（a 醒时奶酪已失）
  for (let hour = 1; hour <= 6; hour += 1) {
    state = accepted(state, { type: 'advance_night', hour });
  }
  assert.equal(state.thiefId, 'c');
  assert.equal(state.phase, 'dawn', '4 人局无共犯，天亮');
});

test('4 人局超时兜底：未选择者取首候选', () => {
  let state = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  state = accepted(state, { type: 'choose_hour', playerId: 'b', hour: 5 });
  state = accepted(state, { type: 'resolve_hour_choice' });
  assert.equal(state.phase, 'night');
  assert.equal(state.wakeHours['a'], 1);
  assert.equal(state.wakeHours['b'], 5);
  assert.equal(state.wakeHours['c'], 3);
  assert.equal(state.wakeHours['d'], 1);
});

test('投票阶段校验：不能自投、不能重复投票、局外人不许投', () => {
  let state = toVote(makeState());
  assert.equal(
    reduceCheeseThiefState(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'a' }, { now: NOW, random }).ok,
    false,
  );
  assert.equal(
    reduceCheeseThiefState(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'zzz' }, { now: NOW, random }).ok,
    false,
  );
  state = accepted(state, { type: 'cast_abstention', playerId: 'a' });
  assert.equal(
    reduceCheeseThiefState(state, { type: 'cast_abstention', playerId: 'a' }, { now: NOW, random }).ok,
    false,
    '重复投票应被拒',
  );
});

test('计时器动作幂等：夜间/讨论/投票已推进后重复触发不改变状态', () => {
  const state = makeState();
  const s1 = accepted(state, { type: 'advance_night', hour: 1 });
  const dup = reduceCheeseThiefState(s1, { type: 'advance_night', hour: 1 }, { now: NOW, random });
  assert.equal(dup.ok, true);
  if (dup.ok) assert.equal(dup.nextState, s1, '重复时刻应返回原状态引用');
  const vote = toVote(state);
  const dupDiscussion = reduceCheeseThiefState(vote, { type: 'end_discussion' }, { now: NOW, random });
  assert.equal(dupDiscussion.ok, true);
  const dupResolve = reduceCheeseThiefState(vote, { type: 'resolve_vote' }, { now: NOW, random });
  assert.equal(dupResolve.ok, true);
});

test('begin 排定夜间计时器且不修改状态；4 人局排定选择计时器', () => {
  const state = makeState();
  const began = reduceCheeseThiefState(state, { type: 'begin' }, { now: NOW, random });
  assert.equal(began.ok, true);
  if (!began.ok) return;
  assert.equal(began.nextState, state);
  assert.ok(began.effects.some((e) => e.type === 'schedule_timer' && e.timerId === 'night-1'));

  const state4 = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  const began4 = reduceCheeseThiefState(state4, { type: 'begin' }, { now: NOW, random });
  assert.equal(began4.ok, true);
  if (!began4.ok) return;
  assert.ok(began4.effects.some((e) => e.type === 'schedule_timer' && e.timerId === 'hour-choice'));
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as CheeseThiefState;
  broken.wakeHours = { a: 99, b: 1, c: 3, d: 5, e: 6 };
  assert.throws(() => assertCheeseThiefInvariants(broken), /醒来时刻无效/);

  const broken2 = structuredClone(state) as CheeseThiefState;
  broken2.cheeseStolen = true;
  assert.throws(() => assertCheeseThiefInvariants(broken2), /盗贼标记与奶酪状态不一致/);

  const broken3 = structuredClone(state) as CheeseThiefState;
  broken3.accomplices = ['a', 'a'];
  assert.throws(() => assertCheeseThiefInvariants(broken3), /共犯不能重复/);
});
