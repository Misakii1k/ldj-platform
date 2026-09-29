import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBellClashAction, parseBellClashConfig } from '../server/schemas.ts';
import {
  assertBellClashInvariants,
  buildDeck,
  canPlay,
  createBellClashState,
  reduceBellClashState,
} from '../server/rules.ts';
import { buildBellClashPlayerView } from '../server/views.ts';
import type { BellClashCard, BellClashState } from '../server/types.ts';

const NOW = 1_700_000_000_000;

const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
const yellow1: BellClashCard = { kind: 'number', color: 'yellow', number: 1 };
const redPhrase: BellClashCard = { kind: 'phrase', color: 'red', phrase: '大声说「好耶！」' };
const greenPhrase: BellClashCard = { kind: 'phrase', color: 'green', phrase: '拍一下桌子' };
const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };

function makeState(players: string[] = ['a', 'b', 'c']) {
  const deck: BellClashCard[] = [red1, yellow1, blue2];
  return createBellClashState(
    players,
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    deck,
    {
      a: [redPhrase, yellow1],
      b: [blue2, red1],
      c: [red1, yellow1],
    },
    red1,
  );
}

function accepted(state: BellClashState, action: unknown, now = NOW) {
  const result = reduceBellClashState(state, action, { now });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('牌库构建：4 色数字 1–6 各 1 张 + 每色高频短语卡 18 张（75% 短语卡）', () => {
  const deck = buildDeck();
  const numbers = deck.filter((card) => card.kind === 'number');
  const phrases = deck.filter((card) => card.kind === 'phrase');
  assert.equal(numbers.length, 4 * 6);
  assert.equal(phrases.length, 4 * 18);
  assert.equal(deck.length, 96);
  assert.equal(phrases.length / deck.length, 0.75);
  for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
    assert.equal(phrases.filter((card) => card.color === color).length, 18);
  }
});

test('出牌合法性：同色或同数字；短语卡按颜色匹配', () => {
  assert.equal(canPlay(red1, red1), true, '同色');
  assert.equal(canPlay(yellow1, red1), true, '同数字');
  assert.equal(canPlay(blue2, red1), false, '不同色不同数字');
  assert.equal(canPlay(redPhrase, red1), true, '短语卡同色');
  assert.equal(canPlay(redPhrase, blue2), false, '短语卡不同色');
});

test('初始化：2–7 人；手牌数量与配置一致', () => {
  assert.equal(makeState().players.length, 3);
  assert.throws(() => makeState(['a']), /2 至 7/);
  assert.throws(() => makeState(['a', 'a', 'c']), /玩家列表无效/);
  assert.throws(
    () => createBellClashState(['a', 'b'], {}, [red1], { a: [red1], b: [] }, red1),
    /手牌数量与配置不一致/,
  );
});

test('解析器严格拒绝多余字段与非法配置/动作', () => {
  assert.deepEqual(parseBellClashAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseBellClashAction({ type: 'begin', extra: 1 }), /字段无效/);
  assert.throws(() => parseBellClashConfig({ turnSeconds: 0 }), /时长无效/);
  // 旧 bellSeconds 键忽略不报错
  const cfg = parseBellClashConfig({ bellSeconds: 10 });
  assert.equal(cfg.challengeSeconds, 3);
});

test('出牌：当前出牌者打出合法牌，回合转移到下一位', () => {
  const state = makeState();
  const s = accepted(state, { type: 'play_card', playerId: 'a', cardIndex: 1 });
  assert.equal(s.phase, 'playing');
  assert.equal(s.currentPlayerId, 'b', '回合转移到下一位');
  assert.equal(s.hands['a']!.length, 1);
  assert.deepEqual(s.discardTop, yellow1);
});

test('出牌校验：非当前玩家/非法卡拒绝', () => {
  const state = makeState();
  assert.equal(
    reduceBellClashState(state, { type: 'play_card', playerId: 'b', cardIndex: 0 }, { now: NOW }).ok,
    false,
    '未轮到 b',
  );
  assert.equal(
    reduceBellClashState(state, { type: 'play_card', playerId: 'a', cardIndex: 99 }, { now: NOW }).ok,
    false,
    '索引越界',
  );
});

