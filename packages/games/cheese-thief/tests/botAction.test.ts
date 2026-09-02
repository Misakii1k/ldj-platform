/**
 * 奶酪大盗 机器人策略（pickCheeseThiefBotAction）测试。
 *
 * 目标：覆盖各 phase 的策略分支、断言返回的动作能被 parseAction + reduce 接受、
 * 覆盖"不该动返回 null"、跑一个端到端冒烟。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';
import { cheeseThiefModule } from '../server/module.ts';
import { pickCheeseThiefBotAction } from '../server/bot.ts';
import {
  createCheeseThiefState,
  reduceCheeseThiefState,
} from '../server/rules.ts';
import type { CheeseThiefAction, CheeseThiefState } from '../server/types.ts';

const NOW = 1_700_000_000_000;
const players = ['a', 'b', 'c', 'd', 'e'];

/** 确定性 5 人局：a/b 时刻 1（同醒不盗）；c 时刻 3（独醒 → 盗贼）；d 时刻 5；e 时刻 6 */
function deterministicFive(): CheeseThiefState {
  return createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
  );
}

/** 用确定性 RNG 调用 bot */
function callBot(state: CheeseThiefState, playerId: string, seed = 'bot-test') {
  const view = cheeseThiefModule.getPlayerView(state, playerId);
  const random = createSeededRandom(`${seed}:${playerId}`);
  return pickCheeseThiefBotAction({ view, playerId, random });
}

