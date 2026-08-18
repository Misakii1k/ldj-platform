import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGooseRelayAction, parseGooseRelayConfig } from '../server/schemas.ts';
import {
  assertGooseRelayInvariants,
  createGooseRelayState,
  evilCountFor,
  reduceGooseRelayState,
} from '../server/rules.ts';
import type { CaseCard, CharacterId, GooseRelayState } from '../server/types.ts';

const NOW = 1_700_000_000_000;
const CANDIDATES: CharacterId[] = [
  'detective',
  'astronaut',
  'pirate',
  'chef',
  'doctor',
  'firefighter',
  'miner',
  'wizard',
  'samurai',
];
const CARD_A: CaseCard = { murderer: 'detective', victim: 'astronaut' };

function makeState(
  players: string[] = ['a', 'b', 'c', 'd', 'e'],
  candidateCards: CharacterId[] = CANDIDATES,
  evilGeese: string[] = ['c'],
  initialCase: CaseCard = CARD_A,
  headPlayerId: string | null = null,
  configInput: unknown = { rulesetId: 'goose_relay_classic_v1' },
): GooseRelayState {
  return createGooseRelayState(
    players,
    configInput,
    candidateCards,
    evilGeese,
    initialCase,
    headPlayerId,
  );
}

function accepted(state: GooseRelayState, action: unknown, now = NOW) {
  const result = reduceGooseRelayState(state, action, { now });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 完整流程辅助函数：抢头鹅 -> 选卡 -> 动作接力全完成 -> 进入讨论 */
function toDiscussion(state: GooseRelayState): GooseRelayState {
  let s = state;
  if (s.phase === 'claim_head') {
    s = accepted(s, { type: 'claim_head', playerId: 'a' });
  }
  if (s.phase === 'pick_cards') {
    s = accepted(s, { type: 'pick_cards', playerId: 'a', murderer: 'detective', victim: 'astronaut' });
  }
  assert.equal(s.phase, 'relay');
  for (let i = 0; i < s.players.length; i += 1) {
    s = accepted(s, { type: 'relay_done', playerId: s.lineOrder[i]! });
  }
  assert.equal(s.phase, 'discussion');
  return s;
}

/** 讨论后进入指认阶段 */
function toAccusation(state: GooseRelayState): GooseRelayState {
  const s = toDiscussion(state);
  return accepted(s, { type: 'end_discussion' });
}

test('恶鹅数量：所有人数统一为 1 只恶鹅', () => {
  assert.equal(evilCountFor(5), 1);
  assert.equal(evilCountFor(6), 1);
  assert.equal(evilCountFor(7), 1);
  assert.equal(evilCountFor(9), 1);
});

test('初始化接受 5 至 9 人并拒绝边界外、重复玩家与非法恶鹅名单', () => {
  assert.equal(makeState(['a', 'b', 'c', 'd', 'e']).players.length, 5);
  assert.equal(
    makeState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], CANDIDATES, ['c']).players.length,
    9,
  );
  assert.throws(() => makeState(['a', 'b', 'c', 'd']), /5 至 9/);
  assert.throws(() => makeState(['a', 'a', 'c', 'd', 'e']), /玩家列表无效/);
  assert.throws(() => makeState(['a', 'b', 'c', 'd', 'e'], CANDIDATES, ['c', 'd']), /恶鹅数量无效/);
  assert.throws(() => makeState(['a', 'b', 'c', 'd', 'e'], CANDIDATES, ['z']), /恶鹅名单无效/);
});