// —— 核心契约 14 条中的规则 1–12 ——

test('规则 1：任何人（非当前出牌者）都能拍铃；拍铃时 turn_timeout 被取消、challenge_timeout 被排上', () => {
  const state = makeState();
  assert.equal(state.currentPlayerId, 'a');
  // b 不是当前出牌者，b 手中有 redPhrase 吗？给 b 一张 redPhrase
  const s = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [red1],
    { a: [yellow1, yellow1], b: [redPhrase, blue2], c: [red1, yellow1] },
    red1,
  );
  const res = reduceBellClashState(s, { type: 'ring_bell', playerId: 'b', cardIndex: 0 }, { now: NOW });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const hasCancelTurn = res.effects.some((e) => e.type === 'cancel_timer' && e.timerId === 'turn_timeout');
  const hasScheduleChallenge = res.effects.some((e) => e.type === 'schedule_timer' && e.timerId === 'challenge_timeout');
  assert.ok(hasCancelTurn, 'turn_timeout 被取消');
  assert.ok(hasScheduleChallenge, 'challenge_timeout 被排上');
  assert.equal(res.nextState.challenge?.claimantId, 'b');
  assert.equal(res.nextState.challenge?.interruptedPlayerId, 'a');
});

test('规则 2：拍铃打出的短语卡颜色与顶牌不同也被接受', () => {
  // 顶牌为 red1，b 打出 greenPhrase（不同色）
  const s = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [red1],
    { a: [yellow1, yellow1], b: [greenPhrase, blue2], c: [red1, yellow1] },
    red1,
  );
  const res = reduceBellClashState(s, { type: 'ring_bell', playerId: 'b', cardIndex: 0 }, { now: NOW });
  assert.equal(res.ok, true, '不同色短语卡也被接受');
  if (res.ok) {
    assert.deepEqual(res.nextState.challenge?.card, greenPhrase);
  }
});

test('规则 3：hand[cardIndex] 不是短语卡 → 拒绝；challenge 进行中再拍 → 拒绝', () => {
  const s = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [red1],
    { a: [yellow1, yellow1], b: [redPhrase, blue2], c: [redPhrase, yellow1] },
    red1,
  );
  // b 的 cardIndex 1 是 blue2 (数字牌)
  const resNumber = reduceBellClashState(s, { type: 'ring_bell', playerId: 'b', cardIndex: 1 }, { now: NOW });
  assert.equal(resNumber.ok, false, '不是短语卡应拒绝');

  // b 成功拍铃后进入 challenge
  const resOk = reduceBellClashState(s, { type: 'ring_bell', playerId: 'b', cardIndex: 0 }, { now: NOW });
  assert.equal(resOk.ok, true);
  if (!resOk.ok) return;

  // c 在 challenge 进行中再拍 → 拒绝
  const resSecond = reduceBellClashState(resOk.nextState, { type: 'ring_bell', playerId: 'c', cardIndex: 0 }, { now: NOW });
  assert.equal(resSecond.ok, false, 'challenge 进行中再拍应拒绝');
});

test('规则 4：5 名投票人，2 人质疑后超时 → 成功：discardTop 是这张卡，currentPlayerId 是拍铃者，拍铃者手牌 −1', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const hands: Record<string, BellClashCard[]> = {
    p1: [redPhrase, yellow1],
    p2: [red1, red1],
    p3: [red1, red1],
    p4: [red1, red1],
    p5: [red1, red1],
    p6: [red1, red1],
  };
  let s = createBellClashState(
    players,
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [red1],
    hands,
    red1,
  );
  // p1 拍铃
  s = accepted(s, { type: 'ring_bell', playerId: 'p1', cardIndex: 0 });
  assert.equal(s.challenge?.voters.length, 5);

  // p2, p3 质疑（2票质疑 / 5人，2*2=4 <= 5，未过半）
  s = accepted(s, { type: 'challenge_vote', playerId: 'p2', doubt: true });
  s = accepted(s, { type: 'challenge_vote', playerId: 'p3', doubt: true });
  assert.ok(s.challenge !== null, '尚未过半，不提前结算');

  // 超时结算
  s = accepted(s, { type: 'challenge_timeout' });
  assert.equal(s.challenge, null, 'challenge 已结算清空');
  assert.deepEqual(s.discardTop, redPhrase, 'discardTop 成为这张短语卡');
  assert.equal(s.currentPlayerId, 'p1', '回合转交给拍铃者 p1');
  assert.equal(s.hands['p1']!.length, 1, 'p1 手牌 -1');
});

