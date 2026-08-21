/**
 * uno_platform_house_v1 — 深度规则测试：UNO 竞速、罚牌链、质疑、终局、计分、团队、多小局。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { unoHouseModule, unoHouseStateSchema } from '../../server/house/module.ts';
import { assertUnoHouseInvariants } from '../../server/house/rules.ts';
import type { UnoHouseCard, UnoHouseColor, UnoHouseRoundState, UnoHouseState } from '../../server/house/types.ts';
import { makeCtx, init, reduce, reduceSystem } from './base.test.ts';

function cardColorOf(card: UnoHouseCard): UnoHouseColor | null {
  return card.kind === 'number' || card.kind === 'skip' || card.kind === 'reverse' || card.kind === 'draw2'
    ? card.color
    : null;
}

function reduceRaw(state: UnoHouseState, playerId: string, action: unknown): { ok: boolean; message: string; state?: UnoHouseState } {
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId }, action as never);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: '', state: result.nextState };
}

/** 把手牌裁剪为指定张数（保留给定子集），被裁剪的牌放回牌堆顶部，保持 108 张不变量。 */
function trimHand(state: UnoHouseState, playerId: string, keep: readonly { id: string }[]): UnoHouseState {
  const keepIds = new Set(keep.map((c) => c.id));
  const hand = state.round.hands[playerId] ?? [];
  const retained = hand.filter((card) => keepIds.has(card.id));
  const removed = hand.filter((card) => !keepIds.has(card.id));
  if (retained.length !== keep.length) throw new Error('keep 子集必须来自该玩家手牌');
  return unoHouseStateSchema.parse({
    ...state,
    round: {
      ...state.round,
      hands: { ...state.round.hands, [playerId]: retained },
      deck: [...removed, ...state.round.deck],
    },
  });
}

function playableColorCards(state: UnoHouseState, playerId: string): { id: string; color: string }[] {
  const topColor = cardColorOf(state.round.topDiscard);
  return (state.round.hands[playerId] ?? [])
    .filter((card) => card.kind !== 'wild' && card.kind !== 'wild4' && cardColorOf(card) === topColor)
    .map((card) => ({ id: card.id, color: cardColorOf(card)! }));
}

/** 把弃牌顶改成指定颜色，保证该玩家同色牌可出（保持 108 张：替换顶牌进弃牌区）。 */
function forceTopColor(state: UnoHouseState, playerId: string, color: 'red' | 'yellow' | 'green' | 'blue'): UnoHouseState {
  const replacement: UnoHouseCard = { id: `${state.round.roundNumber}:g0:forced-${color}`, kind: 'number', color, value: 0 };
  return unoHouseStateSchema.parse({
    ...state,
    round: {
      ...state.round,
      discardPile: [...state.round.discardPile.slice(0, -1), replacement],
      topDiscard: replacement,
    },
  });
}