/** 应用 bot 动作并返回新状态；要求 bot 产出动作且 reducer 接受 */
function applyBot(state: CheeseThiefState, playerId: string, seed = 'bot-test'): CheeseThiefState {
  const action = callBot(state, playerId, seed);
  if (action === null) {
    throw new Error(`bot 返回 null 而非动作: player=${playerId} phase=${state.phase}`);
  }
  const r = reduceCheeseThiefState(state, action, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(`reducer 拒绝 bot 动作: ${r.message} action=${JSON.stringify(action)}`);
  return r.nextState;
}

/** 系统推进：begin → 6 时刻 → 共犯兜底 */
function toDawnBySys(state: CheeseThiefState): CheeseThiefState {
  let s = state;
  const r0 = reduceCheeseThiefState(s, { type: 'begin' }, { now: NOW, random: deterministicContext().random });
  if (!r0.ok) throw new Error(r0.message);
  s = r0.nextState;
  for (let hour = 1; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  if (s.phase === 'accomplice_select') {
    const r = reduceCheeseThiefState(s, { type: 'auto_select_accomplice' }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  return s;
}

// ===== 基础：模块契约 =====

test('奶酪大盗 bot：模块已声明 pickBotAction', () => {
  assert.equal(typeof cheeseThiefModule.pickBotAction, 'function');
});

test('奶酪大盗 bot：通用契约 botLegalCandidates 在初始/投票/终局均通过', () => {
  const ctx = deterministicContext();
  const initial = cheeseThiefModule.createInitialState(
    ctx,
    players,
    cheeseThiefModule.parseConfig({ rulesetId: 'cheese_thief_classic_v1' }),
  );
  // 初始（night 阶段、尚无盗贼 → canPeek=false）所有玩家应返回 null
  versionedContractAssertions.botLegalCandidates(
    cheeseThiefModule,
    ctx,
    initial,
    players,
    'bot-initial',
  );

  // 投票阶段
  const dawn = toDawnBySys(deterministicFive());
  const discussion = reduceCheeseThiefState(dawn, { type: 'end_discussion' }, { now: NOW, random: ctx.random });
  if (!discussion.ok) throw new Error(discussion.message);
  versionedContractAssertions.botLegalCandidates(
    cheeseThiefModule,
    ctx,
    discussion.nextState,
    players,
    'bot-vote',
  );
});

// ===== 不该动 → null =====

test('奶酪大盗 bot：非参局玩家（me=null）→ null', () => {
  const state = deterministicFive();
  const action = callBot(state, 'outsider', 'bot-outsider');
  assert.equal(action, null);
});

test('奶酪大盗 bot：非自己行动（dawn 无身份卡玩家）→ null', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  const dawn = toDawnBySys(state);
  // b/c/d/e 均无身份卡，bot 应返回 null
  for (const id of ['b', 'c', 'd', 'e']) {
    const action = callBot(dawn, id, `bot-no-card-${id}`);
    assert.equal(action, null, `无身份卡玩家 ${id} 应返回 null`);
  }
});

test('奶酪大盗 bot：非大盗在共犯选择阶段 → null', () => {
  let s = deterministicFive();
  for (let hour = 1; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.phase, 'accomplice_select');
  for (const id of ['a', 'b', 'd', 'e']) {
    const action = callBot(s, id, `bot-non-thief-${id}`);
    assert.equal(action, null, `非大盗 ${id} 在共犯选择阶段应返回 null`);
  }
});

test('奶酪大盗 bot：终局任何玩家 → null', () => {
  let s = deterministicFive();
  s = toDawnBySys(s);
  const r = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  for (const id of players) {
    const rr = reduceCheeseThiefState(s, { type: 'cast_abstention', playerId: id }, { now: NOW, random: deterministicContext().random });
    if (!rr.ok) throw new Error(rr.message);
    s = rr.nextState;
  }
  assert.equal(s.phase, 'game_over');
  for (const id of players) {
    const action = callBot(s, id, `bot-gameover-${id}`);
    assert.equal(action, null, `终局时 ${id} 应返回 null`);
  }
});

// ===== hour_choice phase =====

test('奶酪大盗 bot hour_choice：4 人局随机选两个候选之一且 reducer 接受', () => {
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  assert.equal(state.phase, 'hour_choice');
  let s = state;
  for (const id of ['a', 'b', 'c', 'd']) {
    const before = s;
    s = applyBot(s, id, `bot-hour-${id}`);
    // 验证 wakeHours 已填
    assert.equal(s.wakeHours[id], before.hourChoices?.[id]?.[0] === s.wakeHours[id] ? s.wakeHours[id] : s.wakeHours[id]);
    // 必须等于其两个候选之一
    const pair = before.hourChoices![id]!;
    assert.ok(
      s.wakeHours[id] === pair[0] || s.wakeHours[id] === pair[1],
      `${id} 应选其两个候选之一`,
    );
  }
  // 全员选毕进入夜晚
  assert.equal(s.phase, 'night');
});

test('奶酪大盗 bot hour_choice：已选过的玩家再调 → null', () => {
  const state = createCheeseThiefState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'cheese_thief_classic_v1' },
    {},
    { a: [1, 6], b: [2, 5], c: [3, 4], d: [1, 2] },
  );
  const s = applyBot(state, 'a', 'bot-hour-dup');
  const action = callBot(s, 'a', 'bot-hour-dup-2');
  assert.equal(action, null, '已选过时刻的 a 应返回 null');
});

// ===== night phase: peek =====

test('奶酪大盗 bot night：同醒/未到时刻（canPeek=false）→ null', () => {
  let s = deterministicFive();
  // 推进到时刻 1（a/b 同醒不盗）
  const r = reduceCheeseThiefState(s, { type: 'advance_night', hour: 1 }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  // 全部玩家应返回 null
  for (const id of players) {
    const action = callBot(s, id, `bot-night-multi-${id}`);
    assert.equal(action, null, `同醒时 ${id} 应返回 null`);
  }
});

test('奶酪大盗 bot night：独醒且奶酪已失时返回 peek_die 或 skip_peek（带合法 playerId/target）', () => {
  let s = deterministicFive();
  for (let hour = 1; hour <= 5; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.thiefId, 'c', 'c 应为盗贼');
  // d 的 canPeek 应为 true
  const dView = cheeseThiefModule.getPlayerView(s, 'd');
  assert.equal(dView.me?.canPeek, true, 'd 在时刻 5 应可偷看');

  // 多次随机采样，验证能同时采到 peek_die 与 skip_peek
  let sawPeek = false;
  let sawSkip = false;
  const peekedTargets: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const action = callBot(s, 'd', `bot-peek-${i}`);
    if (action === null) continue;
    if (action.type === 'peek_die') {
      sawPeek = true;
      assert.equal(action.playerId, 'd');
      assert.notEqual(action.targetPlayerId, 'd', '不能偷看自己');
      assert.ok(s.players.includes(action.targetPlayerId), '目标必须是参局玩家');
      peekedTargets.push(action.targetPlayerId);
    } else if (action.type === 'skip_peek') {
      sawSkip = true;
      assert.equal(action.playerId, 'd');
    } else {
      assert.fail(`独醒时只应返回 peek_die / skip_peek，得到 ${action.type}`);
    }
  }
  assert.equal(sawPeek && sawSkip, true, '50/50 随机应能同时采到 peek_die 与 skip_peek');
  assert.ok(peekedTargets.length >= 1, 'peek_die 至少应采到一次');
});

test('奶酪大盗 bot night：已偷看后再次调用 → null（reducer 仍会拒绝）', () => {
  let s = deterministicFive();
  for (let hour = 1; hour <= 5; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  // d 先偷看 e
  const r = reduceCheeseThiefState(s, { type: 'peek_die', playerId: 'd', targetPlayerId: 'e' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  // 再次调用 bot 对 d：canPeek=false，bot 返回 null
  const action = callBot(s, 'd', 'bot-peeked');
  assert.equal(action, null, '已偷看过的 d 应返回 null');
});

// ===== accomplice_select phase =====

test('奶酪大盗 bot accomplice_select：5 人局大盗选 1 名共犯；reducer 接受', () => {
  let s = deterministicFive();
  for (let hour = 1; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.phase, 'accomplice_select', '5 人局相识模式应进入共犯选择');
  assert.equal(s.thiefId, 'c');

  const action = callBot(s, 'c', 'bot-accomplice');
  assert.ok(action, '大盗在共犯选择阶段应返回动作');
  assert.equal(action.type, 'select_accomplice');
  if (action.type === 'select_accomplice') {
    assert.equal(action.playerId, 'c');
    assert.equal(action.accompliceIds.length, 1, '5 人局应选 1 名共犯');
    assert.notEqual(action.accompliceIds[0], 'c', '共犯不能是大盗');
    assert.ok(s.players.includes(action.accompliceIds[0]!), '共犯必须是参局玩家');
    const r = reduceCheeseThiefState(s, action, { now: NOW, random: deterministicContext().random });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.nextState.phase, 'dawn');
      assert.equal(r.nextState.accomplices.length, 1);
    }
  }
});

test('奶酪大盗 bot accomplice_select：6 人局大盗选 1 名共犯', () => {
  // 6 人局也是 1 名共犯且相识 → 覆盖 defaultAccompliceCount(6) === 1。
  // wakeHours 构造：a/b 时刻 1（2 人同醒不盗），c 时刻 3 独醒 → 盗贼 = c。
  const state6 = createCheeseThiefState(
    ['a', 'b', 'c', 'd', 'e', 'f'],
    { rulesetId: 'cheese_thief_classic_v1' },
    { a: 1, b: 1, c: 3, d: 5, e: 5, f: 6 },
  );
  let s = state6;
  for (let hour = 1; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: deterministicContext().random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.phase, 'accomplice_select');
  assert.equal(s.thiefId, 'c');
  const action = callBot(s, 'c', 'bot-accomplice-6');
  assert.ok(action, '6 人局大盗 c 在共犯选择阶段应返回动作');
  if (action && action.type === 'select_accomplice') {
    assert.equal(action.accompliceIds.length, 1, '6 人局应选 1 名共犯');
    assert.equal(action.playerId, 'c');
    assert.notEqual(action.accompliceIds[0], 'c', '共犯不能是大盗');
  }
});

// ===== vote phase =====

test('奶酪大盗 bot vote：投票阶段随机产出 cast_vote / cast_abstention（均合法）', () => {
  let s = deterministicFive();
  s = toDawnBySys(s);
  const r = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  assert.equal(s.phase, 'vote');

  let sawVote = false;
  let sawAbstain = false;
  for (let i = 0; i < 30; i += 1) {
    const action = callBot(s, 'a', `bot-vote-${i}`);
    if (action === null) continue;
    if (action.type === 'cast_vote') {
      sawVote = true;
      assert.equal(action.playerId, 'a');
      assert.notEqual(action.targetPlayerId, 'a', '不能投自己');
      assert.ok(s.players.includes(action.targetPlayerId), '目标必须是参局玩家');
    } else if (action.type === 'cast_abstention') {
      sawAbstain = true;
      assert.equal(action.playerId, 'a');
    } else {
      assert.fail(`投票阶段应只返回 cast_vote / cast_abstention，得到 ${action.type}`);
    }
  }
  assert.equal(sawVote && sawAbstain, true, '应能采到两种动作');
});

test('奶酪大盗 bot vote：每个玩家都应能产出被 reducer 接受的动作', () => {
  const ctx = deterministicContext();
  let s = deterministicFive();
  s = toDawnBySys(s);
  const r = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: ctx.random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  for (const id of players) {
    const action = callBot(s, id, `bot-vote-each-${id}`);
    assert.ok(action, `${id} 在投票阶段应产出动作`);
    const rr = reduceCheeseThiefState(s, action as CheeseThiefAction, { now: NOW, random: ctx.random });
    assert.equal(rr.ok, true, `${id} 投票应被 reducer 接受: ${!rr.ok ? rr.message : ''}`);
    s = rr.ok ? rr.nextState : s;
  }
});

test('奶酪大盗 bot vote：已投过票再调（视图未暴露 hasVoted）→ bot 仍返回动作且 reducer 拒绝', () => {
  // 已知视图能力 gap：vote 阶段玩家视图未暴露"是否已投"信号。
  // 当前实现：bot 仍返回 cast_vote/cast_abstention，reducer 拒绝重复投票。
  let s = deterministicFive();
  s = toDawnBySys(s);
  const r = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  s = r.nextState;
  // a 先投一次
  const first = callBot(s, 'a', 'bot-vote-dup-first');
  assert.ok(first);
  const r1 = reduceCheeseThiefState(s, first as CheeseThiefAction, { now: NOW, random: deterministicContext().random });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  s = r1.nextState;
  // 再次调用 bot 对 a
  const again = callBot(s, 'a', 'bot-vote-dup-again');
  if (again === null) {
    // 理想：bot 能从视图检测到"已投"并返回 null（与 undercover 对齐）。
    return;
  }
  // 当前实现：bot 仍返回动作；reducer 应拒绝。
  const r2 = reduceCheeseThiefState(s, again, { now: NOW, random: deterministicContext().random });
  assert.equal(r2.ok, false, '已投过票的重复投票应被 reducer 拒绝');
});

// ===== role cards (dawn) =====

test('奶酪大盗 bot dawn 身份卡：猫未被展示 → reveal_cat（合法 target）', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  const dawn = toDawnBySys(state);
  const action = callBot(dawn, 'a', 'bot-cat');
  assert.ok(action);
  assert.equal(action.type, 'reveal_cat');
  if (action.type === 'reveal_cat') {
    assert.equal(action.playerId, 'a');
    assert.notEqual(action.targetPlayerId, 'a', '猫不能偷看自己');
    assert.ok(dawn.players.includes(action.targetPlayerId), '目标必须是参局玩家');
    const r = reduceCheeseThiefState(dawn, action, { now: NOW, random: deterministicContext().random });
    assert.equal(r.ok, true);
  }
});

test('奶酪大盗 bot dawn 身份卡：猫已展示后再调 → null', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  let dawn = toDawnBySys(state);
  // 先手动展示一次
  const r = reduceCheeseThiefState(dawn, { type: 'reveal_cat', playerId: 'a', targetPlayerId: 'b' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  dawn = r.nextState;
  // 再调 bot 应返回 null
  const action = callBot(dawn, 'a', 'bot-cat-revealed');
  assert.equal(action, null, '猫已展示后 bot 应返回 null');
});

test('奶酪大盗 bot dawn 身份卡：狗未被展示 → reveal_dog（firstVoter 可含自己）', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'none', b: 'dog', c: 'none', d: 'none', e: 'none' },
  );
  const dawn = toDawnBySys(state);
  // 多次采样看 firstVoter 分布（至少应见到不同目标）
  const targets = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    const action = callBot(dawn, 'b', `bot-dog-${i}`);
    assert.ok(action);
    if (action && action.type === 'reveal_dog') {
      assert.equal(action.playerId, 'b');
      assert.ok(dawn.players.includes(action.firstVoterId), 'firstVoterId 必须是参局玩家');
      targets.add(action.firstVoterId);
    }
  }
  assert.ok(targets.size >= 2, '狗应能从多名玩家中随机选 firstVoter');
});