test('规则 5：5 名投票人，第 3 人质疑时立即结算为拍错（不等超时）：卡回到原位，手牌 +1（罚摸），currentPlayerId 回到被打断的人', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const hands: Record<string, BellClashCard[]> = {
    p1: [yellow1, redPhrase], // redPhrase 在 index 1
    p2: [red1, red1],
    p3: [red1, red1],
    p4: [red1, red1],
    p5: [red1, red1],
    p6: [red1, red1],
  };
  let s = createBellClashState(
    players,
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    hands,
    red1,
  );
  assert.equal(s.currentPlayerId, 'p1');
  // p2 是当前被等待的人或被打断者？让 p3 出牌打断
  // 这里设当前出牌者是 p2，p1 拍铃
  s.currentPlayerId = 'p2';

  // p1 拍铃
  s = accepted(s, { type: 'ring_bell', playerId: 'p1', cardIndex: 1 });
  assert.equal(s.hands['p1']!.length, 1);

  // p2, p3 质疑
  s = accepted(s, { type: 'challenge_vote', playerId: 'p2', doubt: true });
  s = accepted(s, { type: 'challenge_vote', playerId: 'p3', doubt: true });

  // 第 3 人 p4 质疑：3 * 2 = 6 > 5，立即判错！
  s = accepted(s, { type: 'challenge_vote', playerId: 'p4', doubt: true });
  assert.equal(s.challenge, null, '立即结算');
  // 卡按原位放回，加罚摸 1 张，共 3 张
  assert.equal(s.hands['p1']!.length, 3, '卡回到原位 + 罚摸 1 张 = 3 张');
  assert.deepEqual(s.hands['p1']![1], redPhrase, '卡回到原位 index 1');
  assert.equal(s.currentPlayerId, 'p2', '回合回到被打断的 p2');
  assert.equal(s.penaltyPulls['p1'], 1, '罚摸统计 +1');
});

test('规则 6：5 名投票人里 3 人投「有」→ 已不可能过半质疑 → 立即结算成功', () => {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const hands: Record<string, BellClashCard[]> = {
    p1: [redPhrase, yellow1],
    p2: [red1, red1],
    p3: [red1, red1],
    p4: [red1, red1],
    p5: [red1, red1],
    p6: [red1, red1],
  };
  let s = createBellClashState(
    players,
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    hands,
    red1,
  );
  s = accepted(s, { type: 'ring_bell', playerId: 'p1', cardIndex: 0 });
  // 3 人投确认 (doubt: false)
  s = accepted(s, { type: 'challenge_vote', playerId: 'p2', doubt: false });
  s = accepted(s, { type: 'challenge_vote', playerId: 'p3', doubt: false });
  s = accepted(s, { type: 'challenge_vote', playerId: 'p4', doubt: false });
  // 剩下 2 人即便全投质疑也无法过半 (2 * 2 = 4 <= 5)，应立即结算成功！
  assert.equal(s.challenge, null, '已提前结算');
  assert.deepEqual(s.discardTop, redPhrase);
  assert.equal(s.currentPlayerId, 'p1');
});

test('规则 7：challenge 进行中 play_card / draw_card 被拒', () => {
  let s = makeState();
  s = accepted(s, { type: 'ring_bell', playerId: 'a', cardIndex: 0 });
  assert.ok(s.challenge !== null);

  const playRes = reduceBellClashState(s, { type: 'play_card', playerId: 'a', cardIndex: 0 }, { now: NOW });
  assert.equal(playRes.ok, false, 'challenge 中出牌被拒');

  const drawRes = reduceBellClashState(s, { type: 'draw_card', playerId: 'a' }, { now: NOW });
  assert.equal(drawRes.ok, false, 'challenge 中摸牌被拒');
});

