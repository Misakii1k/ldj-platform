import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  unoHouseActionSchema,
  unoHouseCardSchema,
  unoHouseConfigSchema,
  unoHouseEventSchema,
  unoHousePlayerViewSchema,
  unoHousePublicViewSchema,
  unoHouseResultSchema,
  unoHouseStateSchema,
} from '../../server/house/schemas.ts';
import {
  challengeTimerId,
  penaltyTimerId,
  raceTimerId,
  turnTimerId,
  type UnoHouseAction,
  type UnoHouseCard,
  type UnoHouseEvent,
  type UnoHouseMatchState,
  type UnoHousePublicView,
  type UnoHouseResult,
  type UnoHouseRoundState,
  type UnoHouseState,
} from '../../server/house/types.ts';

function numberCard(id: string): UnoHouseCard {
  return { id, kind: 'number', color: 'red', value: 5 };
}

function validMatch(): UnoHouseMatchState {
  return {
    mode: 'individual',
    roundCount: 3,
    currentRound: 1,
    roundLimit: 3,
    teamPlayerIds: null,
    roundScores: [],
    roundResults: [],
    cumulativeScores: [0, 0],
    matchRanking: null,
    starterPlayerId: 'p1',
    lastFinisherPlayerId: null,
  };
}

function validRound(): UnoHouseRoundState {
  return {
    roundNumber: 1,
    phase: 'round_playing',
    players: ['p1', 'p2'],
    hands: { p1: [numberCard('r1:g0:red-5-1')], p2: [] },
    deck: [numberCard('r1:g0:blue-1')],
    discardPile: [numberCard('r1:g0:red-3-1')],
    topDiscard: numberCard('r1:g0:red-3-1'),
    currentColor: 'red',
    direction: 1,
    currentPlayerId: 'p1',
    hasDrawnThisTurn: false,
    pendingPenalty: null,
    unoRaceWindow: null,
    preCallPlayerIds: { p1: false, p2: false },
    deckGenerationCount: 1,
    turnToken: 'r1:t1',
    turnIndex: 0,
    sequence: 0,
    turnDeadlineAt: null,
    windowDeadlineAt: null,
  };
}

function validState(): UnoHouseState {
  return { match: validMatch(), round: validRound() };
}

function validPublicView(): UnoHousePublicView {
  return {
    gameId: 'uno',
    rulesetId: 'uno_platform_house_v1',
    phase: 'round_playing',
    round: 1,
    roundLimit: 3,
    mode: 'individual',
    players: [
      { playerId: 'p1', handCount: 1, unoCalled: false, isCurrentPlayer: true, teamId: null },
      { playerId: 'p2', handCount: 0, unoCalled: false, isCurrentPlayer: false, teamId: null },
    ],
    topDiscard: numberCard('r1:g0:red-3-1'),
    currentColor: 'red',
    currentPlayerId: 'p1',
    direction: 1,
    pendingPenalty: null,
    unoRaceWindow: null,
    deckCount: 1,
    discardCount: 1,
    roundScores: [],
    cumulativeScores: [0, 0],
    matchRanking: null,
    clockInfo: { turnDeadlineAt: null, windowDeadlineAt: null },
    lastRound: null,
  };
}

test('house schemas：config 接受合法 mode/roundCount 并拒绝非法值', () => {
  assert.deepEqual(
    unoHouseConfigSchema.parse({ mode: 'individual', roundCount: 1 }),
    { mode: 'individual', roundCount: 1 },
  );
  assert.deepEqual(
    unoHouseConfigSchema.parse({ mode: 'team', roundCount: 7 }),
    { mode: 'team', roundCount: 7 },
  );
  for (const roundCount of [2, 4, 6, 8, 0, -1, 2.5]) {
    assert.throws(() => unoHouseConfigSchema.parse({ mode: 'individual', roundCount }), z.ZodError);
  }
  assert.throws(() => unoHouseConfigSchema.parse({ mode: 'solo', roundCount: 1 }), z.ZodError);
  assert.throws(() => unoHouseConfigSchema.parse({ mode: 'individual' }), z.ZodError);
  assert.throws(() => unoHouseConfigSchema.parse({ mode: 'individual', roundCount: 3, extra: true }), z.ZodError);
});

