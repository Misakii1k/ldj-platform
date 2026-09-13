import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWerewolfPresentation } from '../src/game/werewolf/presentation.ts';
import { parseWerewolfView, type WerewolfMe, type WerewolfPhase, type WerewolfView } from '../src/game/werewolf/types.ts';

const members = ['w1', 'w2', 's', 'x', 'g', 'v'].map((playerId, index) => ({
  playerId,
  nickname: `玩家${index + 1}`,
}));

const baseMe: WerewolfMe = {
  playerId: 'w1',
  role: 'wolf',
  alive: true,
  forfeited: false,
  confirmedRole: false,
  confirmedAnnouncement: false,
  canAct: true,
  hasVoted: false,
  myVote: null,
  lastWordsPending: false,
  wolfTeammateIds: ['w2'],
  wolfVotes: {},
  hasNightVoted: false,
  seerResults: [],
  seerCheckedThisNight: false,
  nightVictimId: null,
  witchSaveUsed: false,
  witchPoisonUsed: false,
  witchSaveDecision: null,
  witchPoisonDecided: false,
  witchCanSelfSave: true,
  guardTargetId: null,
  guardDecided: false,
  lastGuardTargetId: null,
  pendingShoot: false,
  idiotRevealed: false,
};

function view(phase: WerewolfPhase, overrides: Partial<WerewolfView> = {}): WerewolfView {
  return {
    gameId: 'werewolf',
    schemaVersion: 4,
    phase,
    day: phase === 'role_reveal' ? 0 : 1,
    players: [
      { playerId: 'w1', alive: true, seat: 0, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'w2', alive: true, seat: 1, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 's', alive: true, seat: 2, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'x', alive: true, seat: 3, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'g', alive: true, seat: 4, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'v', alive: true, seat: 5, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
    ],
    config: {
      rulesetId: 'werewolf_legacy_platform_v2',
      preset: 'classic',
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'non_wolf',
      roles: { guard: true, hunter: true, idiot: true },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: [],
    speakingOrder: ['w1', 'w2', 's', 'x', 'g', 'v'],
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    deadlineAt: 10_000,
    votesSubmitted: 0,
    votesExpected: 6,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: structuredClone(baseMe),
    ...overrides,
  };
}

function actionIds(model: ReturnType<typeof buildWerewolfPresentation>): string[] {
  return model.actionGroups.map((group) => group.id);
}

function optionIds(model: ReturnType<typeof buildWerewolfPresentation>): string[] {
  return model.actionGroups.flatMap((group) => group.options.map((option) => option.id));
}

test('表现层为每个阶段生成服务端动作名与叙事，不在客户端推进状态', () => {
  const cases: Array<[WerewolfView, string[]]> = [
    [view('role_reveal'), ['confirm_role']],
    [view('night'), ['night_kill']],
    [view('hunter_shot', { pendingShooterId: 'w1', me: { ...baseMe, pendingShoot: true } }), ['hunter_shoot']],
    [view('day_announcement'), ['confirm_announcement']],
    [view('discussion', { currentSpeakerId: 'w1' }), ['finish_speech']],
    [view('voting'), ['day_vote']],
    [view('runoff_voting', { runoffCandidates: ['w2', 's'] }), ['day_vote']],
    [view('vote_result'), []],
    [view('last_words', { lastWordsPlayerId: 'w1', me: { ...baseMe, lastWordsPending: true } }), ['finish_last_words']],
    [view('game_over', { winner: 'village' }), []],
  ];

  for (const [input, expected] of cases) {
    const model = buildWerewolfPresentation(input, members);
    assert.deepEqual(actionIds(model), expected, input.phase);
    assert.equal(model.phase, input.phase);
    assert.equal(typeof model.narrative, 'string');
    assert.equal(model.deadlineAt, input.deadlineAt);
  }
});

test('开放夜刀含自己与同伴，legacy 夜刀同时排除二者', () => {
  const legacy = buildWerewolfPresentation(view('night'), members);
  assert.deepEqual(optionIds(legacy), ['s', 'x', 'g', 'v']);

  const open = buildWerewolfPresentation(view('night', {
    config: {
      ...view('night').config,
      rulesetId: 'werewolf_platform_open_kill_v1',
      wolfKillScope: 'any',
    },
  }), members);
  assert.deepEqual(optionIds(open), ['w1', 'w2', 's', 'x', 'g', 'v']);
  assert.match(open.actionGroups[0]!.hint ?? '', /自己或同伴/);
  assert.deepEqual(open.actionGroups[0]!.options[0]!.payload, { type: 'night_kill', targetPlayerId: 'w1' });
});

test('守卫、女巫、白痴与加赛候选边界保持 reducer 语义', () => {
  const guard = buildWerewolfPresentation(view('night', {
    me: { ...baseMe, playerId: 'g', role: 'guard', wolfTeammateIds: [], lastGuardTargetId: 's' },
  }), members);
  assert.deepEqual(optionIds(guard), ['w1', 'w2', 'x', 'v', 'skip_guard']);

  const witchCannotSelfSave = buildWerewolfPresentation(view('night', {
    me: {
      ...baseMe,
      playerId: 'x',
      role: 'witch',
      wolfTeammateIds: [],
      nightVictimId: 'x',
      witchCanSelfSave: false,
    },
  }), members);
  assert.deepEqual(optionIds(witchCannotSelfSave), ['skip_save']);

  const revealedPlayers = view('voting').players.map((player) => player.playerId === 's'
    ? { ...player, idiotRevealed: true }
    : player);
  const voting = buildWerewolfPresentation(view('voting', { players: revealedPlayers }), members);
  assert.equal(optionIds(voting).includes('s'), false);

  const revealedIdiot = buildWerewolfPresentation(view('voting', {
    players: revealedPlayers,
    me: { ...baseMe, idiotRevealed: true },
  }), members);
  assert.deepEqual(actionIds(revealedIdiot), []);
  assert.match(revealedIdiot.waitingHint ?? '', /失去投票权/);

  const runoff = buildWerewolfPresentation(view('runoff_voting', {
    players: revealedPlayers,
    runoffCandidates: ['w2', 's', 'v'],
  }), members);
  assert.deepEqual(optionIds(runoff), ['w2', 'v', 'abstain']);
});

test('票数只透传服务端进度，投票结果与终局复盘按公开字段展示', () => {
  const voting = buildWerewolfPresentation(view('voting', { votesSubmitted: 2, votesExpected: 5 }), members);
  assert.deepEqual(voting.voteProgress, {
    submitted: 2,
    expected: 5,
    percent: 40,
    remaining: 3,
    isVoter: true,
    hasVoted: false,
    isRunoffCandidate: false,
    isRunoff: false,
  });

  // 测试已投票状态
  const votedMe = { ...baseMe, hasVoted: true, myVote: 'w2' };
  const votingVoted = buildWerewolfPresentation(view('voting', { votesSubmitted: 4, votesExpected: 5, me: votedMe }), members);
  assert.equal(votingVoted.voteProgress?.hasVoted, true);
  assert.equal(votingVoted.voteProgress?.submitted, 4);
  assert.equal(votingVoted.voteProgress?.percent, 80);
  assert.equal(votingVoted.voteProgress?.remaining, 1);

  // 测试 PK 决选阶段与候选人视角
  const runoffCandidate = buildWerewolfPresentation(view('runoff_voting', {
    votesSubmitted: 1,
    votesExpected: 3,
    runoffCandidates: ['w1', 's'],
  }), members);
  assert.equal(runoffCandidate.voteProgress?.isRunoff, true);
  assert.equal(runoffCandidate.voteProgress?.isRunoffCandidate, true);
  assert.equal(runoffCandidate.voteProgress?.isVoter, false);
  assert.equal(runoffCandidate.voteProgress?.percent, 33);
  assert.equal(runoffCandidate.voteProgress?.remaining, 2);

  // 测试观战者视角
  const spectatorVoting = buildWerewolfPresentation(view('voting', { votesSubmitted: 3, votesExpected: 6, me: null }), members);
  assert.equal(spectatorVoting.voteProgress?.isVoter, false);
  assert.equal(spectatorVoting.voteProgress?.percent, 50);
  assert.equal(spectatorVoting.voteProgress?.remaining, 3);

  const result = buildWerewolfPresentation(view('vote_result', {
    lastVoteSummary: {
      day: 1,
      kind: 'normal',
      outcome: 'eliminated',
      tally: { w2: 3, v: 1 },
      abstained: 1,
      eliminatedPlayerId: 'w2',
    },
  }), members);
  assert.deepEqual(result.voteLedger?.rows, [
    { name: '玩家2', count: 3 },
    { name: '玩家6', count: 1 },
  ]);
  assert.equal(result.voteLedger?.abstained, 1);

  const over = buildWerewolfPresentation(view('game_over', {
    winner: 'village',
    reveal: { roles: { w1: 'wolf', w2: 'wolf', s: 'seer', x: 'witch', g: 'guard', v: 'villager' }, voteHistory: [] },
  }), members);
  assert.equal(over.reveal?.headline, '好人阵营获胜');
  assert.equal(over.reveal?.rows.length, 6);
});

test('发言阶段取当前发言者最新公屏，座位号从 1 开始', () => {
  const discussion = buildWerewolfPresentation(
    view('discussion', { currentSpeakerId: 's' }),
    members,
    [
      { cursor: 1, kind: 'player', fromPlayerId: 'w1', text: '旧发言', at: 1 },
      { cursor: 2, kind: 'player', fromPlayerId: 's', text: '3 号先听身份再投票', at: 2 },
    ],
  );
  assert.equal(discussion.seats.find((seat) => seat.playerId === 's')?.seatLabel, '3 号');
  assert.equal(discussion.speakerLine, '3 号先听身份再投票');

  const lastWords = buildWerewolfPresentation(
    view('last_words', { lastWordsPlayerId: 'w1', me: { ...baseMe, lastWordsPending: true } }),
    members,
    [{ cursor: 3, kind: 'player', fromPlayerId: 'w1', text: '听预言家的', at: 3 }],
  );
  assert.equal(lastWords.seats.find((seat) => seat.playerId === 'w1')?.isSpeaking, true);
  assert.equal(lastWords.speakerLine, '听预言家的');
});


test('视图解析接受无 me 的观战视角，并拒绝旧 schema、规则矛盾及未支持上游字段', () => {
  const spectator = structuredClone(view('night')) as Record<string, unknown>;
  delete spectator.me;
  assert.equal(parseWerewolfView(spectator)?.me, null);

  assert.equal(parseWerewolfView({ ...view('night'), schemaVersion: 3 }), null);
  assert.equal(parseWerewolfView({ ...view('night'), sheriffId: 'w1' }), null);
  assert.equal(parseWerewolfView({
    ...view('night'),
    config: { ...view('night').config, whiteWolfKing: true },
  }), null);
  assert.equal(parseWerewolfView({
    ...view('night'),
    config: { ...view('night').config, rulesetId: 'werewolf_legacy_platform_v2', wolfKillScope: 'any' },
  }), null);
  assert.equal(parseWerewolfView({
    ...view('game_over'),
    reveal: { roles: { w1: 'whiteWolfKing' }, voteHistory: [] },
  }), null);
});

test('加赛候选人视角不渲染投票动作组且 waitingHint 提示不投票', () => {
  const model = buildWerewolfPresentation(
    view('runoff_voting', {
      runoffCandidates: ['w1', 'w2'],
      me: { ...baseMe, playerId: 'w1', hasVoted: false },
    }),
    members,
  );
  assert.equal(model.actionGroups.some((g) => g.id === 'day_vote'), false);
  assert.equal(model.waitingHint, '你是加赛候选人，本轮不投票');
});

test('平票 voteLedger headline 修正为进入加赛投票', () => {
  const model = buildWerewolfPresentation(
    view('vote_result', {
      lastVoteSummary: {
        day: 1,
        kind: 'normal',
        outcome: 'tie',
        tally: { w1: 2, w2: 2 },
        abstained: 0,
        eliminatedPlayerId: null,
      },
    }),
    members,
  );
  assert.equal(model.voteLedger?.headline, '平票，进入加赛投票');
});

test('v2 规则下守卫动作候选包含自己', () => {
  const guardMe: WerewolfMe = {
    ...baseMe,
    playerId: 'g',
    role: 'guard',
    guardDecided: false,
    lastGuardTargetId: null,
  };
  const model = buildWerewolfPresentation(
    view('night', {
      config: { ...view('night').config, rulesetId: 'werewolf_platform_open_kill_v1' },
      me: guardMe,
    }),
    members,
  );
  const guardGroup = model.actionGroups.find((g) => g.id === 'guard_guard');
  assert.ok(guardGroup);
  assert.ok(guardGroup.options.some((opt) => (opt.payload as { targetPlayerId?: string }).targetPlayerId === 'g'));
});

test('presentation 模型正确透传 nightStage 和 pendingShooterId', () => {
  const model = buildWerewolfPresentation(
    view('night', {
      nightStage: 'witch',
      pendingShooterId: 'w1',
    }),
    members,
  );
  assert.equal(model.nightStage, 'witch');
  assert.equal(model.pendingShooterId, 'w1');
});
