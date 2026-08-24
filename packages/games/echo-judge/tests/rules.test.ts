import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEchoJudgeAction, parseEchoJudgeConfig } from '../server/schemas.ts';
import {
  assertEchoJudgeInvariants,
  assignRoles,
  createEchoJudgeState,
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

test('身份分配：判官为人类；各伪人获得不重复触发词', () => {
  const { roles, triggerWords } = assignRoles(['a', 'b', 'c', 'd', 'e', 'f'], 'a', {
    nextInt(_min, _max) { return 0; },
    shuffle<T>(items: readonly T[]): T[] { return [...items]; },
  });
  assert.equal(roles['a'], 'human');
  const impostors = Object.entries(roles).filter(([, role]) => role === 'impostor').map(([id]) => id);
  assert.equal(impostors.length, 1);
  assert.ok(triggerWords[impostors[0]!]);
});

test('自由选择阵营：非判官玩家可自由切换人类与伪人', () => {
  let state = makeState();
  assert.equal(state.roles['c'], 'human');
  // c 切换为伪人
  state = accepted(state, { type: 'choose_role', playerId: 'c', role: 'impostor' });
  assert.equal(state.roles['c'], 'impostor');
  assert.ok(state.triggerWords['c'], '成为伪人应动态获得触发词');

  // c 切换回人类
  state = accepted(state, { type: 'choose_role', playerId: 'c', role: 'human' });
  assert.equal(state.roles['c'], 'human');
  assert.equal(state.triggerWords['c'], undefined, '切换回人类应清空触发词');

  // 判官不能选择伪人
  assert.equal(
    reduceEchoJudgeState(state, { type: 'choose_role', playerId: 'a', role: 'impostor' }, { now: NOW }).ok,
    false,
  );
});

test('初始化：3–12 人；判官必须在本局且为人类', () => {
  assert.equal(makeState().players.length, 4);
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

test('判官出题 → 按序发言推进 → 全部答完进入指认', () => {
  let state = makeState();
  assert.equal(state.phase, 'judge_setup');
  state = accepted(state, { type: 'start_round', playerId: 'a', question: '你最喜欢什么季节？' });
  assert.equal(state.phase, 'answering');
  assert.deepEqual(state.answerOrder, ['b', 'c', 'd']);
  assert.equal(state.currentSpeakerId, 'b');

  state = accepted(state, { type: 'finish_speaking', playerId: 'b' });
  assert.equal(state.currentSpeakerId, 'c');
  state = accepted(state, { type: 'finish_speaking', playerId: 'c' });
  assert.equal(state.currentSpeakerId, 'd');
  state = accepted(state, { type: 'finish_speaking', playerId: 'd' });
  assert.equal(state.phase, 'judgment');
});

test('多选指认：抓对多个伪人 / 误抓人类 / 潜伏伪人计分结算', () => {
  // b 和 c 为伪人，d 为人类
  let state = createEchoJudgeState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'echo_judge_v1' },
    'a',
    '',
    { a: 'human', b: 'impostor', c: 'impostor', d: 'human' },
    { b: '月亮', c: '面条' },
  );
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  for (const id of ['b', 'c', 'd']) {
    state = accepted(state, { type: 'finish_speaking', playerId: id });
  }
  assert.equal(state.phase, 'judgment');

  // 判官 a 指认 b 和 d（b 是伪人抓对+1，d 是人类误抓-1；c 是伪人逃脱+2）
  state = accepted(state, { type: 'accuse', playerId: 'a', targetPlayerIds: ['b', 'd'] });
  assert.deepEqual(state.caughtImpostors, ['b']);
  assert.deepEqual(state.wrongAccusations, ['d']);
  assert.deepEqual(state.escapedImpostors, ['c']);

  assert.equal(state.scores['a'], 0, '判官 +1 (抓对b) -1 (误抓d) = 0');
  assert.equal(state.scores['b'], -1, '被抓伪人 -1');
  assert.equal(state.scores['c'], 2, '逃脱伪人 +2');
  assert.equal(state.scores['d'], 0, '人类未受惩罚');
});

test('多选指认：场上无伪人且判官空指认 → 判官 +1', () => {
  // 全员人类
  let state = createEchoJudgeState(
    ['a', 'b', 'c', 'd'],
    { rulesetId: 'echo_judge_v1' },
    'a',
    '',
    { a: 'human', b: 'human', c: 'human', d: 'human' },
    {},
  );
  state = accepted(state, { type: 'start_round', playerId: 'a', question: 'q' });
  for (const id of ['b', 'c', 'd']) {
    state = accepted(state, { type: 'finish_speaking', playerId: id });
  }
  // 判官指认 0 人
  state = accepted(state, { type: 'accuse', playerId: 'a', targetPlayerIds: [] });
  assert.equal(state.scores['a'], 1, '无伪人且空指认，判官明察 +1');
});

test('所有玩家当过判官后结束，最高分获胜', () => {
  let state = makeState();
  for (let round = 1; round <= 4; round += 1) {
    const judge = state.judgeId;
    state = accepted(state, { type: 'start_round', playerId: judge, question: `q-${round}` });
    for (const id of state.players.filter((id) => id !== judge)) {
      state = accepted(state, { type: 'finish_speaking', playerId: id });
    }
    const target = state.players.filter((id) => id !== judge)[0]!;
    state = accepted(state, { type: 'accuse', playerId: judge, targetPlayerIds: [target] });
  }
  assert.equal(state.phase, 'game_over', '4 人当局每人当一次判官后结束');
  assert.ok(state.winners.length > 0);
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as EchoJudgeState;
  broken.judgeId = 'zzz';
  assert.throws(() => assertEchoJudgeInvariants(broken), /判官不在本局/);
});
