import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLandlordPlatformView } from '../src/game/landlord/types.ts';
import { parseGameView } from '../src/game/viewRegistry.ts';
import type { GameStatePayload } from '../src/game/types.ts';

const card = { id: 'spades-3-0', rank: '3', suit: 'spades' } as const;

function publicView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'landlord',
    rulesetId: 'landlord_platform_v1',
    schemaVersion: 1,
    phase: 'bidding',
    players: [
      { playerId: 'p1', handCount: 17 },
      { playerId: 'p2', handCount: 17 },
      { playerId: 'p3', handCount: 17 },
    ],
    bottomCards: [],
    bids: [],
    currentBidderId: 'p1',
    landlordId: null,
    currentPlayerId: null,
    currentTrick: null,
    passCount: 0,
    multiplier: 1,
    winnerTeam: null,
    winnerId: null,
    deadlineAt: 123,
    aborted: false,
    ...overrides,
  };
}

function playerView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...publicView(),
    me: { playerId: 'p1', hand: [card] },
    ...overrides,
  };
}

function payload(view: unknown, overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    sessionId: 's1',
    moduleId: 'landlord',
    status: 'ACTIVE',
    role: 'player',
    rulesetId: 'landlord_platform_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    view,
    ...overrides,
  };
}

test('landlord platform：玩家与观战视角严格解析并保持隐私边界', () => {
  const player = parseLandlordPlatformView(playerView(), 'player');
  assert.ok(player !== null && 'me' in player);
  assert.equal(player.me?.hand.length, 1);
  assert.deepEqual(player.bottomCards, []);
  assert.equal(player.players.some((entry) => 'hand' in entry), false);

  const spectator = parseLandlordPlatformView(publicView(), 'spectator');
  assert.ok(spectator !== null);
  assert.equal('me' in spectator, false);
  assert.equal(parseLandlordPlatformView(publicView(), 'player'), null);
  assert.equal(parseLandlordPlatformView(playerView(), 'spectator'), null);
});

test('landlord platform：未知键、非法枚举、非法牌与非法角色形状失败关闭', () => {
  assert.equal(parseLandlordPlatformView(playerView({ secret: true }), 'player'), null);
  assert.equal(parseLandlordPlatformView(playerView({ phase: 'unknown' }), 'player'), null);
  assert.equal(parseLandlordPlatformView(playerView({ winnerTeam: 'wolves' }), 'player'), null);
  assert.equal(
    parseLandlordPlatformView(playerView({ me: { playerId: 'p1', hand: [{ id: 'x', rank: '1' }] } }), 'player'),
    null,
  );
  assert.equal(
    parseLandlordPlatformView(playerView({ currentTrick: { playerId: 'p2', combo: { type: 'fake', mainRank: 1, length: 1, cards: [card] } } }), 'player'),
    null,
  );
});

test('viewRegistry：landlord platform v1 严格分派，未知版本失败，legacy 继续透传', () => {
  const parsed = parseGameView(payload(playerView()));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal((parsed.view as { rulesetId: string }).rulesetId, 'landlord_platform_v1');

  assert.equal(parseGameView(payload(playerView(), { viewVersion: 99 })).ok, false);
  assert.equal(parseGameView(payload(playerView({ extra: true }))).ok, false);
  assert.equal(
    parseGameView(payload({ phase: 'bidding' }, {
      rulesetId: undefined as unknown as string,
      engineContractVersion: undefined as unknown as number,
      viewVersion: undefined as unknown as number,
    })).ok,
    true,
  );
});
