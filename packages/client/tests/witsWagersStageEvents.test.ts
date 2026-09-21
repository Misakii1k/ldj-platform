import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStageEvents,
  diffBets,
  stageEventKey,
  type StageEvent,
} from '../src/game/wits-wagers/stage/deriveStageEvents.ts';
import type {
  BetPairView,
  BoardTargetView,
  PlayerRoundLedgerView,
  RoundResultView,
  WitsWagersPlayerView,
} from '../src/game/wits-wagers/types.ts';

function bets(
  a: [string | null, number],
  b: [string | null, number],
): BetPairView {
  return [
    { chipId: 'A', targetId: a[0] as BetPairView[0]['targetId'], extraStake: a[1] },
    { chipId: 'B', targetId: b[0] as BetPairView[1]['targetId'], extraStake: b[1] },
  ];
}

function baseView(overrides: Partial<WitsWagersPlayerView> = {}): WitsWagersPlayerView {
  return {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_platform_v1',
    viewVersion: 1,
    phase: 'answering',
    round: 1,
    totalRounds: 7,
    phaseEpoch: 1,
    roundToken: 'tok-1',
    deadlineAt: null,
    question: { prompt: 'Q', unit: '米' },
    players: [
      { playerId: 'p1', score: 0, winningGuesses: 0, hasSubmitted: false, forfeited: false },
      { playerId: 'p2', score: 0, winningGuesses: 0, hasSubmitted: false, forfeited: false },
    ],
    board: [],
    publicBets: {},
    revealed: null,
    history: [],
    result: null,
    me: {
      playerId: 'p1',
      submittedGuess: null,
      guessRevision: 0,
      acceptedBets: bets([null, 0], [null, 0]),
      betRevision: 0,
      reserved: 0,
      available: 2,
      canGuess: true,
      canBet: false,
    },
    ...overrides,
  };
}

function kinds(events: StageEvent[]): string[] {
  return events.map((e) => e.kind);
}

test('deriveStageEvents: 首帧（刷新重连）不推导任何演出', () => {
  // 这是防重演的第一道防线：prev 为 null 时调用方必须直接落终态
  assert.deepEqual(deriveStageEvents(null, baseView()), []);
});

test('deriveStageEvents: 我的估数被服务端接受后才演交牌', () => {
  const before = baseView();

  // 本地点了提交但服务端还没确认：不得有任何事件
  assert.deepEqual(deriveStageEvents(before, baseView()), []);

  const after = baseView({
    me: { ...before.me!, submittedGuess: { value: 100, origin: 'submitted' }, guessRevision: 1 },
  });
  const events = deriveStageEvents(before, after);
  assert.deepEqual(kinds(events), ['guessAccepted']);
  assert.equal(stageEventKey(events[0]!), 'guess:1:1');
});

test('deriveStageEvents: 改答案（revision 增长）会再次演出', () => {
  const before = baseView({
    me: {
      ...baseView().me!,
      submittedGuess: { value: 100, origin: 'submitted' },
      guessRevision: 1,
    },
  });
  const after = baseView({
    me: {
      ...baseView().me!,
      submittedGuess: { value: 250, origin: 'submitted' },
      guessRevision: 2,
    },
  });
  assert.deepEqual(kinds(deriveStageEvents(before, after)), ['guessAccepted']);
});

test('deriveStageEvents: 他人交牌只认公开的 hasSubmitted，且排除自己', () => {
  const before = baseView();
  const after = baseView({
    players: [
      { playerId: 'p1', score: 0, winningGuesses: 0, hasSubmitted: true, forfeited: false },
      { playerId: 'p2', score: 0, winningGuesses: 0, hasSubmitted: true, forfeited: false },
    ],
  });

  const events = deriveStageEvents(before, after);
  const other = events.find((e) => e.kind === 'otherSubmitted');
  assert.ok(other && other.kind === 'otherSubmitted');
  // 自己的交牌由 guessAccepted 负责，不应混进 otherSubmitted
  assert.deepEqual(other.playerIds, ['p2']);
});

test('deriveStageEvents: 版图从无到有触发揭晓，且键含 phaseEpoch', () => {
  const board: BoardTargetView[] = [
    { id: 'smaller', value: null, slot: 'SMALLER', odds: 6, authors: [], timeoutAuthors: [] },
    { id: 'g:100', value: 100, slot: 'C', odds: 2, authors: ['p1'], timeoutAuthors: [] },
  ];
  const before = baseView();
  const after = baseView({ phase: 'arranging', phaseEpoch: 2, board });

  const events = deriveStageEvents(before, after);
  const revealed = events.find((e) => e.kind === 'boardRevealed');
  assert.ok(revealed && revealed.kind === 'boardRevealed');
  assert.deepEqual(revealed.targetIds, ['smaller', 'g:100']);
  assert.equal(stageEventKey(revealed), 'board:1:2');

  // 版图已在则不重复推导
  assert.equal(
    deriveStageEvents(after, baseView({ phase: 'betting', phaseEpoch: 3, board })).some(
      (e) => e.kind === 'boardRevealed',
    ),
    false,
  );
});

