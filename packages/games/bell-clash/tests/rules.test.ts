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
import type { BellClashCard, BellClashState } from '../server/types.ts';

const NOW = 1_700_000_000_000;

const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
const yellow1: BellClashCard = { kind: 'number', color: 'yellow', number: 1 };
const redPhrase: BellClashCard = { kind: 'phrase', color: 'red', phrase: '大声说「好耶！」' };
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
});

test('出牌：当前出牌者打出合法牌，回合转移到下一位', () => {
  const state = makeState();
  // a 打同色红牌（短语卡同色 red1 顶）——但短语卡会开按铃窗口，用数字卡
  const s = accepted(state, { type: 'play_card', playerId: 'a', cardIndex: 1 });
  assert.equal(s.phase, 'playing');
  assert.equal(s.currentPlayerId, 'b', '回合转移到下一位');
  assert.equal(s.hands['a']!.length, 1);
  assert.deepEqual(s.discardTop, yellow1);
});

test('出牌校验：非当前玩家/非法卡/窗口开启时拒绝', () => {
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

test('打出短语卡 → 打开按铃窗口；拍铃成功者接管回合打出同色短语', () => {
  let state = makeState();
  // 让 a 打出短语卡：顶牌需为 red 才能同色打出 redPhrase → 先把顶牌换成 red
  state = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    { a: [redPhrase, red1], b: [blue2, yellow1], c: [red1, yellow1] },
    red1,
  );
  state = accepted(state, { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(state.bellOpen, true, '短语卡打开按铃窗口');
  // 窗口开启时当前出牌者不能继续出牌
  assert.equal(
    reduceBellClashState(state, { type: 'play_card', playerId: 'a', cardIndex: 0 }, { now: NOW }).ok,
    false,
  );
  // b 无同色短语 → 错误拍铃罚摸并关闭窗口
  const wrong = accepted(state, { type: 'ring_bell', playerId: 'b' });
  assert.equal(wrong.penaltyPulls['b'], 1, 'b 罚摸一张');
  assert.equal(wrong.bellOpen, false, '错误拍铃关闭窗口');
  assert.equal(wrong.currentPlayerId, 'b', '窗口关闭后轮到下一位（b 是 a 的下一位）');
  // c 有同色 red 短语 → 拍铃成功
  const cState = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 3 },
    [blue2],
    { a: [redPhrase, red1, yellow1], b: [blue2, yellow1, red1], c: [redPhrase, red1, yellow1] },
    red1,
  );
  let s = accepted(cState, { type: 'play_card', playerId: 'a', cardIndex: 0 });
  s = accepted(s, { type: 'ring_bell', playerId: 'c' });
  assert.equal(s.bellClaimantId, 'c');
  // 结算拍铃：c 打出同色短语并接管回合
  s = accepted(s, { type: 'resolve_bell', claimantId: 'c' });
  assert.equal(s.currentPlayerId, 'c');
  assert.equal(s.hands['c']!.length, 2, 'c 打出短语卡');
  assert.equal(s.bellOpen, false);
});

test('无人拍铃 → 回合继续到下一位', () => {
  let state = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    { a: [redPhrase, red1], b: [blue2, yellow1], c: [red1, yellow1] },
    red1,
  );
  state = accepted(state, { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(state.bellOpen, true);
  state = accepted(state, { type: 'resolve_bell', claimantId: '' });
  assert.equal(state.bellOpen, false);
  assert.equal(state.currentPlayerId, 'b', '无人拍铃回合继续');
});

test('摸牌：摸到可打出的牌自动打出，否则过牌', () => {
  // b 顶牌 red1；b 手牌 blue2 + yellow1（yellow1 同数字 1 可打）
  let state = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [yellow1, blue2],
    { a: [redPhrase, red1], b: [blue2, red1] },
    red1,
  );
  // b 先手出 blue2（不同色不同数字不可打）→ 摸牌：摸到 blue2 不可打 → 过牌
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  assert.equal(state.currentPlayerId, 'b', 'a 摸牌不可打，过牌到 b');
});

test('回合超时兜底：自动摸一张并过牌', () => {
  const state = makeState();
  const s = accepted(state, { type: 'turn_timeout', playerId: 'a' });
  assert.equal(s.currentPlayerId, 'b');
  assert.equal(s.hands['a']!.length, 3, 'a 超时自动摸一张');
});

test('先打完手牌者获胜', () => {
  // a 手牌只剩 1 张可打 → 打出即胜
  let state = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 1 },
    [blue2],
    { a: [yellow1], b: [blue2] },
    red1,
  );
  state = accepted(state, { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(state.phase, 'game_over');
  assert.deepEqual(state.winners, ['a']);
});

test('不变量拒绝破损状态', () => {
  const state = makeState();
  const broken = structuredClone(state) as BellClashState;
  broken.currentPlayerId = 'zzz';
  assert.throws(() => assertBellClashInvariants(broken), /当前出牌者不在本局/);

  const broken2 = structuredClone(state) as BellClashState;
  broken2.bellOpen = true;
  broken2.discardTop = red1; // 数字卡不能挂按铃窗口
  assert.throws(() => assertBellClashInvariants(broken2), /按铃窗口应挂在短语卡上/);
});