test('house schemas：card 严格校验未知键/颜色/值', () => {
  const numberCardShape = { id: 'r1:g0:red-5-1', kind: 'number', color: 'red', value: 5 };
  assert.deepEqual(unoHouseCardSchema.parse(numberCardShape), numberCardShape);
  assert.doesNotThrow(() => unoHouseCardSchema.parse({ id: 'x', kind: 'skip', color: 'blue' }));
  assert.doesNotThrow(() => unoHouseCardSchema.parse({ id: 'x', kind: 'wild' }));
  assert.doesNotThrow(() => unoHouseCardSchema.parse({ id: 'x', kind: 'wild4' }));
  assert.throws(() => unoHouseCardSchema.parse({ ...numberCardShape, color: 'purple' }), z.ZodError);
  assert.throws(() => unoHouseCardSchema.parse({ ...numberCardShape, value: 10 }), z.ZodError);
  assert.throws(() => unoHouseCardSchema.parse({ ...numberCardShape, extra: 1 }), z.ZodError);
  assert.throws(() => unoHouseCardSchema.parse({ id: 'x', kind: 'skip', color: 'red', extra: 1 }), z.ZodError);
});

test('house schemas：全部合法 action 可解析并原样往返', () => {
  const actions: UnoHouseAction[] = [
    { type: 'begin' },
    { type: 'draw_card' },
    { type: 'pass_after_draw' },
    { type: 'call_uno' },
    { type: 'play_card', cardId: 'r1:g0:red-5-1' },
    { type: 'play_card', cardId: 'r1:g0:red-5-1', declaredColor: 'green' },
    { type: 'play_card', cardId: 'r1:g0:wild4-1', declaredColor: 'blue', preCallUno: true },
    { type: 'play_card', cardId: 'r1:g0:red-5-1', preCallUno: false },
    { type: 'catch_missed_uno', targetPlayerId: 'p2', windowToken: 'w1' },
    { type: 'stack_penalty', cardId: 'r1:g0:wild4-1' },
    { type: 'stack_penalty', cardId: 'r1:g0:wild4-1', declaredColor: 'red' },
    { type: 'accept_penalty', windowToken: 'w1' },
    { type: 'challenge_penalty', windowToken: 'w1' },
    { type: 'turn_timeout', round: 1, turnToken: 'r1:t1' },
    { type: 'penalty_timeout', round: 1, windowToken: 'w1' },
    { type: 'challenge_timeout', round: 1, windowToken: 'w1' },
    { type: 'uno_race_timeout', round: 1, windowToken: 'w1' },
    { type: 'round_transition' },
  ];
  for (const action of actions) {
    assert.deepEqual(unoHouseActionSchema.parse(action), action);
  }
});

test('house schemas：action 拒绝未知键/缺字段/非法枚举', () => {
  assert.throws(() => unoHouseActionSchema.parse({ type: 'play_card' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'play_card', cardId: 'x', declaredColor: 'purple' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'play_card', cardId: 'x', preCallUno: 'yes' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'play_card', cardId: 'x', extra: 1 }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'catch_missed_uno', targetPlayerId: 'p2' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'accept_penalty' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'challenge_penalty', windowToken: 42 }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'turn_timeout', turnToken: 't1' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'penalty_timeout', round: 0, windowToken: 'w1' }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'stack_penalty', cardId: 'x', declaredColor: 'red', extra: 1 }), z.ZodError);
  assert.throws(() => unoHouseActionSchema.parse({ type: 'unknown_action' }), z.ZodError);
});

test('house schemas：state 接受合法 match/round 结构', () => {
  const state = validState();
  assert.deepEqual(unoHouseStateSchema.parse(state), state);
});