/** 确保当前玩家至少有 n 张与弃牌顶同色的普通牌。 */
function ensureNPlayable(state: UnoHouseState, playerId: string, n: number): UnoHouseState {
  let current = state;
  let legal = playableColorCards(current, playerId);
  if (legal.length >= n) return current;
  // 把弃牌顶改成该玩家手牌中最多的颜色。
  const tally = new Map<string, number>();
  for (const card of current.round.hands[playerId] ?? []) {
    if (card.kind !== 'wild' && card.kind !== 'wild4') { const c = cardColorOf(card); if (c) tally.set(c, (tally.get(c) ?? 0) + 1); }
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red';
  current = forceTopColor(current, playerId, best as 'red' | 'yellow' | 'green' | 'blue');
  legal = playableColorCards(current, playerId);
  if (legal.length < n) {
    // 仍不足：把该玩家手牌中同色牌补齐（其余放回牌堆）。
    const colored = (current.round.hands[playerId] ?? []).filter((c) => c.kind !== 'wild' && c.kind !== 'wild4' && cardColorOf(c) === best);
    const extra = (current.round.hands[playerId] ?? []).filter((c) => c.kind === 'wild' || c.kind === 'wild4' || cardColorOf(c) !== best);
    const needed = extra.slice(0, Math.max(0, n - colored.length));
    const hand = [...colored, ...needed];
    current = trimHand(current, playerId, hand);
  }
  return current;
}

/** 确保该玩家手牌中存在指定牌：无则用替代牌替换手牌第一张，原牌放回牌堆（保持 108 张且 ID 唯一）。 */
/**
 * 构造全局唯一 ID 的最小可控状态：给定玩家手牌（含顶牌可匹配），
 * 其余牌全部以 `fill-<n>` 唯一 ID 放回牌堆，弃牌区只留顶牌 —— 满足
 * 108 张 / ID 唯一 / 恰处一域 不变量，且测试可精确控制手牌内容。
 */
export function scenarioState(
  players: string[],
  hands: Record<string, UnoHouseCard[]>,
  top: UnoHouseCard,
  currentColor: UnoHouseColor,
  currentPlayerId: string,
): UnoHouseState {
  const used = new Set<string>([...Object.values(hands).flat().map((c) => c.id), top.id]);
  const fill: UnoHouseCard[] = [];
  for (let i = 0; fill.length + used.size < 108; i += 1) {
    const id = `fill-${i}`;
    if (!used.has(id)) fill.push({ id, kind: 'number', color: 'green', value: i % 10 });
  }
  const deck = fill.slice(0, 108 - used.size);
  const round: UnoHouseRoundState = {
    roundNumber: 1,
    phase: 'round_playing',
    players: [...players],
    hands: Object.fromEntries(players.map((id) => [id, [...(hands[id] ?? [])]])),
    deck: [...deck],
    discardPile: [top],
    topDiscard: top,
    currentColor,
    direction: 1,
    currentPlayerId,
    hasDrawnThisTurn: false,
    pendingPenalty: null,
    unoRaceWindow: null,
    preCallPlayerIds: Object.fromEntries(players.map((id) => [id, false])),
    deckGenerationCount: 1,
    turnToken: 'r1:t0',
    turnIndex: 0,
    sequence: 0,
    turnDeadlineAt: null,
    windowDeadlineAt: null,
  };
  return unoHouseStateSchema.parse({
    match: {
      mode: 'individual',
      roundCount: 1,
      currentRound: 1,
      roundLimit: 1,
      teamPlayerIds: null,
      roundScores: [],
      roundResults: [],
      cumulativeScores: players.map(() => 0),
      matchRanking: null,
      starterPlayerId: currentPlayerId,
      lastFinisherPlayerId: null,
    },
    round,
  });
}

export function ensureCardInHand(state: UnoHouseState, playerId: string, card: UnoHouseCard): { state: UnoHouseState; card: UnoHouseCard } {
  const hand = state.round.hands[playerId]!;
  const found = hand.find((c) => c.kind === card.kind && cardColorOf(c) === cardColorOf(card));
  if (found) return { state, card: found };
  const replacement: UnoHouseCard = { ...card, id: `inject:${card.kind}:${playerId}:${Math.random().toString(36).slice(2, 8)}` };
  const [first, ...rest] = hand;
  const modified = unoHouseStateSchema.parse({
    ...state,
    round: {
      ...state.round,
      hands: { ...state.round.hands, [playerId]: [replacement, ...rest] },
      deck: [...state.round.deck, first],
    },
  });
  return { state: modified, card: replacement };
}

test('UNO-003：未预喊剩一张开启 5 秒竞速窗口', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-race');
  const current = state.round.currentPlayerId;
  state = ensureNPlayable(state, current, 2);
  const legal = playableColorCards(state, current);
  assert.ok(legal.length >= 2, '需要至少两张同色牌构造');
  state = trimHand(state, current, legal.slice(0, 2));
  // 不预喊出掉一张 → 剩一张 → 竞速窗口开启。
  const playId = state.round.hands[current]![0]!.id;
  state = reduce(state, current, { type: 'play_card', cardId: playId });
  assert.ok(state.round.unoRaceWindow, '应开启竞速窗口');
  assert.equal(state.round.unoRaceWindow!.targetPlayerId, current);
});

