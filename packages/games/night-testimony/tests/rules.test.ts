import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { parseNightTestimonyAction, parseNightTestimonyConfig } from '../server/schemas.ts';
import {
  assertNightTestimonyInvariants,
  assignRolesAndCrimes,
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
    { rulesetId: 'night_testimony_v1', maxYesPerPlayer: 3, questionLimit: 5 },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
    'smuggling',
  );
}

function accepted(state: NightTestimonyState, action: unknown, now = NOW) {
  const result = reduceNightTestimonyState(state, action, { now, random });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('随机分配：狱警 1 名，囚犯罪行互异，额外混入 1 张干扰罪行', () => {
  const { wardenId, crimes, extraCrime } = assignRolesAndCrimes(['a', 'b', 'c', 'd', 'e'], random);
  assert.ok(['a', 'b', 'c', 'd', 'e'].includes(wardenId));
  const inmates = ['a', 'b', 'c', 'd', 'e'].filter((id) => id !== wardenId);
  assert.equal(Object.keys(crimes).length, inmates.length);
  assert.equal(new Set(Object.values(crimes)).size, inmates.length, '罪行互异');
  assert.ok(extraCrime, '存在额外罪行卡');
  assert.ok(!Object.values(crimes).includes(extraCrime), '额外罪行不与在场囚犯冲突');
});

test('初始化：3–6 人；狱警必须在本局；罪行数量/互异校验', () => {
  assert.equal(makeState().players.length, 4);
  const six = createNightTestimonyState(
    ['a', 'b', 'c', 'd', 'e', 'f'],
    { rulesetId: 'night_testimony_v1' },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery', e: 'smuggling', f: 'fraud' },
    'kidnap',
  );
  assert.equal(six.players.length, 6);
  assert.throws(() => makeState(['a', 'b']), /3 至 6/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd']), /玩家列表无效/);
  assert.throws(
    () => createNightTestimonyState(['a', 'b', 'c', 'd'], {}, 'zzz', { a: 'arson', c: 'theft', d: 'forgery' }),
    /狱警必须在玩家列表中/,
  );
  assert.throws(
    () => createNightTestimonyState(['a', 'b', 'c', 'd'], {}, 'b', { a: 'arson', c: 'arson', d: 'forgery' }),
    /囚犯罪行必须互不相同/,
  );
});

test('解析器严格拒绝多余字段与非法配置/动作', () => {
  assert.deepEqual(parseNightTestimonyAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseNightTestimonyAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(
    () => parseNightTestimonyAction({ type: 'pick_question_card', playerId: 'a', cardId: '' }),
    /不能为空/,
  );
  assert.throws(() => parseNightTestimonyConfig({ maxYesPerPlayer: 0 }), /greater than or equal to 1/);
});

test('提问与全员作答：提问者选卡，全员依次提交 YES/NO', () => {
  let state = makeState();
  // a 出题（只能选本轮提供的卡）
  state = accepted(state, { type: 'pick_question_card', playerId: 'a', cardId: state.pendingCardChoices![0]!.id });
  assert.ok(state.currentQuestion);
  assert.equal(state.currentQuestion.questionerId, 'a');

  // 全员作答
  state = accepted(state, { type: 'answer_question', playerId: 'a', answer: 'no' });
  state = accepted(state, { type: 'answer_question', playerId: 'b', answer: 'yes' });
  state = accepted(state, { type: 'answer_question', playerId: 'c', answer: 'yes' });
  state = accepted(state, { type: 'answer_question', playerId: 'd', answer: 'no' });

  assert.equal(state.history.length, 1);
  assert.equal(state.currentQuestion, null);
  assert.equal(state.playerYesCounts['b'], 1);
  assert.equal(state.playerYesCounts['c'], 1);
  assert.equal(state.playerYesCounts['a'], 0);
  assert.equal(state.currentQuestionerId, 'b', '顺时针轮到下一位出题');
});

test('单人累计 3 个 YES 触发终止进入投票', () => {
  let state = makeState();
  // 模拟连续 3 题，玩家 c 都回答 yes
  for (let i = 1; i <= 3; i += 1) {
    const qer = state.currentQuestionerId;
    state = accepted(state, { type: 'pick_question_card', playerId: qer, cardId: state.pendingCardChoices![0]!.id });
    for (const p of state.players) {
      state = accepted(state, { type: 'answer_question', playerId: p, answer: p === 'c' ? 'yes' : 'no' });
    }
  }
  assert.equal(state.playerYesCounts['c'], 3);
  assert.equal(state.phase, 'vote', 'c 累计达到 3 个 YES，自动进入投票阶段');
});

test('全局提问达到 5 题触发终止进入投票', () => {
  let state = makeState();
  // 模拟 5 道题，所有人均答 no
  for (let i = 1; i <= 5; i += 1) {
    const qer = state.currentQuestionerId;
    state = accepted(state, { type: 'pick_question_card', playerId: qer, cardId: state.pendingCardChoices![0]!.id });
    for (const p of state.players) {
      state = accepted(state, { type: 'answer_question', playerId: p, answer: 'no' });
    }
  }
  assert.equal(state.history.length, 5);
  assert.equal(state.phase, 'vote', '满 5 题自动进入投票阶段');
});

test('囚犯主动自告身份：公开真实罪行，排除狱警嫌疑；不参与问题回答，出题跳过，禁止被投票指认', () => {
  let state = makeState();
  // a 出题前先自告身份
  state = accepted(state, { type: 'self_expose', playerId: 'a' });
  assert.equal(state.revealedIdentities['a'], 'arson');
  assert.equal(state.phase, 'question', '囚犯自告不中断提问阶段');
  // 出题人自动轮转到下一个未自告者
  assert.notEqual(state.currentQuestionerId, 'a');

  // 下一个出题者出题
  const qId = state.currentQuestionerId;
  const cardId = state.pendingCardChoices![0]!.id;
  state = accepted(state, { type: 'pick_question_card', playerId: qId, cardId });

  // a 已自告，尝试回答应被拒绝
  assert.equal(reduceNightTestimonyState(state, { type: 'answer_question', playerId: 'a', answer: 'yes' }, { now: NOW, random }).ok, false);

  // 剩余未自告玩家 (b, c, d) 提交作答即可完成本题
  state = accepted(state, { type: 'answer_question', playerId: 'b', answer: 'no' });
  state = accepted(state, { type: 'answer_question', playerId: 'c', answer: 'yes' });
  state = accepted(state, { type: 'answer_question', playerId: 'd', answer: 'no' });
  assert.equal(state.history.length, 1, '未自告者全员回答后题目完成');

  // 进入投票阶段：测试其他人不能投已自告的 a
  state.phase = 'vote';
  assert.equal(reduceNightTestimonyState(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' }, { now: NOW, random }).ok, false);
  // a 自身可以投票（只参与狱警指认）
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(state.votes['a'], 'b');
});

test('狱警主动自曝身份：直接进入终局猜罪大舞台', () => {
  let state = makeState();
  state = accepted(state, { type: 'self_expose', playerId: 'b' });
  assert.equal(state.revealedIdentities['b'], 'warden');
  assert.equal(state.wardenRevealed, true);
  assert.equal(state.guessingInProgress, true);
  assert.equal(state.phase, 'game_over');
});

test('投票：票出囚犯 → 狱警直接独胜', () => {
  let state = makeState();
  state.phase = 'vote';
  // a/b/d 都投 c（c 是囚犯）
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'c' });
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'c' });
  state = accepted(state, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' });
  state = accepted(state, { type: 'cast_vote', playerId: 'd', targetPlayerId: 'c' });

  assert.equal(state.phase, 'game_over');
  assert.equal(state.wardenRevealed, false);
  assert.deepEqual(state.winners, ['b'], '票出囚犯，狱警独胜');
});

test('投票：票出狱警 → 触发猜罪环节，全对狱警胜，猜错囚犯胜', () => {
  let state = makeState();
  state.phase = 'vote';
  // a/c/d 都投 b（b 是狱警）
  state = accepted(state, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  state = accepted(state, { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' });
  state = accepted(state, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'b' });
  state = accepted(state, { type: 'cast_vote', playerId: 'd', targetPlayerId: 'b' });

  assert.equal(state.wardenRevealed, true);
  assert.equal(state.guessingInProgress, true);

  // 1. 猜错情况
  const wrongState = accepted(state, {
    type: 'submit_guesses',
    playerId: 'b',
    guesses: { a: 'theft', c: 'arson', d: 'forgery' },
  });
  assert.equal(wrongState.crimesAllGuessed, false);
  assert.deepEqual(wrongState.winners.sort(), ['a', 'c', 'd'], '狱警猜错，囚犯联盟获胜');

  // 2. 全对情况
  const correctState = accepted(state, {
    type: 'submit_guesses',
    playerId: 'b',
    guesses: { a: 'arson', c: 'theft', d: 'forgery' },
  });
  assert.equal(correctState.crimesAllGuessed, true);
  assert.deepEqual(correctState.winners, ['b'], '狱警全部猜对，惊天翻盘独胜');
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as NightTestimonyState;
  broken.playerYesCounts = { a: -1, b: 0, c: 0, d: 0 };
  assert.throws(() => assertNightTestimonyInvariants(broken), /YES 计数无效/);

  const broken2 = structuredClone(state) as NightTestimonyState;
  broken2.wardenId = 'zzz';
  assert.throws(() => assertNightTestimonyInvariants(broken2), /狱警不在本局/);
});
