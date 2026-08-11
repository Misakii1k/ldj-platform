import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGooseRelayAction, parseGooseRelayConfig } from '../server/schemas.ts';
import {
  assertGooseRelayInvariants,
  createGooseRelayState,
  evilCountFor,
  reduceGooseRelayState,
} from '../server/rules.ts';
import type { CaseCard, GooseRelayState } from '../server/types.ts';

const NOW = 1_700_000_000_000;
const CARD_A: CaseCard = { murderer: 'grey_goose', victim: 'white_goose', tool: 'knife', scene: 'barn' };

function makeState(
  players: string[] = ['a', 'b', 'c', 'd', 'e'],
  caseCard: CaseCard = CARD_A,
  evilGeese: string[] = ['c'],
  configInput: unknown = { rulesetId: 'goose_relay_classic_v1' },
): GooseRelayState {
  return createGooseRelayState(players, configInput, caseCard, evilGeese);
}

function accepted(state: GooseRelayState, action: unknown, now = NOW) {
  const result = reduceGooseRelayState(state, action, { now });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 完整传递：全员按序提交给定案情 */
function relayAll(state: GooseRelayState, cases: CaseCard[]): GooseRelayState {
  let s = state;
  for (let i = 0; i < cases.length; i += 1) {
    s = accepted(s, { type: 'transmit', playerId: s.lineOrder[i]!, case: cases[i]! });
  }
  return s;
}

/** 讨论后进入指认阶段 */
function toAccusation(state: GooseRelayState): GooseRelayState {
  const s = relayAll(state, [CARD_A, CARD_A, CARD_A, CARD_A, CARD_A]);
  assert.equal(s.phase, 'discussion');
  return accepted(s, { type: 'end_discussion' });
}

test('恶鹅数量：5–6 人 1 只、7–9 人 2 只', () => {
  assert.equal(evilCountFor(5), 1);
  assert.equal(evilCountFor(6), 1);
  assert.equal(evilCountFor(7), 2);
  assert.equal(evilCountFor(9), 2);
});

test('初始化接受 5 至 9 人并拒绝边界外、重复玩家与非法恶鹅名单', () => {
  assert.equal(makeState(['a', 'b', 'c', 'd', 'e']).players.length, 5);
  assert.equal(
    makeState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], CARD_A, ['c', 'd']).players.length,
    9,
  );
  assert.throws(() => makeState(['a', 'b', 'c', 'd']), /5 至 9/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd', 'e']), /玩家列表无效/);
  assert.throws(() => makeState(['a', 'b', 'c', 'd', 'e'], CARD_A, ['c', 'd']), /恶鹅数量无效/);
  assert.throws(() => makeState(['a', 'b', 'c', 'd', 'e'], CARD_A, ['a']), /恶鹅名单无效/, '头鹅不能是恶鹅');
});