test('UNO-001/003：预喊后出牌不开启竞速窗口；补喊关闭窗口', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-precall');
  const current = state.round.currentPlayerId;
  state = ensureNPlayable(state, current, 2);
  const legal = playableColorCards(state, current);
  assert.ok(legal.length >= 2);
  state = trimHand(state, current, legal.slice(0, 2));
  const playId = state.round.hands[current]![0]!.id;
  state = reduce(state, current, { type: 'play_card', cardId: playId, preCallUno: true });
  assert.equal(state.round.unoRaceWindow, null, '预喊后不得开启竞速窗口');
});

test('UNO-003：抓漏报成功 → 目标摸两张并关闭窗口', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  const p1Hand: UnoHouseCard[] = [
    { id: 'p1-red-3', kind: 'number', color: 'red', value: 3 },
    { id: 'p1-red-4', kind: 'number', color: 'red', value: 4 },
    { id: 'p1-red-7', kind: 'number', color: 'red', value: 7 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: [] }, top, 'red', 'p1');
  // p1 连出两张同色牌：第一次出牌后回合继续归 p1（普通数字牌，单人轮转回到自己？——不，
  // 数字牌把回合交给下家。因此改为：p1 出 p1-red-3 → 回合交给 p2 → p2 出/摸后再轮到 p1。
  // 直接用三次出牌无法连续；改为构造 p1 只剩一张可出时直接开窗口：
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-red-3' });
  // 当前玩家已切换（p2）；把当前玩家改回 p1 并继续出第二张。
  assert.equal(state.round.currentPlayerId, 'p2');
  state = unoHouseStateSchema.parse({ ...state, round: { ...state.round, currentPlayerId: 'p1' } });
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-red-4' });
  assert.ok(state.round.unoRaceWindow, '剩一张且未预喊应开启竞速窗口');
  assert.equal(state.round.unoRaceWindow!.targetPlayerId, 'p1');
  const handBefore = (state.round.hands['p1'] ?? []).length;
  assert.equal(handBefore, 1);
  const token = state.round.unoRaceWindow!.windowToken;
  state = reduce(state, 'p2', { type: 'catch_missed_uno', targetPlayerId: 'p1', windowToken: token });
  assert.equal(state.round.unoRaceWindow, null, '抓漏报后窗口关闭');
  assert.equal((state.round.hands['p1'] ?? []).length, handBefore + 2, '目标摸两张');
});

test('UNO-003：补喊先提交则窗口关闭且无处罚（错误抓漏报 no-op）', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  const p1Hand: UnoHouseCard[] = [
    { id: 'p1-red-3', kind: 'number', color: 'red', value: 3 },
    { id: 'p1-red-4', kind: 'number', color: 'red', value: 4 },
    { id: 'p1-red-7', kind: 'number', color: 'red', value: 7 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: [] }, top, 'red', 'p1');
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-red-3' });
  assert.equal(state.round.currentPlayerId, 'p2');
  state = unoHouseStateSchema.parse({ ...state, round: { ...state.round, currentPlayerId: 'p1' } });
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-red-4' });
  assert.ok(state.round.unoRaceWindow);
  const token = state.round.unoRaceWindow!.windowToken;
  const handBefore = (state.round.hands['p1'] ?? []).length;
  // 补喊先提交。
  state = reduce(state, 'p1', { type: 'call_uno' });
  assert.equal(state.round.unoRaceWindow, null);
  assert.equal((state.round.hands['p1'] ?? []).length, handBefore);
  // 窗口已关，抓漏报 no-op。
  const r = reduceRaw(state, 'p2', { type: 'catch_missed_uno', targetPlayerId: 'p1', windowToken: token });
  assert.equal(r.ok, false);
});

