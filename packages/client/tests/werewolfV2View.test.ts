/**
 * D5 P1a：werewolf v2（werewolf_platform_open_kill_v1）客户端视角解析。
 * 覆盖：schemaVersion 1 的 v2 view 解析（player/spectator）、顶层 rulesetId 判别、
 * viewRegistry 注册组合的严格解析与失败关闭、legacy（schemaVersion 4 / 无版本化判别符）不受影响。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWerewolfView } from '../src/game/werewolf/types.ts';
import { parseGameView } from '../src/game/viewRegistry.ts';
import type { GameStatePayload } from '../src/game/types.ts';

/** v2 公开视角 wire 形状（与服务端 v2PublicViewSchema 对齐）。 */
function v2Public(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'werewolf',
    rulesetId: 'werewolf_platform_open_kill_v1',
    schemaVersion: 1,
    phase: 'night',
    day: 1,
    players: [
      { playerId: 'p1', alive: true, seat: 0, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'p2', alive: true, seat: 1, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
    ],
    config: {
      rulesetId: 'werewolf_platform_open_kill_v1',
      preset: 'classic',
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'any',
      roles: { guard: false, hunter: false, idiot: false },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: [],
    speakingOrder: [],
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    deadlineAt: null,
    votesSubmitted: 0,
    votesExpected: 0,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    nightStage: 'wolf',
    winner: null,
    aborted: false,
    reveal: null,
    ...overrides,
  };
}

/** v2 玩家视角（me 完整形状，与服务端 v2PlayerViewSchema 对齐）。 */
function v2Player(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...v2Public(),
    me: {
      playerId: 'p1',
      role: 'wolf',
      alive: true,
      forfeited: false,
      confirmedRole: true,
      confirmedAnnouncement: false,
      canAct: true,
      hasVoted: false,
      myVote: null,
      lastWordsPending: false,
      wolfTeammateIds: ['p2'],
      wolfVotes: {},
      hasNightVoted: false,
      seerResults: [],
      seerCheckedThisNight: false,
      nightVictimId: null,
      witchSaveUsed: false,
      witchPoisonUsed: false,
      witchSaveDecision: null,
      witchPoisonDecided: false,
      witchCanSelfSave: false,
      guardTargetId: null,
      guardDecided: false,
      lastGuardTargetId: null,
      pendingShoot: false,
      idiotRevealed: false,
    },
    ...overrides,
  };
}

/** legacy 视角（schemaVersion 4，无顶层 rulesetId，config 锁定 legacy）。 */
function legacyView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = v2Public();
  delete base.rulesetId;
  return {
    ...base,
    schemaVersion: 4,
    config: { ...base.config, rulesetId: 'werewolf_legacy_platform_v2', wolfKillScope: 'non_wolf' },
    ...overrides,
  };
}

function payload(view: unknown, overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    sessionId: 's1',
    moduleId: 'werewolf',
    status: 'ACTIVE',
    role: 'player',
    rulesetId: 'werewolf_platform_open_kill_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    view,
    ...overrides,
  };
}

test('v2 player view（schemaVersion 1 + 顶层 rulesetId + me）通过 parseWerewolfView', () => {
  const parsed = parseWerewolfView(v2Player(), 'player');
  assert.ok(parsed !== null);
  if (parsed === null) return;
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.rulesetId, 'werewolf_platform_open_kill_v1');
  assert.equal(parsed.config.rulesetId, 'werewolf_platform_open_kill_v1');
  assert.equal(parsed.config.wolfKillScope, 'any');
  assert.equal(parsed.me?.role, 'wolf');
  assert.equal(parsed.me?.wolfTeammateIds.length, 1);
});

test('v2 spectator view（无 me）通过；player 缺 me / spectator 带 me 拒绝', () => {
  const spectator = parseWerewolfView(v2Public(), 'spectator');
  assert.ok(spectator !== null);
  assert.equal(spectator?.me, null);

  assert.equal(parseWerewolfView(v2Public(), 'player'), null, 'player 角色缺 me 拒绝');
  assert.equal(parseWerewolfView(v2Player(), 'spectator'), null, 'spectator 携带 me 拒绝');
  assert.equal(parseWerewolfView(v2Player())?.me?.role, 'wolf', '无角色参数保持兼容容忍');
});

test('v2 视图判别：legacy schema 不得带顶层 rulesetId；v2 schema 必须携带顶层 rulesetId', () => {
  assert.equal(parseWerewolfView(v2Player({ schemaVersion: 4 }), 'player'), null, 'legacy schema 不得带顶层 rulesetId');
  const noTop = v2Player();
  delete noTop.rulesetId;
  assert.equal(parseWerewolfView(noTop, 'player'), null, 'v2 schema 必须携带顶层 rulesetId');
});

test('v2 视图非法形状拒绝（未知键 / 错误枚举 / 夜刀范围矛盾）', () => {
  assert.equal(parseWerewolfView(v2Player({ extra: 1 }), 'player'), null);
  assert.equal(parseWerewolfView(v2Public({ phase: 'not_a_phase' }), 'spectator'), null);
  assert.equal(
    parseWerewolfView(v2Player({ config: { ...v2Player().config, wolfKillScope: 'non_wolf' } }), 'player'),
    null,
    'v2 夜刀范围必须 any',
  );
});

test('viewRegistry：werewolf:werewolf_platform_open_kill_v1:1 严格解析；未知版本/非法视图失败关闭', () => {
  const ok = parseGameView(payload(v2Player()));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal((ok.view as { schemaVersion?: number }).schemaVersion, 1);
    assert.equal((ok.view as { rulesetId?: string }).rulesetId, 'werewolf_platform_open_kill_v1');
  }

  assert.equal(
    parseGameView(payload(v2Public({ phase: 'bogus' }), { role: 'player' })).ok,
    false,
    '非法 v2 视图必须失败关闭（不得透传）',
  );
  assert.equal(
    parseGameView(payload(v2Player(), { viewVersion: 99 })).ok,
    false,
    '未知 viewVersion 失败关闭',
  );
  assert.equal(
    parseGameView(payload(v2Player(), { rulesetId: 'werewolf_unknown_v1' })).ok,
    false,
    '未知 ruleset 失败关闭',
  );
});

test('legacy werewolf：无版本化判别符透传；schemaVersion 4 视图仍可解析', () => {
  const legacyPayload = payload({ day: 1 }, {
    role: 'spectator',
    rulesetId: undefined as unknown as string,
    engineContractVersion: undefined as unknown as number,
    viewVersion: undefined as unknown as number,
  });
  assert.equal(parseGameView(legacyPayload).ok, true);
  const legacy = parseWerewolfView(legacyView());
  assert.ok(legacy !== null);
  assert.equal(legacy?.schemaVersion, 4);
  assert.equal(legacy?.config.wolfKillScope, 'non_wolf');
  assert.equal(legacy?.rulesetId, undefined);
});