test('解析器严格拒绝多余字段与非法案情卡', () => {
  assert.deepEqual(parseGooseRelayAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseGooseRelayAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(() => parseGooseRelayAction({ type: 'transmit', playerId: 'a', case: { ...CARD_A, murderer: 'no_such' } }), /凶手无效/);
  assert.throws(() => parseGooseRelayAction({ type: 'transmit', playerId: 'a', case: { ...CARD_A, victim: CARD_A.murderer } }), /凶手与被害人不能相同/);
  assert.throws(() => parseGooseRelayAction({ type: 'accuse', playerId: 'e', murderer: 'no_such', victim: 'white_goose' }), /凶手无效/);
  assert.throws(() => parseGooseRelayConfig({ relaySeconds: 0 }), /时长无效/);
  // 讨论时长为 0 合法（跳过讨论直接进入指认）
  assert.deepEqual(parseGooseRelayConfig({ discussionSeconds: 0 }).discussionSeconds, 0);
});

test('传递按队列顺序推进，越位与重复提交被拒', () => {
  const state = makeState();
  // 头鹅先传
  const head = accepted(state, { type: 'transmit', playerId: 'a', case: CARD_A });
  assert.equal(head.phase, 'relay');
  assert.equal(head.currentIndex, 1);
  // c 抢跑被拒
  const jumped = reduceGooseRelayState(head, { type: 'transmit', playerId: 'c', case: CARD_A }, { now: NOW });
  assert.equal(jumped.ok, false, '未轮到的玩家不能传递');
  // b 重复提交被拒
  const b1 = accepted(head, { type: 'transmit', playerId: 'b', case: CARD_A });
  assert.equal(reduceGooseRelayState(b1, { type: 'transmit', playerId: 'b', case: CARD_A }, { now: NOW }).ok, false);
});

test('relay_timeout 自动忠实复述（头鹅用原始案情，其余用上一位演绎）', () => {
  const state = makeState();
  const head = accepted(state, { type: 'relay_timeout', index: 0 });
  assert.deepEqual(head.transmissions[0], CARD_A, '头鹅超时自动使用原始案情');
  assert.equal(head.phase, 'relay');
  const b = accepted(head, { type: 'relay_timeout', index: 1 });
  assert.deepEqual(b.transmissions[1], CARD_A, 'b 超时自动复述头鹅演绎');
  assert.equal(b.phase, 'relay');
  assert.equal(b.currentIndex, 2);
  // 已提交节点重复超时 → 幂等
  const dup = reduceGooseRelayState(b, { type: 'relay_timeout', index: 0 }, { now: NOW });
  assert.equal(dup.ok, true);
  if (dup.ok) assert.equal(dup.nextState, b);
});

test('讨论结束进入指认：从末位起逐一指认', () => {
  const s = toAccusation(makeState());
  assert.equal(s.phase, 'accusation');
  assert.equal(s.currentAccuserIndex, 4, '从末位（下标 4）开始指认');
  // 非当前指认者越位被拒
  const jumped = reduceGooseRelayState(s, { type: 'accuse', playerId: 'a', murderer: 'grey_goose', victim: 'white_goose' }, { now: NOW });
  assert.equal(jumped.ok, false, '未轮到的人不能指认');
});

test('末位指对 → 立即进入投票，停止后续指认', () => {
  // e（末位）直接指对
  let s = toAccusation(makeState());
  s = accepted(s, { type: 'accuse', playerId: 'e', murderer: 'grey_goose', victim: 'white_goose' });
  assert.equal(s.caseMatched, true);
  assert.equal(s.phase, 'vote', '指对后立即进入投票');
  assert.equal(s.accusations.length, 1);
});

test('末位指错 → 依次向前，全部指完仍无人指对 → 恶鹅胜', () => {
  // 全员都指错（用 CARD_B 的凶手/被害人）
  let s = toAccusation(makeState());
  for (let i = 4; i >= 0; i -= 1) {
    s = accepted(s, { type: 'accuse', playerId: s.lineOrder[i]!, murderer: 'brown_goose', victim: 'black_goose' });
  }
  assert.equal(s.phase, 'game_over');
  assert.equal(s.caseMatched, false, '无人指对');
  assert.deepEqual(s.winners, ['c'], '恶鹅获胜');
  assert.equal(s.evilIdentified, false);
});

test('中途有人指对 → 进入投票；投中恶鹅 → 白鹅胜；投错 → 恶鹅胜', () => {
  // d 指对（不是末位），随后进入投票
  let s = toAccusation(makeState());
  s = accepted(s, { type: 'accuse', playerId: 'e', murderer: 'brown_goose', victim: 'black_goose' });
  assert.equal(s.phase, 'accusation', 'e 指错继续');
  assert.equal(s.currentAccuserIndex, 3);
  s = accepted(s, { type: 'accuse', playerId: 'd', murderer: 'grey_goose', victim: 'white_goose' });
  assert.equal(s.phase, 'vote', 'd 指对进入投票');
  // 投中恶鹅 c
  let voting = s;
  for (const id of ['a', 'b', 'd', 'e']) {
    voting = accepted(voting, { type: 'cast_vote', playerId: id, targetPlayerId: 'c' });
  }
  voting = accepted(voting, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' });
  assert.equal(voting.phase, 'game_over');
  assert.equal(voting.caseMatched, true);
  assert.equal(voting.evilIdentified, true, '并列最高票均为恶鹅 → 投中');
  assert.equal(voting.winners.some((id) => id === 'c'), false, '白鹅胜');

  // 投错（大家投 a）→ 恶鹅胜
  let s2 = toAccusation(makeState());
  s2 = accepted(s2, { type: 'accuse', playerId: 'e', murderer: 'brown_goose', victim: 'black_goose' });
  s2 = accepted(s2, { type: 'accuse', playerId: 'd', murderer: 'grey_goose', victim: 'white_goose' });
  assert.equal(s2.phase, 'vote');
  for (const id of ['b', 'd', 'e']) {
    s2 = accepted(s2, { type: 'cast_vote', playerId: id, targetPlayerId: 'a' });
  }
  s2 = accepted(s2, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' });
  s2 = accepted(s2, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(s2.phase, 'game_over');
  assert.equal(s2.caseMatched, true);
  assert.equal(s2.evilIdentified, false, '最高票为 a（非恶鹅）→ 投错');
  assert.deepEqual(s2.winners, ['c'], '恶鹅胜');
});

test('指认超时兜底：视为指错并推进；全部超时 → 恶鹅胜', () => {
  let s = toAccusation(makeState());
  for (let i = 4; i >= 0; i -= 1) {
    s = accepted(s, { type: 'accusation_timeout' });
  }
  assert.equal(s.phase, 'game_over');
  assert.equal(s.caseMatched, false);
  assert.deepEqual(s.winners, ['c'], '恶鹅胜');
});

test('投票校验：不能自投、不能投局外人、不能重复投', () => {
  let s = toAccusation(makeState());
  s = accepted(s, { type: 'accuse', playerId: 'e', murderer: 'grey_goose', victim: 'white_goose' });
  assert.equal(s.phase, 'vote');
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'a' }, { now: NOW }).ok, false, '不能自投');
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'zzz' }, { now: NOW }).ok, false);
  s = accepted(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' }, { now: NOW }).ok, false, '不能重复投');
});

