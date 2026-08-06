/**
 * uno_platform_house_v1 — 核心规则测试（BASE/GOV）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { unoHouseModule, unoHouseStateSchema } from '../../server/house/module.ts';
import { assertUnoHouseInvariants } from '../../server/house/rules.ts';
import type { UnoHouseState } from '../../server/house/types.ts';

export function makeCtx(seed = 'house-seed', now = 1_700_000_000_000) {
  return { now, random: createSeededRandom(seed) };
}

export function init(players: string[], config: { mode: 'individual' | 'team'; roundCount: 1 | 3 | 5 | 7 }, seed = 'house-seed'): UnoHouseState {
  const state = unoHouseModule.createInitialState(makeCtx(seed), players, config);
  return unoHouseStateSchema.parse(state);
}

export function reduce(state: UnoHouseState, playerId: string, action: unknown): UnoHouseState {
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId }, action as never);
  assert.ok(result.ok, `动作被拒绝：${result.ok ? '' : result.message}`);
  return result.nextState;
}

export function reduceSystem(state: UnoHouseState, action: unknown): UnoHouseState {
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'system', source: 'timer' }, action as never);
  assert.ok(result.ok, `系统动作被拒绝：${result.ok ? '' : result.message}`);
  return result.nextState;
}

test('BASE-001：开局确定性（同种子同状态，异种子不同）', () => {
  const a = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-a');
  const b = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-a');
  const c = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-b');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a.round.deck), JSON.stringify(c.round.deck));
  assertUnoHouseInvariants(a);
});

test('BASE-001：摸牌后可打出刚摸的牌（摸后出牌）', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-play');
  // 当前玩家摸一张。
  const drawer = state.round.currentPlayerId;
  state = reduce(state, drawer, { type: 'draw_card' });
  const view = unoHouseModule.getPlayerView(state, drawer) as { me: { hand: { id: string }[]; playableCardIds: string[] } | null };
  const playable = view.me?.playableCardIds ?? [];
  assert.ok(playable.length > 0, '摸牌后应存在可出的牌');
  state = reduce(state, drawer, { type: 'play_card', cardId: playable[0]! });
  assert.equal(state.round.phase, 'round_playing');
});

test('BASE-002：普通回合 15 秒超时温和托管（有合法牌走保守优先级）', () => {
  const state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-timeout');
  const current = state.round.currentPlayerId;
  const before = JSON.stringify(state.round);
  // 直接把回合计时器拨到超时。
  const turnToken = state.round.turnToken;
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'system', source: 'timer' }, { type: 'turn_timeout', round: state.round.roundNumber, turnToken } as never);
  assert.ok(result.ok);
  const next = result.nextState;
  assert.notEqual(JSON.stringify(next.round), before, '托管应推进回合');
  assert.equal(next.round.currentPlayerId === current ? next.round.turnToken !== turnToken : true, true);
});

test('BASE-004：双人个人模式反转牌等同跳过', () => {
  let state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-rev');
  const current = state.round.currentPlayerId;
  const hand = state.round.hands[current]!;
  // 把一张牌换成与当前弃牌同色的反转牌（保证可出），保持 7 张。
  const top = state.round.topDiscard;
  const topColor = (top.kind === 'wild' || top.kind === 'wild4') ? 'red' : (top.kind === 'number' || top.kind === 'skip' || top.kind === 'reverse' || top.kind === 'draw2' ? top.color : 'red');
  const swap = { id: `${state.round.roundNumber}:g0:red-reverse-x`, kind: 'reverse' as const, color: topColor };
  state = unoHouseStateSchema.parse({
    ...state,
    round: { ...state.round, hands: { ...state.round.hands, [current]: [swap, ...hand.slice(1)] } },
  });
  const myReverse = state.round.hands[current]!.find((card) => card.kind === 'reverse')!;
  state = reduce(state, current, { type: 'play_card', cardId: myReverse.id });
  // 双人反转 = 跳过：方向翻转且当前玩家回到自己。
  assert.equal(state.round.direction, -1);
  assert.equal(state.round.currentPlayerId, current);
});

test('GOV/BASE：拒绝动作不改变状态与事件', () => {
  const state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-reject');
  const snapshot = JSON.stringify(state);
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: 'p2' }, { type: 'play_card', cardId: 'nope' } as never);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  // 未声明颜色的万能牌被拒。
  const wild = state.round.hands['p1']!.find((card) => card.kind === 'wild');
  if (wild) {
    const r2 = unoHouseModule.reduce(makeCtx(), state, { kind: 'player', playerId: state.round.currentPlayerId }, { type: 'play_card', cardId: wild.id } as never);
    assert.equal(r2.ok, false);
  }
});

test('BASE：stale turn_timeout no-op', () => {
  const state = init(['p1', 'p2'], { mode: 'individual', roundCount: 1 }, 'seed-stale');
  const before = JSON.stringify(state);
  const result = unoHouseModule.reduce(makeCtx(), state, { kind: 'system', source: 'timer' }, { type: 'turn_timeout', round: state.round.roundNumber, turnToken: 'stale-token' } as never);
  assert.ok(result.ok);
  assert.equal(JSON.stringify(result.nextState), before);
});