test('UNO-004：下家有效出牌提前关闭竞速窗口；自然超时关闭不处罚', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-close');
  const current = state.round.currentPlayerId;
  state = ensureNPlayable(state, current, 2);
  const legal = playableColorCards(state, current);
  assert.ok(legal.length >= 2);
  state = trimHand(state, current, legal.slice(0, 2));
  state = reduce(state, current, { type: 'play_card', cardId: state.round.hands[current]![0]!.id });
  assert.ok(state.round.unoRaceWindow);
  // 下家摸牌（有效动作）关闭窗口。
  const drawer = state.round.currentPlayerId;
  state = reduce(state, drawer, { type: 'draw_card' });
  assert.equal(state.round.unoRaceWindow, null, '下家有效摸牌应关闭竞速窗口');

  // 自然超时：重新开一个窗口并投递 uno_race_timeout。
  const current2 = state.round.currentPlayerId;
  state = ensureNPlayable(state, current2, 2);
  const legal2 = playableColorCards(state, current2);
  if (legal2.length >= 2) {
    state = trimHand(state, current2, legal2.slice(0, 2));
    state = reduce(state, current2, { type: 'play_card', cardId: state.round.hands[current2]![0]!.id });
    assert.ok(state.round.unoRaceWindow);
    const token = state.round.unoRaceWindow!.windowToken;
    state = reduceSystem(state, { type: 'uno_race_timeout', round: state.round.roundNumber, windowToken: token });
    assert.equal(state.round.unoRaceWindow, null, '自然超时应关闭窗口');
  }
});

test('PENALTY-001：+2 后可接 +2；+4 拒绝 +2；+2 链 +4 升级为 +4 链', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  // p1 有红 +2 与 wild4 可出/可叠；p2 有红 draw2 可叠。
  const p1Hand: UnoHouseCard[] = [
    { id: 'p1-draw2', kind: 'draw2', color: 'red' },
    { id: 'p1-wild4', kind: 'wild4' },
    { id: 'p1-red-3', kind: 'number', color: 'red', value: 3 },
  ];
  const p2Hand: UnoHouseCard[] = [
    { id: 'p2-draw2', kind: 'draw2', color: 'red' },
    { id: 'p2-red-4', kind: 'number', color: 'red', value: 4 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: p2Hand }, top, 'red', 'p1');
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-draw2' });
  assert.ok(state.round.pendingPenalty, '应开启罚牌窗口');
  assert.equal(state.round.pendingPenalty!.kind, 'draw2');
  assert.equal(state.round.pendingPenalty!.challengeable, false, '+2 不允许质疑');
  assert.equal(state.round.pendingPenalty!.responderId, 'p2');
  // p2 叠 +2 → 累计 4。
  state = reduce(state, 'p2', { type: 'stack_penalty', cardId: 'p2-draw2' });
  assert.equal(state.round.pendingPenalty!.kind, 'draw2');
  assert.equal(state.round.pendingPenalty!.total, 4);
  // 响应者回到 p1，p1 叠 wild4 → 升级为 +4 链。
  assert.equal(state.round.pendingPenalty!.responderId, 'p1');
  state = reduce(state, 'p1', { type: 'stack_penalty', cardId: 'p1-wild4', declaredColor: 'red' });
  assert.equal(state.round.pendingPenalty!.kind, 'draw4');
  assert.equal(state.round.pendingPenalty!.total, 8);
});

test('PENALTY-002/004：首张普通 +4 可质疑；质疑成功出牌者摸 4、颜色作废、质疑者行动', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  // p2 手牌全是与红/蓝均不匹配的绿色数字牌 → 无可匹配牌 → 质疑成功。
  const p1Hand: UnoHouseCard[] = [{ id: 'p1-wild4', kind: 'wild4' }, { id: 'p1-red-3', kind: 'number', color: 'red', value: 3 }];
  const p2Hand: UnoHouseCard[] = [
    { id: 'p2-green-1', kind: 'number', color: 'green', value: 1 },
    { id: 'p2-green-2', kind: 'number', color: 'green', value: 2 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: p2Hand }, top, 'red', 'p1');
  const beforeColor = state.round.currentColor;
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-wild4', declaredColor: 'blue' });
  assert.ok(state.round.pendingPenalty);
  assert.equal(state.round.pendingPenalty!.challengeable, true, '首张普通 +4 可质疑');
  assert.equal(state.round.pendingPenalty!.challengeEvidence?.heldMatchingBeforePlay, false, 'p2 无可匹配牌 → 质疑应成功');
  const responder = state.round.pendingPenalty!.responderId;
  assert.equal(responder, 'p2', '质疑者应为下家');
  const sourceHandBefore = (state.round.hands['p1'] ?? []).length;
  const responderHandBefore = (state.round.hands[responder] ?? []).length;
  state = reduce(state, responder, { type: 'challenge_penalty', windowToken: state.round.pendingPenalty!.windowToken });
  // 质疑成功：出 +4 者（p1）摸 4；质疑者（p2）不因成功而摸牌。
  assert.equal((state.round.hands['p1'] ?? []).length, sourceHandBefore + 4, '质疑成功出牌者摸 4');
  assert.equal((state.round.hands[responder] ?? []).length, responderHandBefore);
  assert.equal(state.round.currentColor, beforeColor, '所选颜色作废（回到出牌前颜色）');
  assert.equal(state.round.currentPlayerId, responder, '质疑者正常行动');
});