test('奶酪大盗 bot dawn 身份卡：狗已展示后再调 → null', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'none', b: 'dog', c: 'none', d: 'none', e: 'none' },
  );
  let dawn = toDawnBySys(state);
  const r = reduceCheeseThiefState(dawn, { type: 'reveal_dog', playerId: 'b', firstVoterId: 'd' }, { now: NOW, random: deterministicContext().random });
  if (!r.ok) throw new Error(r.message);
  dawn = r.nextState;
  const action = callBot(dawn, 'b', 'bot-dog-revealed');
  assert.equal(action, null, '狗已展示后 bot 应返回 null');
});

test('奶酪大盗 bot dawn 身份卡：白老鼠玩家 → null（白鼠无可执行动作）', () => {
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'whiteMouse', b: 'none', c: 'none', d: 'none', e: 'none' },
  );
  const dawn = toDawnBySys(state);
  const action = callBot(dawn, 'a', 'bot-whitemouse');
  assert.equal(action, null, '白鼠在 dawn 无可执行动作');
});

// ===== 端到端冒烟：系统推进 + bot 投票直达 game_over =====

test('奶酪大盗 bot 冒烟：5 人局系统推进 + bot 投票直达 game_over', () => {
  const ctx = deterministicContext();
  let s = cheeseThiefModule.createInitialState(
    ctx,
    players,
    cheeseThiefModule.parseConfig({ rulesetId: 'cheese_thief_classic_v1' }),
  );
  // begin
  const began = reduceCheeseThiefState(s, { type: 'begin' }, { now: NOW, random: ctx.random });
  if (!began.ok) throw new Error(began.message);
  s = began.nextState;
  // 6 时刻推进
  for (let hour = 1; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  // 共犯兜底（5 人局相识模式）
  if (s.phase === 'accomplice_select') {
    const r = reduceCheeseThiefState(s, { type: 'auto_select_accomplice' }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  assert.equal(s.phase, 'dawn');
  const discussion = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: ctx.random });
  if (!discussion.ok) throw new Error(discussion.message);
  s = discussion.nextState;
  assert.equal(s.phase, 'vote');
  // bot 投票：每人都应产出动作且 reducer 接受；全部投完后 → game_over
  for (const id of players) {
    const action = callBot(s, id, `smoke-${id}`);
    assert.ok(action, `smoke: bot 在投票阶段必须返回动作: player=${id}`);
    const r = reduceCheeseThiefState(s, action as CheeseThiefAction, { now: NOW, random: ctx.random });
    assert.equal(r.ok, true, `smoke: bot 投票应被 reducer 接受: player=${id} action=${JSON.stringify(action)}`);
    s = r.ok ? r.nextState : s;
  }
  assert.equal(s.phase, 'game_over', '5 人局全员投票后应进入终局');
  assert.ok(s.winners.length > 0, '终局必须有胜方');
  // 终局后再调 bot 必返回 null
  for (const id of players) {
    const action = callBot(s, id, `smoke-final-${id}`);
    assert.equal(action, null, `smoke: 终局后 ${id} 应返回 null`);
  }
});

// ===== 端到端冒烟扩展：bot 也参与 peek 与共犯选择 + 身份卡 =====

test('奶酪大盗 bot 冒烟扩展：bot 参与 peek/共犯/猫狗+系统推进到 game_over', () => {
  const ctx = deterministicContext();
  const state = createCheeseThiefState(
    players,
    { rulesetId: 'cheese_thief_classic_v1', roleCards: true },
    { a: 1, b: 1, c: 3, d: 5, e: 6 },
    null,
    { a: 'cat', b: 'dog', c: 'none', d: 'none', e: 'whiteMouse' },
  );
  // begin
  const began = reduceCheeseThiefState(state, { type: 'begin' }, { now: NOW, random: ctx.random });
  if (!began.ok) throw new Error(began.message);
  let s = began.nextState;
  // 推进时刻 1（a/b 同醒不盗）
  for (let hour = 1; hour <= 1; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  // 时刻 3：c 独醒盗取（桌面点击 steal_cheese；未点击时由时刻结束兜底）
  for (let hour = 2; hour <= 3; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  const stolen = reduceCheeseThiefState(s, { type: 'steal_cheese', playerId: 'c' }, { now: NOW, random: ctx.random });
  if (!stolen.ok) throw new Error(stolen.message);
  s = stolen.nextState;
  assert.equal(s.thiefId, 'c');
  // 时刻 5：d 独醒可偷看 → 让 bot 决定
  for (let hour = 4; hour <= 5; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  // d 是可偷看玩家；让 bot 决定 peek_die 或 skip_peek
  const peekAction = callBot(s, 'd', 'smoke-peek-d');
  assert.ok(peekAction, 'd 在时刻 5 独醒，bot 应产出 peek 动作');
  assert.ok(peekAction && (peekAction.type === 'peek_die' || peekAction.type === 'skip_peek'));
  const peeked = reduceCheeseThiefState(s, peekAction as CheeseThiefAction, { now: NOW, random: ctx.random });
  if (!peeked.ok) throw new Error(peeked.message);
  s = peeked.nextState;
  // 推进剩余时刻
  for (let hour = 6; hour <= 6; hour += 1) {
    const r = reduceCheeseThiefState(s, { type: 'advance_night', hour }, { now: NOW, random: ctx.random });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  // 进入共犯选择（5 人局相识）
  assert.equal(s.phase, 'accomplice_select');
  // 大盗 c 让 bot 选共犯
  const accAction = callBot(s, 'c', 'smoke-accomplice');
  assert.ok(accAction);
  assert.equal(accAction && accAction.type, 'select_accomplice');
  const acced = reduceCheeseThiefState(s, accAction as CheeseThiefAction, { now: NOW, random: ctx.random });
  if (!acced.ok) throw new Error(acced.message);
  s = acced.nextState;
  assert.equal(s.phase, 'dawn');
  // 猫 a 展示
  const catAction = callBot(s, 'a', 'smoke-cat');
  assert.ok(catAction);
  assert.equal(catAction && catAction.type, 'reveal_cat');
  const catResult = reduceCheeseThiefState(s, catAction as CheeseThiefAction, { now: NOW, random: ctx.random });
  if (!catResult.ok) throw new Error(catResult.message);
  s = catResult.nextState;
  // 狗 b 展示
  const dogAction = callBot(s, 'b', 'smoke-dog');
  assert.ok(dogAction);
  assert.equal(dogAction && dogAction.type, 'reveal_dog');
  const dogResult = reduceCheeseThiefState(s, dogAction as CheeseThiefAction, { now: NOW, random: ctx.random });
  if (!dogResult.ok) throw new Error(dogResult.message);
  s = dogResult.nextState;
  // 进入投票
  const discussion = reduceCheeseThiefState(s, { type: 'end_discussion' }, { now: NOW, random: ctx.random });
  if (!discussion.ok) throw new Error(discussion.message);
  s = discussion.nextState;
  assert.equal(s.phase, 'vote');
  // bot 投票
  for (const id of players) {
    const action = callBot(s, id, `smoke-ext-vote-${id}`);
    assert.ok(action);
    const r = reduceCheeseThiefState(s, action as CheeseThiefAction, { now: NOW, random: ctx.random });
    assert.equal(r.ok, true, `smoke-ext: ${id} 投票应被接受: ${!r.ok ? r.message : ''}`);
    s = r.ok ? r.nextState : s;
  }
  assert.equal(s.phase, 'game_over');
  assert.ok(s.winners.length > 0);
});
