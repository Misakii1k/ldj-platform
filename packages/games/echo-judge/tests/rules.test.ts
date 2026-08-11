import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEchoJudgeAction, parseEchoJudgeConfig } from '../server/schemas.ts';
import {
  assertEchoJudgeInvariants,
  assignRoles,
  createEchoJudgeState,
  impostorCountFor,
  reduceEchoJudgeState,
} from '../server/rules.ts';
import type { EchoJudgeState } from '../server/types.ts';

const NOW = 1_700_000_000_000;

/** 确定性状态：a 判官，b/c/d 回答；b 伪人 c/d 人类；题目留空由判官出题 */
function makeState(players: string[] = ['a', 'b', 'c', 'd'], question = '') {
  return createEchoJudgeState(
    players,
    { rulesetId: 'echo_judge_v1' },
    'a',
    question,
    { a: 'human', b: 'impostor', c: 'human', d: 'human' },
    { b: '月亮' },
  );
}

function accepted(state: EchoJudgeState, action: unknown, now = NOW) {
  const result = reduceEchoJudgeState(state, action, { now });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('伪人数量：3–4 人 1、5–8 人 2、9–12 人 3', () => {
  assert.equal(impostorCountFor(3), 1);
  assert.equal(impostorCountFor(4), 1);
  assert.equal(impostorCountFor(5), 2);
  assert.equal(impostorCountFor(8), 2);
  assert.equal(impostorCountFor(9), 3);
  assert.equal(impostorCountFor(12), 3);
});

test('身份分配：判官为人类；伪人数量正确且各获不重复触发词', () => {
  const { roles, triggerWords } = assignRoles(['a', 'b', 'c', 'd', 'e', 'f'], 'a', {
    nextInt(_min, _max) { return 0; },
    shuffle<T>(items: readonly T[]): T[] { return [...items]; },
  });
  assert.equal(roles['a'], 'human');
  const impostors = Object.entries(roles).filter(([, role]) => role === 'impostor').map(([id]) => id);
  assert.equal(impostors.length, 2);
  assert.equal(new Set(impostors.map((id) => triggerWords[id])).size, 2, '触发词不重复');
});

test('初始化：3–12 人；判官必须在本局且为人类；伪人数量校验', () => {
  assert.equal(makeState().players.length, 4);
  // 9 人局需 3 个伪人（b/c/d 伪人）
  const nine = createEchoJudgeState(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    { rulesetId: 'echo_judge_v1' },
    'a',
    '',
    { a: 'human', b: 'impostor', c: 'impostor', d: 'impostor', e: 'human', f: 'human', g: 'human', h: 'human', i: 'human' },
    { b: '月亮', c: '面条', d: '雨伞' },
  );
  assert.equal(nine.players.length, 9);
  assert.throws(() => makeState(['a', 'b']), /3 至 12/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd']), /玩家列表无效/);
  assert.throws(
    () => createEchoJudgeState(['a', 'b', 'c'], {}, 'zzz', '', { a: 'human', b: 'impostor', c: 'human' }, { b: '月亮' }),
    /判官不在本局/,
  );
  assert.throws(
    () => createEchoJudgeState(['a', 'b', 'c'], {}, 'a', '', { a: 'impostor', b: 'human', c: 'human' }, {}),
    /判官不能是伪人/,
  );
});

test('解析器严格拒绝多余字段与非法配置/动作', () => {
  assert.deepEqual(parseEchoJudgeAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseEchoJudgeAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(
    () => parseEchoJudgeAction({ type: 'start_round', playerId: 'a', question: '' }),
    /题目不能为空/,
  );
  assert.throws(() => parseEchoJudgeConfig({ answerSeconds: 0 }), /时长无效/);
});

test('判官出题 → 按序回答 → 全部答完进入指认', () => {
  let state = makeState();
  assert.equal(state.phase, 'judge_setup');
  state = accepted(state, { type: 'start_round', playerId: 'a', question: '你最喜欢什么季节？' });
  assert.equal(state.phase, 'answering');
  assert.deepEqual(state.answerOrder, ['b', 'c', 'd']);
  // 越位：d 先答被拒
  assert.equal(
    reduceEchoJudgeState(state, { type: 'submit_answer', playerId: 'd', text: 'x' }, { now: NOW }).ok,
    false,
  );
  state = accepted(state, { type: 'submit_answer', playerId: 'b', text: '我夏天' });
  state = accepted(state, { type: 'submit_answer', playerId: 'c', text: '我秋天' });
  state = accepted(state, { type: 'submit_answer', playerId: 'd', text: '我冬天' });
  assert.equal(state.phase, 'judgment');
  assert.equal(Object.keys(state.answers).length, 3, '全部回答已提交');
});

test('判官抓对 → 判官 +1、被抓伪人 −1', () => {
  let state = makeState();
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  for (const id of ['b', 'c', 'd']) {
    state = accepted(state, { type: 'submit_answer', playerId: id, text: `a${id}` });
  }
  state = accepted(state, { type: 'accuse', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(state.caughtImpostor, true);
  assert.equal(state.scores['a'], 1, '判官抓对 +1');
  assert.equal(state.scores['b'], -1, '被抓伪人 −1');
  // a 结算后轮换到下一名人类（跳过伪人 b）→ c 当判官
  assert.equal(state.phase, 'judge_setup');
  assert.equal(state.judgeId, 'c');
  assert.equal(state.round, 2);
});

test('判官抓错 → 判官扣分、隐藏伪人 +2', () => {
  let state = makeState();
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  for (const id of ['b', 'c', 'd']) {
    state = accepted(state, { type: 'submit_answer', playerId: id, text: `a${id}` });
  }
  state = accepted(state, { type: 'accuse', playerId: 'a', targetPlayerId: 'c' });
  assert.equal(state.caughtImpostor, false);
  assert.equal(state.scores['a'], -1, '判官抓错扣分');
  assert.equal(state.scores['b'], 2, '伪人隐藏成功 +2');
});

test('判官指认超时兜底：伪人全部 +2，判官不扣分', () => {
  let state = makeState();
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  for (const id of ['b', 'c', 'd']) {
    state = accepted(state, { type: 'submit_answer', playerId: id, text: `a${id}` });
  }
  state = accepted(state, { type: 'resolve_round', playerId: 'a' });
  assert.equal(state.caughtImpostor, false);
  assert.equal(state.scores['a'], 0, '判官超时不扣分');
  assert.equal(state.scores['b'], 2);
});

test('回答超时兜底：system 自动提交"超时未答"推进', () => {
  let state = makeState();
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  state = accepted(state, { type: 'submit_answer', playerId: 'b', text: '（超时未答）' });
  state = accepted(state, { type: 'submit_answer', playerId: 'c', text: '（超时未答）' });
  state = accepted(state, { type: 'submit_answer', playerId: 'd', text: '（超时未答）' });
  assert.equal(state.phase, 'judgment');
});

test('所有玩家当过判官后结束，最高分获胜', () => {
  // 4 人局：b 是伪人 → 人类判官 a→c→d 各当一次，3 轮后终局（连续推进验证轮换）
  let state = makeState();
  const judges: string[] = [];
  for (let round = 1; round <= 3; round += 1) {
    const judge = state.judgeId;
    judges.push(judge);
    state = accepted(state, { type: 'start_round', playerId: judge, question: `q-${round}` });
    for (const id of ['a', 'b', 'c', 'd'].filter((id) => id !== judge)) {
      state = accepted(state, { type: 'submit_answer', playerId: id, text: `a-${id}` });
    }
    state = accepted(state, { type: 'accuse', playerId: judge, targetPlayerId: 'b' });
  }
  assert.deepEqual(judges, ['a', 'c', 'd'], '人类判官轮换跳过伪人 b');
  assert.equal(state.phase, 'game_over', '所有人类当过判官后结束');
  assert.ok(state.winners.length > 0);
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as EchoJudgeState;
  broken.judgeId = 'zzz';
  assert.throws(() => assertEchoJudgeInvariants(broken), /判官不在本局/);

  const broken2 = structuredClone(state) as EchoJudgeState;
  broken2.roles = { a: 'human', b: 'impostor', c: 'human', d: 'impostor' };
  assert.throws(() => assertEchoJudgeInvariants(broken2), /伪人数量无效/);
});