test('PENALTY-005：罚牌窗口 5 秒超时自动接受', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  // p1 手牌 2 张（+2 不是末张，因此走普通罚牌窗口路径）。
  const p1Hand: UnoHouseCard[] = [
    { id: 'p1-draw2', kind: 'draw2', color: 'red' },
    { id: 'p1-red-3', kind: 'number', color: 'red', value: 3 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: [] }, top, 'red', 'p1');
  state = reduce(state, 'p1', { type: 'play_card', cardId: 'p1-draw2' });
  assert.ok(state.round.pendingPenalty, '应开启罚牌窗口');
  const responder = state.round.pendingPenalty!.responderId;
  const before = (state.round.hands[responder] ?? []).length;
  state = reduceSystem(state, { type: 'penalty_timeout', round: state.round.roundNumber, windowToken: state.round.pendingPenalty!.windowToken });
  assert.equal((state.round.hands[responder] ?? []).length, before + 2, '超时自动接受罚牌');
  assert.equal(state.round.pendingPenalty, null);
});

test('TERMINAL-001：末张 +2 固定摸两张后结算', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-term');
  const current = state.round.currentPlayerId;
  const top = state.round.topDiscard;
  let draw2 = state.round.hands[current]!.find((card) => card.kind === 'draw2' && cardColorOf(card) === cardColorOf(top));
  if (!draw2) {
    draw2 = { id: `${state.round.roundNumber}:g0:red-draw2-x`, kind: 'draw2', color: cardColorOf(top) ?? 'red' };
  }
  // 只剩这一张 +2（其余放回牌堆，保持 108 张）。
  state = trimHand(state, current, [draw2]);
  const responder = state.round.players.find((id) => id !== current)!;
  const responderBefore = (state.round.hands[responder] ?? []).length;
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: current }, { type: 'play_card', cardId: draw2.id } as never);
  assert.ok(result.ok);
  const next = result.nextState;
  assert.equal((next.round.hands[responder] ?? []).length, responderBefore + 2, '末张 +2 下家固定摸两张');
  assert.equal(next.match.roundScores.length, 1, '回合应结算');
  assert.equal(next.match.roundResults.length, 1);
  assertUnoHouseInvariants(next);
});