test('deriveStageEvents: 下注只在 betRevision 增长时演出', () => {
  const before = baseView({
    phase: 'betting',
    me: { ...baseView().me!, canBet: true, betRevision: 0 },
  });

  // 同一 revision 下别人引发的推送：不得产生我的下注演出（否则会覆盖本地草稿的观感）
  assert.equal(
    deriveStageEvents(before, baseView({ phase: 'betting', me: { ...before.me! } })).some(
      (e) => e.kind === 'myBetsAccepted',
    ),
    false,
  );

  const after = baseView({
    phase: 'betting',
    me: {
      ...before.me!,
      betRevision: 1,
      acceptedBets: bets(['g:100', 3], [null, 0]),
    },
  });
  const events = deriveStageEvents(before, after);
  const mine = events.find((e) => e.kind === 'myBetsAccepted');
  assert.ok(mine && mine.kind === 'myBetsAccepted');
  assert.deepEqual(mine.moves, [{ type: 'place', chipId: 'A', to: 'g:100', extraStake: 3 }]);
  assert.equal(stageEventKey(mine), 'bets:1:1');
});

test('deriveStageEvents: 他人下注变化触发无手飞行', () => {
  const before = baseView({ phase: 'betting', publicBets: { p2: bets([null, 0], [null, 0]) } });
  const after = baseView({ phase: 'betting', publicBets: { p2: bets(['g:100', 2], [null, 0]) } });

  const events = deriveStageEvents(before, after);
  const changed = events.find((e) => e.kind === 'publicBetsChanged');
  assert.ok(changed && changed.kind === 'publicBetsChanged');
  assert.deepEqual(changed.playerIds, ['p2']);
});

test('deriveStageEvents: 结算揭晓后先高亮再收付，键按轮次去重', () => {
  const ledger: PlayerRoundLedgerView[] = [
    {
      playerId: 'p1',
      scoreBefore: 2,
      reserved: 1,
      winProfit: 6,
      loss: 0,
      authorBonus: 3,
      scoreAfter: 11,
    },
  ];
  const revealed: RoundResultView = {
    round: 1,
    question: {
      id: 'q1',
      prompt: 'Q',
      unit: '米',
      answer: 120,
      sourceUrl: '',
      sourceNote: '',
      asOf: '',
      explanation: '',
      reviewed: true,
    },
    board: [],
    bets: {},
    winningTargetId: 'g:100',
    awardedAuthors: ['p1'],
    ledger,
  };

  const before = baseView({ phase: 'betting' });
  const after = baseView({ phase: 'settlement', revealed });

  const events = deriveStageEvents(before, after);
  assert.deepEqual(kinds(events).slice(-2), ['winningRevealed', 'settlementLedger']);
  assert.equal(stageEventKey(events[events.length - 1]!), 'settle:1');

  // 同一轮的后续推送不再重复推导收付
  assert.equal(
    deriveStageEvents(after, baseView({ phase: 'settlement', revealed })).some(
      (e) => e.kind === 'settlementLedger',
    ),
    false,
  );
});

test('deriveStageEvents: 换轮先清桌', () => {
  const before = baseView();
  const after = baseView({ round: 2, roundToken: 'tok-2', phaseEpoch: 5 });
  const events = deriveStageEvents(before, after);
  assert.equal(events[0]?.kind, 'roundReset');
});

test('deriveStageEvents: 终局事件只在进入 game_over 时产生一次', () => {
  const before = baseView({ phase: 'settlement' });
  const after = baseView({ phase: 'game_over' });
  assert.ok(deriveStageEvents(before, after).some((e) => e.kind === 'gameOver'));
  assert.equal(
    deriveStageEvents(after, baseView({ phase: 'game_over' })).some((e) => e.kind === 'gameOver'),
    false,
  );
});

test('diffBets: 放置、拿回、移动与改注各自识别', () => {
  assert.deepEqual(diffBets(null, bets(['g:100', 0], [null, 0])), [
    { type: 'place', chipId: 'A', to: 'g:100', extraStake: 0 },
  ]);

  assert.deepEqual(diffBets(bets(['g:100', 2], [null, 0]), bets([null, 0], [null, 0])), [
    { type: 'pickUp', chipId: 'A', from: 'g:100' },
  ]);

  assert.deepEqual(diffBets(bets(['g:100', 2], [null, 0]), bets(['g:200', 2], [null, 0])), [
    { type: 'move', chipId: 'A', from: 'g:100', to: 'g:200', extraStake: 2 },
  ]);

  assert.deepEqual(diffBets(bets(['g:100', 2], [null, 0]), bets(['g:100', 5], [null, 0])), [
    { type: 'restake', chipId: 'A', at: 'g:100', from: 2, to: 5 },
  ]);

  // 两枚筹码同时变化时各自产生动作
  assert.equal(
    diffBets(bets([null, 0], [null, 0]), bets(['g:100', 1], ['g:200', 2])).length,
    2,
  );

  // 无变化不产生动作
  assert.deepEqual(diffBets(bets(['g:100', 2], [null, 0]), bets(['g:100', 2], [null, 0])), []);
});

test('stageEventKey: 轻量反馈不占用播放记忆', () => {
  assert.equal(stageEventKey({ kind: 'roundReset', round: 2 }), null);
  assert.equal(stageEventKey({ kind: 'otherSubmitted', playerIds: ['p2'] }), null);
  assert.equal(stageEventKey({ kind: 'publicBetsChanged', playerIds: ['p2'] }), null);
  assert.equal(stageEventKey({ kind: 'gameOver' }), null);
});