test('规则 8：普通回合打出短语卡 → 不产生 challenge，回合转下家', () => {
  let s = makeState();
  // a 打出短语卡（与顶牌 red1 同为 red 色）
  s = accepted(s, { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(s.challenge, null, '普通出短语卡不产生 challenge');
  assert.equal(s.currentPlayerId, 'b', '回合转到下家');
  assert.deepEqual(s.discardTop, redPhrase);
});

test('规则 9：摸牌自动打出短语卡 → 不产生 challenge', () => {
  // 顶牌 red1；a 手牌中没有能打的；牌堆顶是 redPhrase（可自动打出）
  let s = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 1 },
    [redPhrase], // 摸牌摸到 redPhrase
    { a: [blue2], b: [blue2] },
    red1,
  );
  s = accepted(s, { type: 'draw_card', playerId: 'a' });
  assert.equal(s.challenge, null, '摸牌自动打出短语卡不产生 challenge');
  assert.deepEqual(s.discardTop, redPhrase);
  assert.equal(s.currentPlayerId, 'b');
});

test('规则 10：拍铃成功打出最后一张手牌 → game_over，拍铃者获胜', () => {
  let s = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 1 },
    [blue2],
    { a: [redPhrase], b: [blue2] },
    red1,
  );
  s = accepted(s, { type: 'ring_bell', playerId: 'a', cardIndex: 0 });
  // b 投 confirm 成功
  s = accepted(s, { type: 'challenge_vote', playerId: 'b', doubt: false });
  assert.equal(s.phase, 'game_over');
  assert.deepEqual(s.winners, ['a']);
});

test('规则 11：拍错时牌堆为空 → 不罚摸，不报错', () => {
  let s = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 1 },
    [], // 牌堆为空
    { a: [redPhrase], b: [blue2] },
    red1,
  );
  s = accepted(s, { type: 'ring_bell', playerId: 'a', cardIndex: 0 });
  // b 投质疑判定拍错
  s = accepted(s, { type: 'challenge_vote', playerId: 'b', doubt: true });
  assert.equal(s.challenge, null);
  assert.equal(s.hands['a']!.length, 1, '牌堆为空时不罚摸');
  assert.equal(s.drawPile.length, 0);
});

test('规则 12：视图：challenge 在公开视图里可见；其他人手牌仍不可见', () => {
  let s = makeState();
  s = accepted(s, { type: 'ring_bell', playerId: 'a', cardIndex: 0 });
  const viewB = buildBellClashPlayerView(s, 'b');
  assert.ok(viewB.challenge !== null);
  assert.equal(viewB.challenge?.claimantId, 'a');
  assert.equal(viewB.challenge?.card.phrase, redPhrase.phrase);
  assert.deepEqual(viewB.challenge?.voterIds, ['b', 'c']);
  assert.deepEqual(viewB.challenge?.doubtIds, []);
  assert.deepEqual(viewB.challenge?.confirmIds, []);

  // 校验手牌隐私性：b 只能看到自己的 hand，看不到 a 的具体牌
  assert.ok(viewB.me?.hand);
  assert.equal('hands' in viewB, false, '公开视图不暴露全部手牌');
  assert.equal(viewB.handCounts['a'], 1);
});

// —— 其它规则与不变量 ——

test('摸牌：摸到不可打的牌过牌到下家', () => {
  let state = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    { a: [yellow1, yellow1], b: [blue2, red1] },
    red1,
  );
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  assert.equal(state.currentPlayerId, 'b', 'a 摸牌不可打，过牌到 b');
});

test('回合超时兜底：自动摸一张并过牌', () => {
  const state = makeState();
  const s = accepted(state, { type: 'turn_timeout', playerId: 'a' });
  assert.equal(s.currentPlayerId, 'b');
  assert.equal(s.hands['a']!.length, 3, 'a 超时自动摸一张');
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as BellClashState;
  broken.currentPlayerId = 'zzz';
  assert.throws(() => assertBellClashInvariants(broken), /当前出牌者不在本局/);

  const broken2 = structuredClone(state) as BellClashState;
  broken2.challenge = {
    claimantId: 'zzz',
    card: redPhrase,
    handIndex: 0,
    voters: ['b', 'c'],
    doubts: [],
    confirms: [],
    interruptedPlayerId: 'a',
  };
  assert.throws(() => assertBellClashInvariants(broken2), /拍铃者不在本局/);
});