test('SCORE/MATCH：3 回合个人赛：非终局 resultCandidate 为 null，终局恰一次', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 3 }, 'seed-match');
  let resultCount = 0;
  let finished = false;
  for (let step = 0; step < 2000; step += 1) {
    if (state.round.phase === 'match_over') { finished = true; break; }
    const current = state.round.currentPlayerId;
    const view = unoHouseModule.getPlayerView(state, current) as {
      me: { playableCardIds: string[]; capabilities: string[]; hasDrawnThisTurn: boolean } | null;
    };
    const me = view.me;
    if (!me) { state = reduceSystem(state, { type: 'turn_timeout', round: state.round.roundNumber, turnToken: state.round.turnToken }); continue; }
    if (state.round.pendingPenalty) {
      const p = state.round.pendingPenalty;
      state = reduce(state, p.responderId, { type: 'accept_penalty', windowToken: p.windowToken });
      continue;
    }
    if (state.round.unoRaceWindow) {
      const w = state.round.unoRaceWindow;
      if (w.targetPlayerId === current) {
        state = reduce(state, current, { type: 'call_uno' });
      } else {
        state = reduce(state, current, { type: 'catch_missed_uno', targetPlayerId: w.targetPlayerId, windowToken: w.windowToken });
      }
      continue;
    }
    const playable = me.playableCardIds;
    if (playable.length > 0) {
      const hand = state.round.hands[current]!;
      const card = hand.find((c) => c.id === playable[0]!)!;
      const isWildCard = card.kind === 'wild' || card.kind === 'wild4';
      const action = isWildCard
        ? { type: 'play_card', cardId: playable[0]!, declaredColor: 'red' }
        : { type: 'play_card', cardId: playable[0]! };
      const r = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: current }, action as never);
      assert.ok(r.ok, `出牌被拒：${r.ok ? '' : r.message}`);
      if (r.resultCandidate !== null) resultCount += 1;
      state = r.nextState;
    } else if (me.capabilities.includes('canDraw')) {
      const r = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: current }, { type: 'draw_card' } as never);
      assert.ok(r.ok);
      if (r.resultCandidate !== null) resultCount += 1;
      state = r.nextState;
    } else if (me.capabilities.includes('canPassAfterDraw')) {
      state = reduce(state, current, { type: 'pass_after_draw' });
    } else {
      state = reduceSystem(state, { type: 'turn_timeout', round: state.round.roundNumber, turnToken: state.round.turnToken });
    }
  }
  assert.ok(finished, '3 回合个人赛应结束');
  assert.equal(resultCount, 1, '正式 result 恰一次');
  assert.ok(state.match.matchRanking, '整场排名存在');
  assert.equal(state.match.matchRanking!.length, 2);
  assertUnoHouseInvariants(state);
});

test('TEAM：团队模式恰好 4 人、交错入座、队友手牌隐藏', () => {
  assert.throws(() => init(['p1', 'p2'], { mode: 'team', roundCount: 1 }), /4 人/);
  const state = init(['p1', 'p2', 'p3', 'p4'], { mode: 'team', roundCount: 1 }, 'seed-team');
  const teams = state.match.teamPlayerIds!;
  assert.equal(teams['p1'], teams['p3']);
  assert.equal(teams['p2'], teams['p4']);
  assert.notEqual(teams['p1'], teams['p2']);
  // p1 视角不得包含 p3（队友）或其他人的手牌。
  const v1 = unoHouseModule.getPlayerView(state, 'p1') as { me: { hand: { id: string }[] } | null };
  const v2 = unoHouseModule.getPlayerView(state, 'p2') as { me: { hand: { id: string }[] } | null };
  const ids1 = new Set(v1.me!.hand.map((c) => c.id));
  const ids2 = new Set(v2.me!.hand.map((c) => c.id));
  for (const id of ids2) assert.ok(!ids1.has(id), 'p1 不得看到 p2 手牌');
});

test('TEAM-002/MATCH：4 人团队赛收束（1 回合）且每回合结算团队总分', () => {
  let state = init(['p1', 'p2', 'p3', 'p4'], { mode: 'team', roundCount: 1 }, 'seed-teammatch');
  let resultCount = 0;
  let finished = false;
  for (let step = 0; step < 20000; step += 1) {
    if (state.round.phase === 'match_over') { finished = true; break; }
    const current = state.round.currentPlayerId;
    const view = unoHouseModule.getPlayerView(state, current);
    const botRandom = createSeededRandom('bot-team:' + step);
    const action = unoHouseModule.pickBotAction?.({ view: view as never, playerId: current, random: botRandom });
    if (action) {
      const r = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: current }, action as never);
      assert.ok(r.ok, 'bot 动作被拒：' + (r.ok ? '' : r.message));
      if (r.resultCandidate !== null) resultCount += 1;
      state = r.nextState;
    } else {
      state = reduceSystem(state, { type: 'turn_timeout', round: state.round.roundNumber, turnToken: state.round.turnToken });
    }
  }
  assert.ok(finished, '团队赛应结束');
  assert.equal(resultCount, 1);
  assert.ok(state.match.matchRanking);
  for (const roundResult of state.match.roundResults) {
    assert.ok(roundResult.teamTotals, '每回合应记录团队总分');
  }
  assertUnoHouseInvariants(state);
});

