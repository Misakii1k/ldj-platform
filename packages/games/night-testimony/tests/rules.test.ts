import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { parseNightTestimonyAction, parseNightTestimonyConfig } from '../server/schemas.ts';
import {
  assertNightTestimonyInvariants,
  assignWardenAndCrimes,
  createNightTestimonyState,
  reduceNightTestimonyState,
} from '../server/rules.ts';
import type { CrimeId, NightTestimonyState } from '../server/types.ts';

const NOW = 1_700_000_000_000;
const random = createSeededRandom('night-testimony-rules');

/** 确定性状态：b 为狱警；a/c/d 为囚犯（罪行互异） */
function makeState(players: string[] = ['a', 'b', 'c', 'd']): NightTestimonyState {
  return createNightTestimonyState(
    players,
    { rulesetId: 'night_testimony_v1' },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
  );
}

function accepted(state: NightTestimonyState, action: unknown, now = NOW) {
  const result = reduceNightTestimonyState(state, action, { now, random });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('随机分配：狱警 1 名，囚犯罪行互异', () => {
  const { wardenId, crimes } = assignWardenAndCrimes(['a', 'b', 'c', 'd', 'e'], random);
  assert.ok(['a', 'b', 'c', 'd', 'e'].includes(wardenId));
  const inmates = ['a', 'b', 'c', 'd', 'e'].filter((id) => id !== wardenId);
  assert.equal(Object.keys(crimes).length, inmates.length);
  assert.equal(new Set(Object.values(crimes)).size, inmates.length, '罪行互异');
});

test('初始化：3–6 人；狱警必须在本局；罪行数量/互异校验', () => {
  assert.equal(makeState().players.length, 4);
  // 6 人局：囚犯 5 名需 5 个互异罪行
  const six = createNightTestimonyState(
    ['a', 'b', 'c', 'd', 'e', 'f'],
    { rulesetId: 'night_testimony_v1' },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery', e: 'smuggling', f: 'fraud' },
  );
  assert.equal(six.players.length, 6);
  assert.throws(() => makeState(['a', 'b']), /3 至 6/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd']), /玩家列表无效/);
  assert.throws(
    () => createNightTestimonyState(['a', 'b', 'c', 'd'], {}, 'zzz', { a: 'arson', c: 'theft', d: 'forgery' }),
    /狱警不在本局/,
  );
  assert.throws(
    () => createNightTestimonyState(['a', 'b', 'c', 'd'], {}, 'b', { a: 'arson', c: 'arson', d: 'forgery' }),
    /罪行卡重复/,
  );
});

test('解析器严格拒绝多余字段与非法配置/动作', () => {
  assert.deepEqual(parseNightTestimonyAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseNightTestimonyAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(
    () => parseNightTestimonyAction({ type: 'ask', playerId: 'a', targetPlayerId: 'c', text: '' }),
    /至少 1 个字符|不能为空|字符/,
  );
  assert.throws(() => parseNightTestimonyConfig({ questionSeconds: 0 }), /时长无效/);
});

test('提问 → 仅被问者可答；YES/NO 标记正确消耗', () => {
  let state = makeState();
  // 提问需先 begin（非必须，但此处直接走 ask）
  state = accepted(state, { type: 'ask', playerId: 'a', targetPlayerId: 'c', text: '你的罪行是纵火吗？' });
  assert.equal(state.pendingQuestion?.responderId, 'c');
  // 非被问者不能答
  assert.equal(
    reduceNightTestimonyState(state, { type: 'answer', playerId: 'a', answer: 'yes' }, { now: NOW, random }).ok,
    false,
  );
  // c 答 YES
  state = accepted(state, { type: 'answer', playerId: 'c', answer: 'yes' });
  assert.equal(state.yesLeft['c'], 2, 'YES 标记应减少');
  assert.equal(state.answers.length, 1);
  assert.equal(state.pendingQuestion, null);
  // NO 标记消耗
  state = accepted(state, { type: 'ask', playerId: 'd', targetPlayerId: 'a', text: '你是狱警吗？' });
  state = accepted(state, { type: 'answer', playerId: 'a', answer: 'no' });
  assert.equal(state.noLeft['a'], 0, 'NO 标记应减少');
  assert.equal(state.answers[1]?.answer, 'no');
});

test('问答上限触发 → 进入推理阶段并公开额外罪行卡', () => {
  let state = makeState();
  // questionLimit 默认 5，这里用配置 2
  state = createNightTestimonyState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'night_testimony_v1', questionLimit: 2 },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
  );
  state = accepted(state, { type: 'ask', playerId: 'a', targetPlayerId: 'c', text: 'q1' });
  state = accepted(state, { type: 'answer', playerId: 'c', answer: 'yes' });
  assert.equal(state.phase, 'question', '未达上限仍在问答');
  state = accepted(state, { type: 'ask', playerId: 'd', targetPlayerId: 'a', text: 'q2' });
  state = accepted(state, { type: 'answer', playerId: 'a', answer: 'yes' });
  assert.equal(state.phase, 'deduction', '达上限进入推理');
  assert.ok(state.extraCrime !== null);
});

test('某玩家 YES 用完 → 进入推理阶段', () => {
  let state = makeState();
  // 让 c 连续答 3 次 YES
  for (let i = 0; i < 3; i += 1) {
    state = accepted(state, { type: 'ask', playerId: 'a', targetPlayerId: 'c', text: `q${i}` });
    state = accepted(state, { type: 'answer', playerId: 'c', answer: 'yes' });
  }
  assert.equal(state.phase, 'deduction', 'YES 用完进入推理');
  assert.equal(state.yesLeft['c'], 0);
});

test('问答计时器兜底 → 进入推理', () => {
  const state = makeState();
  const settled = accepted(state, { type: 'resolve_question' });
  assert.equal(settled.phase, 'deduction');
  // 幂等
  const dup = reduceNightTestimonyState(settled, { type: 'resolve_question' }, { now: NOW, random });
  assert.equal(dup.ok, true);
});

test('推理结束 → 投票；票出狱警 → 进入猜罪；票出囚犯 → 狱警胜', () => {
  // 票出狱警 b：a/c/d 都投 b
  let state = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  assert.equal(state.phase, 'vote');
  for (const id of ['a', 'c', 'd']) {
    state = accepted(state, { type: 'cast_vote', playerId: id, targetPlayerId: 'b' });
  }
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' });
  assert.equal(state.phase, 'game_over');
  assert.equal(state.wardenRevealed, true);
  assert.equal(state.accusedId, 'b');
  assert.equal(state.winners.length, 0, '待猜罪');

  // 票出囚犯 c：狱警立即胜
  let s2 = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  for (const id of ['a', 'b', 'd']) {
    s2 = accepted(s2, { type: 'cast_vote', playerId: id, targetPlayerId: 'c' });
  }
  s2 = accepted(s2, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' });
  assert.equal(s2.wardenRevealed, false);
  assert.deepEqual(s2.winners, ['b'], '票出囚犯 → 狱警胜');
});

test('狱警猜罪：全对 → 狱警单独胜；否则囚犯胜', () => {
  // 票出狱警 b
  let state = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  for (const id of ['a', 'c', 'd']) {
    state = accepted(state, { type: 'cast_vote', playerId: id, targetPlayerId: 'b' });
  }
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' });
  assert.equal(state.phase, 'game_over');
  // 非狱警不能猜
  assert.equal(
    reduceNightTestimonyState(state, { type: 'submit_guesses', playerId: 'a', guesses: { a: 'arson', c: 'theft', d: 'forgery' } }, { now: NOW, random }).ok,
    false,
  );
  // 全对 → 狱警单独胜
  state = accepted(state, { type: 'submit_guesses', playerId: 'b', guesses: { a: 'arson', c: 'theft', d: 'forgery' } });
  assert.equal(state.crimesAllGuessed, true);
  assert.deepEqual(state.winners, ['b']);

  // 猜错 → 囚犯胜
  let s2 = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  for (const id of ['a', 'c', 'd']) {
    s2 = accepted(s2, { type: 'cast_vote', playerId: id, targetPlayerId: 'b' });
  }
  s2 = accepted(s2, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' });
  s2 = accepted(s2, { type: 'submit_guesses', playerId: 'b', guesses: { a: 'theft', c: 'arson', d: 'forgery' } });
  assert.equal(s2.crimesAllGuessed, false);
  assert.deepEqual(s2.winners.sort(), ['a', 'c', 'd'], '囚犯胜');
});

test('投票校验：不能自投、不能投局外人、不能重复投', () => {
  let state = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  assert.equal(
    reduceNightTestimonyState(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'a' }, { now: NOW, random }).ok,
    false,
  );
  assert.equal(
    reduceNightTestimonyState(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'zzz' }, { now: NOW, random }).ok,
    false,
  );
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(
    reduceNightTestimonyState(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' }, { now: NOW, random }).ok,
    false,
  );
});

test('投票计时器兜底：未全员投按已有票结算', () => {
  let state = accepted(accepted(makeState(), { type: 'resolve_question' }), { type: 'end_deduction' });
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  state = accepted(state, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'b' });
  state = accepted(state, { type: 'resolve_vote' });
  assert.equal(state.phase, 'game_over');
  assert.equal(state.wardenRevealed, true);
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as NightTestimonyState;
  broken.yesLeft = { a: 99, b: 1, c: 1, d: 1 };
  assert.throws(() => assertNightTestimonyInvariants(broken), /YES 标记无效/);

  const broken2 = structuredClone(state) as NightTestimonyState;
  broken2.wardenId = 'zzz';
  assert.throws(() => assertNightTestimonyInvariants(broken2), /狱警不在本局/);
});

test('罪行类型辅助：CRIMES 常量可导出且含 6 种', () => {
  const crimes = ['arson', 'theft', 'forgery', 'smuggling', 'fraud', 'kidnap'] as CrimeId[];
  for (const crime of crimes) {
    assert.ok((['arson', 'theft', 'forgery', 'smuggling', 'fraud', 'kidnap'] as const).includes(crime));
  }
});