test('讨论时长 0 时传递完成直接进入指认', () => {
  const state = makeState(['a', 'b', 'c', 'd', 'e'], CARD_A, ['c'], { rulesetId: 'goose_relay_classic_v1', discussionSeconds: 0 });
  const relayed = relayAll(state, [CARD_A, CARD_A, CARD_A, CARD_A, CARD_A]);
  assert.equal(relayed.phase, 'accusation', '跳过讨论直接指认');
  assert.equal(relayed.currentAccuserIndex, 4);
});

test('计时器动作幂等', () => {
  const state = makeState();
  const relayed = relayAll(state, [CARD_A, CARD_A, CARD_A, CARD_A, CARD_A]);
  const accusation = accepted(relayed, { type: 'end_discussion' });
  const dup = reduceGooseRelayState(accusation, { type: 'end_discussion' }, { now: NOW });
  assert.equal(dup.ok, true);
  if (dup.ok) assert.equal(dup.nextState, accusation);
  const dupTimeout = reduceGooseRelayState(accusation, { type: 'accusation_timeout' }, { now: NOW });
  assert.equal(dupTimeout.ok, true);
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as GooseRelayState;
  broken.evilGeese = ['a']; // 头鹅不能是恶鹅
  assert.throws(() => assertGooseRelayInvariants(broken), /恶鹅名单无效/);

  const broken2 = structuredClone(state) as GooseRelayState;
  broken2.case.victim = broken2.case.murderer;
  assert.throws(() => assertGooseRelayInvariants(broken2), /凶手被害人重复/);

  const broken3 = structuredClone(state) as GooseRelayState;
  broken3.phase = 'discussion';
  assert.throws(() => assertGooseRelayInvariants(broken3), /演绎链应完整/);
});