test('解析器严格拒绝多余字段与非法动作', () => {
  assert.deepEqual(parseGooseRelayAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseGooseRelayAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(() => parseGooseRelayAction({ type: 'pick_cards', playerId: 'a', murderer: 'no_such', victim: 'astronaut' }), /凶手无效/);
  assert.throws(() => parseGooseRelayAction({ type: 'pick_cards', playerId: 'a', murderer: 'detective', victim: 'detective' }), /凶手与被害人不能相同/);
  assert.throws(() => parseGooseRelayAction({ type: 'accuse', playerId: 'e', murderer: 'no_such', victim: 'astronaut' }), /凶手无效/);
  assert.throws(() => parseGooseRelayConfig({ relaySeconds: 0 }), /时长无效/);
  assert.deepEqual(parseGooseRelayConfig({ discussionSeconds: 0 }).discussionSeconds, 0);
});

test('抢头鹅与选卡流转正常', () => {
  const state = makeState();
  assert.equal(state.phase, 'claim_head');
  assert.equal(state.headPlayerId, null);

  // b 抢头鹅
  const claimed = accepted(state, { type: 'claim_head', playerId: 'b' });
  assert.equal(claimed.phase, 'pick_cards');
  assert.equal(claimed.headPlayerId, 'b');
  assert.equal(claimed.lineOrder[0], 'b');

  // 非头鹅选卡被拒
  const denied = reduceGooseRelayState(claimed, { type: 'pick_cards', playerId: 'a', murderer: 'detective', victim: 'astronaut' }, { now: NOW });
  assert.equal(denied.ok, false);

  // 头鹅选卡成功进入 relay
  const picked = accepted(claimed, { type: 'pick_cards', playerId: 'b', murderer: 'pirate', victim: 'chef' });
  assert.equal(picked.phase, 'relay');
  assert.deepEqual(picked.case, { murderer: 'pirate', victim: 'chef' });
  assert.equal(picked.currentIndex, 0);
});

test('接力传递按队列推进，越位被拒', () => {
  let s = makeState();
  s = accepted(s, { type: 'claim_head', playerId: 'a' });
  s = accepted(s, { type: 'pick_cards', playerId: 'a', murderer: 'detective', victim: 'astronaut' });
  assert.equal(s.phase, 'relay');
  assert.equal(s.currentIndex, 0);

  // 首棒 a 完成表演
  s = accepted(s, { type: 'relay_done', playerId: 'a' });
  assert.equal(s.currentIndex, 1);

  // c 抢跑被拒
  const jumped = reduceGooseRelayState(s, { type: 'relay_done', playerId: 'c' }, { now: NOW });
  assert.equal(jumped.ok, false);
});

test('讨论结束进入指认：从末位起逐一指认', () => {
  const s = toAccusation(makeState());
  assert.equal(s.phase, 'accusation');
  assert.equal(s.currentAccuserIndex, 4, '从末位（下标 4）开始指认');
  // 非当前指认者越位被拒
  const jumped = reduceGooseRelayState(s, { type: 'accuse', playerId: 'a', murderer: 'detective', victim: 'astronaut' }, { now: NOW });
  assert.equal(jumped.ok, false, '未轮到的人不能指认');
});

test('末位指对 → 立即进入投票', () => {
  let s = toAccusation(makeState());
  s = accepted(s, { type: 'accuse', playerId: 'e', murderer: 'detective', victim: 'astronaut' });
  assert.equal(s.caseMatched, true);
  assert.equal(s.phase, 'vote', '指对后立即进入投票');
  assert.equal(s.accusations.length, 1);
});

test('全员指错 → 依然进入揪恶投票，投出恶鹅则白鹅获胜（OR 逻辑）', () => {
  let s = toAccusation(makeState());
  for (let i = 4; i >= 0; i -= 1) {
    s = accepted(s, { type: 'accuse', playerId: s.lineOrder[i]!, murderer: 'pirate', victim: 'chef' });
  }
  assert.equal(s.caseMatched, false, '无人指对');
  assert.equal(s.phase, 'vote', '全员指错依然进入投票');

  // 投票抓出恶鹅 c
  for (const id of ['a', 'b', 'd', 'e']) {
    s = accepted(s, { type: 'cast_vote', playerId: id, targetPlayerId: 'c' });
  }
  s = accepted(s, { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' });

  assert.equal(s.phase, 'game_over');
  assert.equal(s.evilIdentified, true);
  assert.equal(s.winners.includes('c'), false, '虽然没指对，但抓出恶鹅白鹅依然获胜');
});

test('未指对且未抓出恶鹅 → 恶鹅获胜', () => {
  let s = toAccusation(makeState());
  for (let i = 4; i >= 0; i -= 1) {
    s = accepted(s, { type: 'accuse', playerId: s.lineOrder[i]!, murderer: 'pirate', victim: 'chef' });
  }
  assert.equal(s.phase, 'vote');
  // 误投 a
  for (const id of ['b', 'c', 'd', 'e']) {
    s = accepted(s, { type: 'cast_vote', playerId: id, targetPlayerId: 'a' });
  }
  s = accepted(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });

  assert.equal(s.phase, 'game_over');
  assert.equal(s.caseMatched, false);
  assert.equal(s.evilIdentified, false);
  assert.deepEqual(s.winners, ['c'], '恶鹅获胜');
});

test('投票校验：不能自投、不能投局外人、不能重复投', () => {
  let s = toAccusation(makeState());
  s = accepted(s, { type: 'accuse', playerId: 'e', murderer: 'detective', victim: 'astronaut' });
  assert.equal(s.phase, 'vote');
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'a' }, { now: NOW }).ok, false, '不能自投');
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'zzz' }, { now: NOW }).ok, false);
  s = accepted(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' });
  assert.equal(reduceGooseRelayState(s, { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' }, { now: NOW }).ok, false, '不能重复投');
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as GooseRelayState;
  broken.headPlayerId = 'a';
  broken.evilGeese = ['a']; // 头鹅不能是恶鹅
  assert.throws(() => assertGooseRelayInvariants(broken), /头鹅不能是恶鹅/);

  const broken2 = structuredClone(state) as GooseRelayState;
  broken2.case.victim = broken2.case.murderer;
  assert.throws(() => assertGooseRelayInvariants(broken2), /凶手被害人重复/);
});