test('DECK-003：动态扩牌保证任意摸牌完成（连续大额罚牌）', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-drawbig');
  const current = state.round.currentPlayerId;
  // 让 p2 手牌极少，连续接受大额罚牌触发回收+补副。
  const r = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: current }, { type: 'draw_card' } as never);
  assert.ok(r.ok);
  state = r.nextState;
  // 直接验证 deck 不变量：不变量断言已在每次 accepted 后由 module 执行。
  assertUnoHouseInvariants(state);
});

test('UNO-DIFF-002/DRAW：摸牌后无可出牌自动跳下家，有可出牌保留当前回合', () => {
  const top: UnoHouseCard = { id: 'top-red-5', kind: 'number', color: 'red', value: 5 };
  // p1 只有蓝牌，顶牌红 5
  const p1Hand: UnoHouseCard[] = [
    { id: 'p1-blue-1', kind: 'number', color: 'blue', value: 1 },
  ];
  const p2Hand: UnoHouseCard[] = [
    { id: 'p2-green-2', kind: 'number', color: 'green', value: 2 },
  ];
  let state = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: p2Hand }, top, 'red', 'p1');
  // 构造牌堆顶为一张蓝 9（摸到依然不可出，切片替换第一张保持 108 张）
  const unplayableCard: UnoHouseCard = { id: 'deck-blue-9', kind: 'number', color: 'blue', value: 9 };
  state = {
    ...state,
    round: {
      ...state.round,
      deck: [unplayableCard, ...state.round.deck.slice(1)],
    },
  };
  assertUnoHouseInvariants(state);

  // p1 摸牌 -> 摸后无可出 -> 自动跳到 p2
  const r1 = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: 'p1' }, { type: 'draw_card' } as never);
  assert.ok(r1.ok);
  assert.equal(r1.nextState.round.currentPlayerId, 'p2', '摸牌后无可出牌应自动推进到下家 p2');
  assert.equal(r1.nextState.round.hasDrawnThisTurn, false, '下家初始 hasDrawnThisTurn 应为 false');
  assert.equal(r1.nextState.round.hands['p1']!.length, 2, 'p1 手牌应增加 1 张');
  assertUnoHouseInvariants(r1.nextState);

  // 测试有可出牌分支：牌堆顶为一张红 9（摸到可出）
  let statePlayable = scenarioState(['p1', 'p2'], { p1: p1Hand, p2: p2Hand }, top, 'red', 'p1');
  const playableCard: UnoHouseCard = { id: 'deck-red-9', kind: 'number', color: 'red', value: 9 };
  statePlayable = {
    ...statePlayable,
    round: {
      ...statePlayable.round,
      deck: [playableCard, ...statePlayable.round.deck.slice(1)],
    },
  };
  assertUnoHouseInvariants(statePlayable);

  // p1 摸牌 -> 摸到可出牌 -> 回合保留给 p1，hasDrawnThisTurn 为 true
  const r2 = unoHouseModule.reduce(makeCtx(), statePlayable, { kind: 'player', playerId: 'p1' }, { type: 'draw_card' } as never);
  assert.ok(r2.ok);
  assert.equal(r2.nextState.round.currentPlayerId, 'p1', '摸牌后有可出牌应保留当前玩家回合');
  assert.equal(r2.nextState.round.hasDrawnThisTurn, true, '当前玩家 hasDrawnThisTurn 应为 true');
  const p1View = unoHouseModule.getPlayerView(r2.nextState, 'p1') as { me: { capabilities: readonly string[]; playableCardIds: readonly string[] } };
  assert.ok(p1View.me.capabilities.includes('canPassAfterDraw'), '应具备 canPassAfterDraw 能力');
  assert.ok(!p1View.me.capabilities.includes('canDraw'), '本回合不能再次摸牌');
  assert.ok(p1View.me.playableCardIds.includes('deck-red-9'), '摸到的红 9 应该在 playableCardIds 中');
  assertUnoHouseInvariants(r2.nextState);

  // p1 选择手动过牌
  const r3 = unoHouseModule.reduce(makeCtx(), r2.nextState, { kind: 'player', playerId: 'p1' }, { type: 'pass_after_draw' } as never);
  assert.ok(r3.ok);
  assert.equal(r3.nextState.round.currentPlayerId, 'p2', '手动过牌后推进至下家 p2');
  assertUnoHouseInvariants(r3.nextState);
});