test('house schemas：state 拒绝未知键与畸形窗口', () => {
  const badRoundKey = { ...validState(), round: { ...validRound(), unknownField: 1 } };
  assert.throws(() => unoHouseStateSchema.parse(badRoundKey), z.ZodError);

  const badMatchKey = { ...validState(), match: { ...validMatch(), extra: true } };
  assert.throws(() => unoHouseStateSchema.parse(badMatchKey), z.ZodError);

  const badDirection = { ...validState(), round: { ...validRound(), direction: 0 } };
  assert.throws(() => unoHouseStateSchema.parse(badDirection), z.ZodError);

  const badGenCount = { ...validState(), round: { ...validRound(), deckGenerationCount: -1 } };
  assert.throws(() => unoHouseStateSchema.parse(badGenCount), z.ZodError);

  const badPenalty = {
    ...validState(),
    round: {
      ...validRound(),
      pendingPenalty: {
        total: 4,
        kind: 'draw4',
        responderId: 'p2',
        challengeable: true,
        challengeEvidence: null,
      },
    },
  };
  assert.throws(() => unoHouseStateSchema.parse(badPenalty), z.ZodError);

  const badPenaltyKind = {
    ...validState(),
    round: {
      ...validRound(),
      pendingPenalty: {
        total: 8,
        kind: 'draw8',
        responderId: 'p2',
        challengeable: true,
        challengeEvidence: null,
        windowToken: 'w1',
      },
    },
  };
  assert.throws(() => unoHouseStateSchema.parse(badPenaltyKind), z.ZodError);

  const badRace = {
    ...validState(),
    round: {
      ...validRound(),
      unoRaceWindow: {
        targetPlayerId: 'p2',
        windowToken: 'w1',
        openedAtSequence: 1,
        closesEarlyOnNextEffective: false,
      },
    },
  };
  assert.throws(() => unoHouseStateSchema.parse(badRace), z.ZodError);

  const badRaceMissingTarget = {
    ...validState(),
    round: {
      ...validRound(),
      unoRaceWindow: { windowToken: 'w1', openedAtSequence: 1, closesEarlyOnNextEffective: true },
    },
  };
  assert.throws(() => unoHouseStateSchema.parse(badRaceMissingTarget), z.ZodError);
});

test('house schemas：public/player view 严格校验', () => {
  assert.deepEqual(unoHousePublicViewSchema.parse(validPublicView()), validPublicView());
  assert.throws(() => unoHousePublicViewSchema.parse({ ...validPublicView(), extra: 1 }), z.ZodError);

  // lastRound 结算快照：合法形状通过，多键/缺键/坏牌都被拒
  const withLastRound = {
    ...validPublicView(),
    phase: 'round_over' as const,
    lastRound: {
      roundNumber: 1,
      finisherPlayerId: 'p2',
      remainingHands: [[numberCard('r1:g0:red-5-1')], []],
    },
  };
  assert.doesNotThrow(() => unoHousePublicViewSchema.parse(withLastRound));
  assert.throws(
    () => unoHousePublicViewSchema.parse({ ...withLastRound, lastRound: { ...withLastRound.lastRound, extra: 1 } }),
    z.ZodError,
  );
  assert.throws(
    () => unoHousePublicViewSchema.parse({ ...validPublicView(), lastRound: undefined }),
    z.ZodError,
  );

  const playerView = {
    ...validPublicView(),
    me: {
      playerId: 'p1',
      hand: [numberCard('r1:g0:red-5-1')],
      playableCardIds: ['r1:g0:red-5-1'],
      capabilities: ['play_card'],
      hasDrawnThisTurn: false,
      isCurrentPlayer: true,
      activeWindow: null,
    },
  };
  assert.doesNotThrow(() => unoHousePlayerViewSchema.parse(playerView));
  assert.doesNotThrow(() => unoHousePlayerViewSchema.parse({ ...validPublicView(), me: null }));

  const meWithoutCapabilities = {
    playerId: 'p1',
    hand: [],
    playableCardIds: [],
    hasDrawnThisTurn: false,
    isCurrentPlayer: true,
    activeWindow: null,
  };
  assert.throws(() => unoHousePlayerViewSchema.parse({ ...validPublicView(), me: meWithoutCapabilities }), z.ZodError);
  assert.throws(
    () => unoHousePlayerViewSchema.parse({
      ...validPublicView(),
      me: { ...playerView.me, capabilities: ['play_card'], extra: true },
    }),
    z.ZodError,
  );
});

