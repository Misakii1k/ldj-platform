/**
 * R2：uno_platform_house_v1 viewVersion 2 客户端解析契约。
 * lastRound 结算快照：对局中为 null；round_over / match_over 下发完整快照；
 * 严格键集——缺 lastRound 键或多未知键都整帧拒绝（fail-closed）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnoHouseView } from '../src/game/uno/types.ts';

function baseHouseView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'uno',
    rulesetId: 'uno_platform_house_v1',
    phase: 'round_playing',
    round: 1,
    roundLimit: 3,
    mode: 'individual',
    players: [
      { playerId: 'p1', handCount: 7, unoCalled: false, isCurrentPlayer: true, teamId: null },
      { playerId: 'p2', handCount: 6, unoCalled: false, isCurrentPlayer: false, teamId: null },
    ],
    topDiscard: { id: 't1', kind: 'number', color: 'red', value: 5 },
    currentColor: 'red',
    currentPlayerId: 'p1',
    direction: 1,
    pendingPenalty: null,
    unoRaceWindow: null,
    deckCount: 40,
    discardCount: 10,
    roundScores: [],
    cumulativeScores: [0, 0],
    matchRanking: null,
    clockInfo: { turnDeadlineAt: null, windowDeadlineAt: null },
    lastRound: null,
    me: {
      playerId: 'p1',
      hand: [{ id: 'h1', kind: 'number', color: 'red', value: 3 }],
      playableCardIds: ['h1'],
      capabilities: ['play_card'],
      hasDrawnThisTurn: false,
      isCurrentPlayer: true,
      activeWindow: null,
    },
    ...overrides,
  };
}

test('house view v2：对局中 lastRound 为 null 时正常解析', () => {
  const parsed = parseUnoHouseView(baseHouseView(), 'player');
  assert.ok(parsed);
  assert.equal(parsed!.lastRound, null);
});

test('house view v2：缺 lastRound 键整帧拒绝（旧 v1 帧不再兼容）', () => {
  const legacy = baseHouseView();
  delete legacy.lastRound;
  assert.equal(parseUnoHouseView(legacy, 'player'), null);
});

test('house view v2：round_over 下发 lastRound 快照时逐张手牌被解析', () => {
  const parsed = parseUnoHouseView(
    baseHouseView({
      phase: 'round_over',
      lastRound: {
        roundNumber: 1,
        finisherPlayerId: 'p2',
        remainingHands: [
          [{ id: 'r1', kind: 'number', color: 'blue', value: 7 }, { id: 'r2', kind: 'wild4' }],
          [],
        ],
      },
    }),
    'player',
  );
  assert.ok(parsed);
  assert.equal(parsed!.lastRound?.finisherPlayerId, 'p2');
  assert.equal(parsed!.lastRound?.remainingHands.length, 2);
  assert.equal(parsed!.lastRound?.remainingHands[0]?.length, 2);
  assert.deepEqual(parsed!.lastRound?.remainingHands[1], []);
});

test('house view v2：lastRound 多未知键或坏牌整帧拒绝', () => {
  assert.equal(
    parseUnoHouseView(
      baseHouseView({
        phase: 'round_over',
        lastRound: { roundNumber: 1, finisherPlayerId: 'p2', remainingHands: [], leak: true },
      }),
      'player',
    ),
    null,
  );
  assert.equal(
    parseUnoHouseView(
      baseHouseView({
        phase: 'round_over',
        lastRound: {
          roundNumber: 1,
          finisherPlayerId: 'p2',
          remainingHands: [[{ id: 'bad', kind: 'number', color: 'purple', value: 1 }]],
        },
      }),
      'player',
    ),
    null,
  );
  assert.equal(
    parseUnoHouseView(baseHouseView({ phase: 'round_over', lastRound: { roundNumber: 1 } }), 'player'),
    null,
  );
});
