/**
 * landlord_platform_v1 — 规则行为定向测试。
 * 叫分 / 出牌 / 过牌 / 胜负 / 计时兜底 / 视图遮滤 / 弃权结算。
 * 全部走 parseAction + reduce 合法入口（机器人与真人同一条路）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandlordDeck, rankValue } from '../../server/cards.ts';
import { landlordPlatformModule } from '../../server/platform/module.ts';
import { apply, deny, init, reduce, startedPlaying, system, timeout } from './helpers.ts';
import type { PlatformState } from '../../server/platform/types.ts';

const PLAYERS = ['p0', 'p1', 'p2'];

function isSchedule(effect: unknown): boolean {
  return (effect as { type?: string }).type === 'schedule_timer';
}
function isCancel(effect: unknown): boolean {
  return (effect as { type?: string }).type === 'cancel_timer';
}
function timerCounts(effects: readonly unknown[]): { scheduled: number; cancelled: number } {
  return {
    scheduled: effects.filter(isSchedule).length,
    cancelled: effects.filter(isCancel).length,
  };
}

test('platform 发牌：17×3 + 3 底牌，54 张全局无重复', () => {
  const s = init(PLAYERS);
  assert.deepEqual(
    s.players.map((id) => s.hands[id]!.length),
    [17, 17, 17],
  );
  assert.equal(s.bottomCards.length, 3);
  const all = [...s.players.flatMap((id) => s.hands[id]!), ...s.bottomCards];
  assert.equal(all.length, 54);
  assert.equal(new Set(all.map((c) => c.id)).size, 54);
});

test('platform 动作解析：非法动作被 parseAction 拒绝', () => {
  assert.throws(() => landlordPlatformModule.parseAction({ type: 'bid_score', score: 5 }), /score|无效|Invalid/i);
  assert.throws(() => landlordPlatformModule.parseAction({ type: 'unknown_action' }), /Invalid|无效|discriminated/i);
  assert.throws(
    () => landlordPlatformModule.parseAction({ type: 'phase_timeout', phase: 'night', token: 'x' }),
    /Invalid|无效|phase/i,
  );
});

test('platform begin：系统起叫分计时器；玩家不能冒充 begin；重复 begin 幂等', () => {
  let s = init(PLAYERS);
  const denied = deny(s, { kind: 'player', playerId: 'p0' }, { type: 'begin' });
  assert.match(denied.message, /系统/);
  const out = reduce(s, system, { type: 'begin' });
  assert.equal(timerCounts(out.effects).scheduled, 1);
  s = out.state;
  assert.ok(s.phaseToken, 'begin 后必须有叫分计时 token');
  assert.ok(s.deadlineAt !== null);
  const again = reduce(s, system, { type: 'begin' });
  assert.equal(timerCounts(again.effects).scheduled, 0, '重复 begin 不重复起表');
});

test('platform 叫分顺序与流转：只允许当前叫分者；叫分后换人并续计时器', () => {
  let s = apply(init(PLAYERS), system, { type: 'begin' });
  assert.equal(s.currentBidderId, 'p0');
  const notYourTurn = deny(s, { kind: 'player', playerId: 'p1' }, { type: 'bid_score', score: 1 });
  assert.match(notYourTurn.message, /还没轮到你/);
  const out = reduce(s, { kind: 'player', playerId: 'p0' }, { type: 'bid_score', score: 1 });
  assert.equal(timerCounts(out.effects).cancelled, 1, '叫分后取消旧计时器');
  assert.equal(timerCounts(out.effects).scheduled, 1, '叫分后给下一位续计时器');
  s = out.state;
  assert.equal(s.currentBidderId, 'p1');
  assert.deepEqual(s.bids, [{ playerId: 'p0', score: 1 }]);
});

test('platform 叫 3 立即定地主：拿底牌、倍数 3、进入出牌阶段', () => {
  let s = apply(init(PLAYERS), system, { type: 'begin' });
  s = apply(s, { kind: 'player', playerId: 'p0' }, { type: 'bid_score', score: 3 });
  assert.equal(s.phase, 'playing');
  assert.equal(s.landlordId, 'p0');
  assert.equal(s.multiplier, 3);
  assert.equal(s.hands.p0!.length, 20);
  assert.equal(s.currentPlayerId, 'p0');
  assert.equal(s.currentTrick, null);
});

test('platform 无人叫分：players[0] 强制当地主，倍数 1', () => {
  const s = startedPlaying(PLAYERS, [0, 0, 0]);
  assert.equal(s.landlordId, 'p0');
  assert.equal(s.multiplier, 1);
  assert.equal(s.hands.p0!.length, 20);
});

test('platform 最高叫分者当地主；倍数 = 最大叫分', () => {
  const s = startedPlaying(PLAYERS, [1, 2, 1]);
  assert.equal(s.landlordId, 'p1');
  assert.equal(s.multiplier, 2);
  assert.equal(s.hands.p1!.length, 20);
});

test('platform 出牌必须轮到自己；非法牌型与压不过被拒且不推进', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const outOfTurn = deny(s, { kind: 'player', playerId: 'p1' }, { type: 'play_combo', cardIds: [s.hands.p1![0]!.id] });
  assert.match(outOfTurn.message, /还没轮到你/);

  // 领出：任何合法牌型都可出
  const lead = s.hands.p0![0]!;
  const afterLead = apply(s, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: [lead.id] });
  assert.equal(afterLead.currentPlayerId, 'p1');
  assert.equal(afterLead.currentTrick?.playerId, 'p0');

  // p1 用单张压：点数必须更大（identity 发牌确定性可判定）
  const p1Card = afterLead.hands.p1![0]!;
  const beats = rankValue(p1Card.rank) > rankValue(lead.rank);
  if (beats) {
    const accepted = reduce(afterLead, { kind: 'player', playerId: 'p1' }, { type: 'play_combo', cardIds: [p1Card.id] });
    assert.equal(accepted.state.currentTrick?.playerId, 'p1');
  } else {
    const rejected = deny(afterLead, { kind: 'player', playerId: 'p1' }, { type: 'play_combo', cardIds: [p1Card.id] });
    assert.match(rejected.message, /压不过/);
  }

  // 用不同牌型（两张任意牌）压单张：牌型不合法
  const twoIds = afterLead.hands.p1!.slice(0, 2).map((c) => c.id);
  const twoRejected = deny(afterLead, { kind: 'player', playerId: 'p1' }, { type: 'play_combo', cardIds: twoIds });
  assert.match(twoRejected.message, /牌型不合法|压不过/);
});

test('platform 过牌流转：两家过回领出者，清空牌型并归零 passCount', () => {
  let s = startedPlaying(PLAYERS, [2, 0, 0]);
  s = apply(s, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: [s.hands.p0![0]!.id] });
  s = apply(s, { kind: 'player', playerId: 'p1' }, { type: 'pass_turn' });
  assert.equal(s.passCount, 1);
  assert.equal(s.currentPlayerId, 'p2');
  s = apply(s, { kind: 'player', playerId: 'p2' }, { type: 'pass_turn' });
  assert.equal(s.passCount, 0);
  assert.equal(s.currentTrick, null);
  assert.equal(s.currentPlayerId, 'p0', '两家过牌后回到上一手出牌者领出');
});

test('platform 领出时不能过牌', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const denied = deny(s, { kind: 'player', playerId: 'p0' }, { type: 'pass_turn' });
  assert.match(denied.message, /当前不能不出/);
});

test('platform 清空手牌获胜：地主先出完 → landlord；农民先出完 → farmers', () => {
  // 地主 p0 只剩 1 张：出完即 landlord 胜
  let s = startedPlaying(PLAYERS, [2, 0, 0]);
  s = { ...s, hands: { p0: [s.hands.p0![0]!], p1: s.hands.p1!, p2: s.hands.p2! } };
  const out = reduce(s, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: [s.hands.p0![0]!.id] });
  assert.equal(out.state.phase, 'game_over');
  assert.equal(out.state.winnerTeam, 'landlord');
  assert.equal(out.state.winnerId, 'p0');
  assert.equal(out.state.currentPlayerId, null);
  assert.equal(out.state.currentTrick, null);
  assert.deepEqual(out.resultCandidate, { winnerTeam: 'landlord', winnerId: 'p0' });
  assert.equal(timerCounts(out.effects).cancelled >= 1, true, '终局须取消计时器');

  // 农民 p1 只剩 1 张且轮到 p1：出完即 farmers 胜
  let f = startedPlaying(PLAYERS, [2, 0, 0]);
  f = { ...f, hands: { p0: f.hands.p0!, p1: [f.hands.p1![0]!], p2: f.hands.p2! }, currentPlayerId: 'p1' };
  const fout = reduce(f, { kind: 'player', playerId: 'p1' }, { type: 'play_combo', cardIds: [f.hands.p1![0]!.id] });
  assert.equal(fout.state.phase, 'game_over');
  assert.equal(fout.state.winnerTeam, 'farmers');
  assert.equal(fout.state.winnerId, 'p1');
});

test('platform 终局后拒绝玩家动作（系统 noop 幂等）', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const over: PlatformState = {
    ...s,
    phase: 'game_over',
    winnerTeam: 'landlord',
    winnerId: 'p0',
    currentPlayerId: null,
    phaseToken: null,
    deadlineAt: null,
  };
  const denied = deny(over, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: ['x'] });
  assert.match(denied.message, /结束/);
  // 系统动作在终局返回 noop 而非抛错（reduce 助手在拒绝时抛错，能到这里即已通过）
  const sys = reduce(over, system, { type: 'player_forfeited', playerIds: ['p1'] });
  assert.deepEqual(sys.state, over, '终局系统 noop 不得推进状态');
});

test('platform 计时兜底（叫分超时）：自动记为 0 分并轮到下一位', () => {
  let s = apply(init(PLAYERS), system, { type: 'begin' });
  s = timeout(s);
  assert.deepEqual(s.bids, [{ playerId: 'p0', score: 0 }]);
  assert.equal(s.currentBidderId, 'p1');
  assert.equal(s.phase, 'bidding');
  s = timeout(s);
  s = timeout(s);
  assert.equal(s.phase, 'playing');
  assert.equal(s.landlordId, 'p0');
  assert.equal(s.multiplier, 1);
});

test('platform 计时兜底（出牌超时可过）：有当前牌型时自动过牌', () => {
  let s = startedPlaying(PLAYERS, [2, 0, 0]);
  s = apply(s, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: [s.hands.p0![0]!.id] });
  s = timeout(s);
  assert.equal(s.passCount, 1);
  assert.equal(s.currentPlayerId, 'p2');
});

test('platform 计时兜底（出牌领出必出）：无当前牌型时自动出最小单张', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const before = s.hands.p0![0]!;
  const after = timeout(s);
  assert.equal(after.hands.p0!.length, 19);
  assert.equal(after.currentTrick?.playerId, 'p0');
  assert.equal(after.currentTrick?.combo.type, 'single');
  assert.equal(after.currentTrick?.combo.cards[0]!.id, before.id);
  assert.equal(after.currentPlayerId, 'p1');
});

test('platform 超时 token 失配：陈旧计时器被拒为 noop 且不推进', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const stale = { type: 'phase_timeout' as const, phase: 'playing' as const, token: 'play:pX-stale' };
  const out = reduce(s, system, stale);
  assert.equal(out.effects.length, 0, '陈旧超时不得产生任何 effect');
  assert.deepEqual(out.state, s, '陈旧超时不得推进状态');
});

test('platform 视图遮滤：手牌只对自己；底牌仅地主可见；牌型公开', () => {
  const s = startedPlaying(PLAYERS, [2, 0, 0]);
  const spectator = landlordPlatformModule.getSpectatorView(s);
  assert.equal('me' in spectator, false);
  assert.equal(spectator.bottomCards.length, 0, '观战视角不得见底牌');
  assert.equal(spectator.players.find((p) => p.playerId === 'p0')?.handCount, 20);

  const p0View = landlordPlatformModule.getPlayerView(s, 'p0');
  assert.equal(p0View.me?.hand.length, 20);
  assert.deepEqual(p0View.bottomCards, s.bottomCards, '地主视角可见底牌');
  const p1View = landlordPlatformModule.getPlayerView(s, 'p1');
  assert.equal(p1View.me?.hand.length, 17);
  assert.equal(p1View.bottomCards.length, 0, '农民视角不得见底牌');
  const p2View = landlordPlatformModule.getPlayerView(s, 'p2');
  assert.deepEqual(
    [...p1View.me!.hand, ...p2View.me!.hand].map((c) => c.id),
    [...s.hands.p1!, ...s.hands.p2!].map((c) => c.id),
  );

  const after = apply(s, { kind: 'player', playerId: 'p0' }, { type: 'play_combo', cardIds: [s.hands.p0![0]!.id] });
  const p1After = landlordPlatformModule.getPlayerView(after, 'p1');
  const specAfter = landlordPlatformModule.getSpectatorView(after);
  assert.deepEqual(p1After.currentTrick, after.currentTrick);
  assert.deepEqual(specAfter.currentTrick, after.currentTrick);
});

test('platform 未参局玩家不能操作', () => {
  const s = init(PLAYERS);
  const denied = deny(s, { kind: 'player', playerId: 'ghost' }, { type: 'bid_score', score: 1 });
  assert.match(denied.message, /参局玩家/);
});

test('platform 弃权结算：仅系统可触发；叫分阶段中止；地主退出农民胜；农民退出地主胜', () => {
  const bidding = apply(init(PLAYERS), system, { type: 'begin' });
  const forged = deny(bidding, { kind: 'player', playerId: 'p0' }, { type: 'player_forfeited', playerIds: ['p1'] });
  assert.match(forged.message, /系统/);

  const aborted = reduce(bidding, system, { type: 'player_forfeited', playerIds: ['p1'] });
  assert.equal(aborted.state.phase, 'game_over');
  assert.equal(aborted.state.aborted, true);
  assert.deepEqual(aborted.resultCandidate, { winnerTeam: null, winnerId: null, aborted: true });

  const playing = startedPlaying(PLAYERS, [2, 0, 0]);
  const landlordOut = reduce(playing, system, { type: 'player_forfeited', playerIds: ['p0'] });
  assert.equal(landlordOut.state.phase, 'game_over');
  assert.equal(landlordOut.state.winnerTeam, 'farmers');

  const playing2 = startedPlaying(PLAYERS, [2, 0, 0]);
  const farmerOut = reduce(playing2, system, { type: 'player_forfeited', playerIds: ['p1'] });
  assert.equal(farmerOut.state.winnerTeam, 'landlord');
  assert.equal(farmerOut.state.winnerId, 'p0');
});

test('platform 状态不变量：纯超时驱动直至收束，每一步过 parseState + assertInvariants', () => {
  let s = apply(init(PLAYERS), system, { type: 'begin' });
  for (let i = 0; i < 200 && s.phase !== 'game_over'; i += 1) {
    landlordPlatformModule.parseState(s);
    landlordPlatformModule.assertInvariants(s);
    s = timeout(s);
  }
  assert.equal(s.phase, 'game_over');
  landlordPlatformModule.parseState(s);
  landlordPlatformModule.assertInvariants(s);
});

test('platform 全副牌 54 张构成可用（牌组不变量）', () => {
  const deck = buildLandlordDeck();
  assert.equal(deck.length, 54);
  assert.equal(new Set(deck.map((c) => c.id)).size, 54);
});