test('house schemas：event 判别联合校验', () => {
  const roundResult = {
    roundNumber: 1,
    finisherPlayerId: 'p1',
    perPlayerTotals: [0, 15],
    teamTotals: null,
    winnerPlayerIds: ['p1'],
    teamWinnerIds: null,
  };
  const result: UnoHouseResult = {
    mode: 'individual',
    winnerPlayerIds: ['p1'],
    teamWinnerIds: null,
    rounds: [roundResult],
    ranking: [
      { playerId: 'p1', total: 0, rank: 1 },
      { playerId: 'p2', total: 15, rank: 2 },
    ],
  };
  const events: UnoHouseEvent[] = [
    { type: 'card_played', playerId: 'p1', card: numberCard('r1:g0:red-5-1') },
    { type: 'card_drawn', playerId: 'p1', count: 2 },
    { type: 'uno_called', playerId: 'p1' },
    { type: 'missed_uno_caught', targetPlayerId: 'p2', catcherPlayerId: 'p1', windowToken: 'w1' },
    { type: 'penalty_stacked', playerId: 'p2', card: numberCard('r1:g0:red-5-1'), total: 6 },
    { type: 'penalty_accepted', playerId: 'p2', total: 4, windowToken: 'w1' },
    { type: 'challenge_resolved', challengerPlayerId: 'p1', targetPlayerId: 'p2', success: true, windowToken: 'w1' },
    { type: 'round_finished', roundNumber: 1, roundResult },
    { type: 'match_finished', roundNumber: 3, result },
    { type: 'phase_changed', phase: 'round_over', round: 1 },
  ];
  for (const event of events) {
    assert.deepEqual(unoHouseEventSchema.parse(event), event);
  }
  assert.throws(() => unoHouseEventSchema.parse({ type: 'nope' }), z.ZodError);
  assert.throws(() => unoHouseEventSchema.parse({ type: 'card_played', playerId: 'p1' }), z.ZodError);
  assert.throws(() => unoHouseEventSchema.parse({ type: 'card_drawn', playerId: 'p1', count: -1 }), z.ZodError);
});

test('house schemas：result 与排名校验', () => {
  const result: UnoHouseResult = {
    mode: 'team',
    winnerPlayerIds: ['p1', 'p3'],
    teamWinnerIds: ['t1'],
    rounds: [
      {
        roundNumber: 1,
        finisherPlayerId: 'p1',
        perPlayerTotals: [0, 12, 0, 10],
        teamTotals: [12, 10],
        winnerPlayerIds: ['p1', 'p3'],
        teamWinnerIds: ['t1'],
      },
    ],
    ranking: [
      { playerId: 'p1', total: 0, rank: 1 },
      { playerId: 'p3', total: 0, rank: 1 },
      { playerId: 'p4', total: 10, rank: 3 },
      { playerId: 'p2', total: 12, rank: 4 },
    ],
  };
  assert.deepEqual(unoHouseResultSchema.parse(result), result);
  assert.throws(() => unoHouseResultSchema.parse({ ...result, extra: true }), z.ZodError);
  assert.throws(
    () => unoHouseResultSchema.parse({ ...result, ranking: [{ playerId: 'p1', total: 0, rank: 0 }] }),
    z.ZodError,
  );
  assert.throws(() => unoHouseResultSchema.parse({ ...result, rounds: [{ roundNumber: 1 }] }), z.ZodError);
});

test('house schemas：计时器 id 唯一且作用域隔离', () => {
  assert.equal(turnTimerId(1, 't1'), turnTimerId(1, 't1'));
  assert.equal(raceTimerId(3, 'w9'), raceTimerId(3, 'w9'));
  assert.notEqual(turnTimerId(1, 't1'), turnTimerId(1, 't2'));
  assert.notEqual(turnTimerId(1, 't1'), turnTimerId(2, 't1'));
  assert.notEqual(raceTimerId(1, 'w1'), raceTimerId(1, 'w2'));
  assert.notEqual(raceTimerId(1, 'w1'), raceTimerId(2, 'w1'));
  assert.notEqual(penaltyTimerId(1, 'w1'), challengeTimerId(1, 'w1'));
  assert.notEqual(raceTimerId(1, 'w1'), penaltyTimerId(1, 'w1'));
  assert.notEqual(turnTimerId(1, 't1'), raceTimerId(1, 'w1'));
});
