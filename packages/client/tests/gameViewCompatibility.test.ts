/**
 * D3 Task 9：D1 视角兼容门测试。
 * 把服务端 D1 冻结 wire 形状（server uno schemas / undercover views）送入
 * 真实客户端解析器：合法视角必须通过并保持 key/null/omission 语义；
 * 未知键、非法卡牌、错误角色形状与未知版本必须失败关闭。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnoView } from '../src/game/uno/types.ts';
import { parseUndercoverView } from '../src/game/undercover/types.ts';
import { parseGameView } from '../src/game/viewRegistry.ts';
import type { GameStatePayload } from '../src/game/types.ts';

// —— D1 wire 形状构造（与服务端 schema 逐字段对齐） ——

function unoPublic(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'uno',
    phase: 'playing',
    players: [{ playerId: 'p1', handCount: 7, unoCalled: false, isCurrentPlayer: true }],
    topDiscard: { id: 'red-5-1', kind: 'number', color: 'red', value: 5 },
    currentColor: 'red',
    currentPlayerId: 'p1',
    currentPlayerIndex: 0,
    nextPlayerId: 'p2',
    direction: 1,
    pendingDraw: 0,
    winnerId: null,
    deckCount: 93,
    discardCount: 1,
    lastPlayed: null,
    lastPlayedCard: null,
    lastPlayedBy: null,
    ...overrides,
  };
}

function unoPlayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...unoPublic(),
    me: {
      playerId: 'p1',
      hand: [{ id: 'red-5-1', kind: 'number', color: 'red', value: 5 }],
      hasDrawnThisTurn: false,
      isCurrentPlayer: true,
      playableCardIds: ['red-5-1'],
    },
    ...overrides,
  };
}

function undercoverPublic(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'word_reveal',
    round: 1,
    players: [{ playerId: 'p1', seat: 0, alive: true, exitReason: null, revealedRole: null }],
    speakingOrder: [],
    currentSpeakerId: null,
    deadlineAt: null,
    votesSubmitted: 0,
    votesExpected: 0,
    runoffCandidates: [],
    confirmedPlayerIds: [],
    lastVoteSummary: null,
    winner: null,
    aborted: false,
    reveal: null,
    ...overrides,
  };
}

function undercoverPlayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...undercoverPublic(),
    me: {
      playerId: 'p1',
      word: '油条',
      role: null,
      alive: true,
      confirmed: false,
      hasVoted: false,
      myVote: null,
    },
    ...overrides,
  };
}

function payload(
  view: unknown,
  overrides: Partial<GameStatePayload> = {},
): GameStatePayload {
  return {
    sessionId: 's1',
    moduleId: 'undercover',
    status: 'ACTIVE',
    role: 'player',
    rulesetId: 'undercover_classic_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    view,
    ...overrides,
  };
}

test('D1 UNO：玩家视角完整字段与 key/null 语义通过严格解析', () => {
  const parsed = parseUnoView(unoPlayer(), 'player');
  assert.ok(parsed !== null);
  if (parsed === null) return;
  assert.equal(parsed.gameId, 'uno');
  assert.equal(parsed.topDiscard.color, 'red');
  assert.equal(parsed.lastPlayed, null);
  assert.equal(parsed.winnerId, null);
  assert.equal('me' in parsed, true);
  assert.equal((parsed as { me: { hand: unknown[] } }).me.hand.length, 1);
});

test('D1 UNO：观战视角无 me，且携带 me 时拒绝', () => {
  const spectator = parseUnoView(unoPublic(), 'spectator');
  assert.ok(spectator !== null);
  assert.equal('me' in (spectator as object), false);
  assert.equal(parseUnoView(unoPlayer(), 'spectator'), null, '观战视角不得携带 me');
  assert.equal(parseUnoView(unoPublic({ me: null }), 'spectator'), null);
});

test('D1 UNO：未知键、非法卡牌、非法颜色一律拒绝', () => {
  assert.equal(parseUnoView(unoPlayer({ extraSecret: 1 }), 'player'), null);
  assert.equal(
    parseUnoView(unoPlayer({ topDiscard: { id: 'x', kind: 'number', color: 'red', value: 99 } }), 'player'),
    null,
    '非法 number 值拒绝',
  );
  assert.equal(
    parseUnoView(unoPlayer({ topDiscard: { id: 'x', kind: 'number', color: 'purple', value: 5 } }), 'player'),
    null,
    '非法颜色拒绝',
  );
  assert.equal(
    parseUnoView(unoPlayer({ topDiscard: { id: 'x', kind: 'wild', color: 'red' } }), 'player'),
    null,
    'wild 卡不得携带 color',
  );
  assert.equal(
    parseUnoView(unoPlayer({ me: { playerId: 'p1', hand: [{ id: 'bogus' }], hasDrawnThisTurn: false, isCurrentPlayer: true, playableCardIds: [] } }), 'player'),
    null,
    'me.hand 非法卡牌拒绝',
  );
});

test('D1 卧底：玩家/观战视角通过严格解析并保持隐藏 null 与 me 省略语义', () => {
  const player = parseUndercoverView(undercoverPlayer(), 'player');
  assert.ok(player !== null);
  if (player === null) return;
  assert.equal(player.reveal, null);
  assert.equal(player.winner, null);
  assert.equal('me' in player, true);
  assert.equal((player as { me: { word: string | null } }).me.word, '油条');
  assert.equal((player as { me: { role: string | null } }).me.role, null);

  const spectator = parseUndercoverView(undercoverPublic(), 'spectator');
  assert.ok(spectator !== null);
  assert.equal('me' in (spectator as object), false);
  assert.equal(parseUndercoverView(undercoverPlayer(), 'spectator'), null, '观战视角不得携带 me');
  assert.equal(parseUndercoverView(undercoverPublic({ me: null }), 'spectator'), null);
});

test('D1 卧底：未知键、非法枚举、me 语义错误拒绝', () => {
  assert.equal(parseUndercoverView(undercoverPlayer({ extra: 1 }), 'player'), null);
  assert.equal(
    parseUndercoverView(undercoverPublic({ phase: 'not_a_phase' }), 'spectator'),
    null,
  );
  assert.equal(
    parseUndercoverView(undercoverPlayer({ players: [{ playerId: 'p1', seat: 0, alive: true, exitReason: 'kicked', revealedRole: null }] }), 'player'),
    null,
    '非法 exitReason 拒绝',
  );
  assert.equal(
    parseUndercoverView(undercoverPlayer({ me: { playerId: 'p1', word: 'x', role: null, alive: true, confirmed: false, hasVoted: false, myVote: null, secret: true } }), 'player'),
    null,
    'me 未知键拒绝',
  );
  assert.equal(
    parseUndercoverView(undercoverPublic(), 'player'),
    null,
    '玩家角色缺少 me 拒绝',
  );
});

test('viewRegistry：按判别符分发；未知版本失败关闭；legacy 透传', () => {
  const uno = payload(unoPlayer(), { moduleId: 'uno', rulesetId: 'uno_legacy_platform_v1' });
  assert.equal(parseGameView(uno).ok, true);

  const spy = payload(undercoverPlayer(), { role: 'spectator', view: undercoverPublic() });
  assert.equal(parseGameView(spy).ok, true);

  assert.equal(parseGameView(payload(undercoverPlayer(), { viewVersion: 99 })).ok, false, '未知 viewVersion 失败关闭');
  assert.equal(
    parseGameView(payload(undercoverPlayer(), { rulesetId: 'undercover_whiteboard_v1' })).ok,
    false,
    '未知 ruleset 失败关闭',
  );
  assert.equal(
    parseGameView(payload(undercoverPlayer(), { engineContractVersion: undefined as unknown as number })).ok,
    false,
    'V2 游戏缺少 contract 版本失败关闭',
  );
  assert.equal(
    parseGameView(payload(undercoverPlayer(), { role: 'spectator', view: undercoverPlayer() })).ok,
    false,
    '观战角色携带 me 失败关闭',
  );

  // legacy 狼人/斗地主：无版本化判别符也透传（保持既有兼容解析）。
  const werewolf = payload({ day: 1 }, { moduleId: 'werewolf', role: 'spectator', rulesetId: undefined as unknown as string, viewVersion: undefined as unknown as number });
  assert.equal(parseGameView(werewolf).ok, true);
  const landlord = payload({ phase: 'bidding' }, { moduleId: 'landlord', role: 'player', rulesetId: undefined as unknown as string, viewVersion: undefined as unknown as number });
  assert.equal(parseGameView(landlord).ok, true);
});
