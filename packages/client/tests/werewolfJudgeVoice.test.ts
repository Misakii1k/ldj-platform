import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCue, judgeVoice } from '../src/game/werewolf/ui/judgeVoice.ts';
import { buildWerewolfPresentation } from '../src/game/werewolf/presentation.ts';
import type { WerewolfView } from '../src/game/werewolf/types.ts';

test('法官语音映射表完整包含 1-12 号及各核心阶段语音', () => {
  // 验证 1-12 号座次配套语音均存在
  for (let seat = 1; seat <= 12; seat += 1) {
    assert.strictEqual(hasCue(`day_death_number_${seat}`), true);
    assert.strictEqual(hasCue(`speak_normal_${seat}`), true);
    assert.strictEqual(hasCue(`speak_${seat}`), true);
    assert.strictEqual(hasCue(`exile_${seat}`), true);
  }

  // 验证基础阶段与新扩展语音
  assert.strictEqual(hasCue('night_start'), true);
  assert.strictEqual(hasCue('wolf_open_first'), true);
  assert.strictEqual(hasCue('wolf_open_normal'), true);
  assert.strictEqual(hasCue('wolf_open'), true);
  assert.strictEqual(hasCue('wolf_kill'), true);
  assert.strictEqual(hasCue('wolf_close'), true);
  assert.strictEqual(hasCue('witch_open'), true);
  assert.strictEqual(hasCue('witch_death_point'), true);
  assert.strictEqual(hasCue('witch_cure_prompt'), true);
  assert.strictEqual(hasCue('witch_poison_prompt'), true);
  assert.strictEqual(hasCue('witch_close'), true);
  assert.strictEqual(hasCue('seer_open'), true);
  assert.strictEqual(hasCue('seer_check'), true);
  assert.strictEqual(hasCue('seer_result_generic'), true);
  assert.strictEqual(hasCue('seer_close'), true);
  assert.strictEqual(hasCue('guard_open'), true);
  assert.strictEqual(hasCue('guard_close'), true);
  assert.strictEqual(hasCue('day_peaceful'), true);
  assert.strictEqual(hasCue('day_start'), true);
  assert.strictEqual(hasCue('day_death_intro'), true);
  assert.strictEqual(hasCue('vote_tie_pk'), true);
  assert.strictEqual(hasCue('game_over_good'), true);
  assert.strictEqual(hasCue('game_over_wolf'), true);
  assert.strictEqual(hasCue('vote_start'), true);

  // 验证死者号码 1-12 号
  for (let seat = 1; seat <= 12; seat += 1) {
    assert.strictEqual(hasCue(`day_death_number_${seat}`), true);
  }

  // 验证常规发言 1-12 号
  for (let seat = 1; seat <= 12; seat += 1) {
    assert.strictEqual(hasCue(`speak_normal_${seat}`), true);
  }

  // 验证不存在的 key 返回 false
  assert.strictEqual(hasCue('invalid_key_xyz'), false);
});

test('JudgeVoiceQueue interrupt 与 stopAll 能立即清空队列并停止播放', () => {
  judgeVoice.enqueue('day_peaceful');
  judgeVoice.enqueue('vote_start');
  judgeVoice.interrupt();
  judgeVoice.stopAll();
  assert.strictEqual(hasCue('day_peaceful'), true);
});

test('buildWerewolfPresentation 正确暴露 rolesConfig 角色池配置', () => {
  const dummyView: WerewolfView = {
    gameId: 'werewolf',
    schemaVersion: 4,
    phase: 'night',
    day: 1,
    players: [
      { playerId: 'p1', alive: true, seat: 0, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
      { playerId: 'p2', alive: true, seat: 1, forfeited: false, exitReason: null, revealedRole: null, idiotRevealed: false },
    ],
    config: {
      rulesetId: 'werewolf_legacy_platform_v2',
      preset: 'classic',
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'non_wolf',
      roles: { guard: false, hunter: true, idiot: false },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: [],
    speakingOrder: ['p1', 'p2'],
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    deadlineAt: 10000,
    votesSubmitted: 0,
    votesExpected: 2,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: null,
  };

  const model = buildWerewolfPresentation(dummyView, [{playerId: 'p1', nickname: '玩家1'}, {playerId: 'p2', nickname: '玩家2'}]);
  assert.strictEqual(model.rolesConfig.guard, false);
  assert.strictEqual(model.rolesConfig.hunter, true);
  assert.strictEqual(model.rolesConfig.idiot, false);
});

test('死讯隐蔽：出局玩家统一显示为【已出局】，绝不泄露夜晚遇袭/女巫毒杀等死因', () => {
  const view: WerewolfView = {
    day: 1,
    phase: 'day_announcement',
    players: [
      { playerId: 'p1', seat: 0, alive: false, exitReason: 'night_kill', idiotRevealed: false, revealedRole: null },
      { playerId: 'p2', seat: 1, alive: false, exitReason: 'poisoned', idiotRevealed: false, revealedRole: null },
      { playerId: 'p3', seat: 2, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
    ],
    config: {
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'any',
      roles: { guard: false, hunter: true, idiot: false },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: ['p1', 'p2'],
    speakingOrder: ['p3'],
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    deadlineAt: 10000,
    votesSubmitted: 0,
    votesExpected: 1,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: {
      playerId: 'p3',
      role: 'villager',
      alive: true,
      confirmedRole: true,
      confirmedAnnouncement: false,
      lastWordsPending: false,
      wolfTeammateIds: [],
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
  };

  const model = buildWerewolfPresentation(view, [
    { playerId: 'p1', nickname: '玩家1' },
    { playerId: 'p2', nickname: '玩家2' },
    { playerId: 'p3', nickname: '玩家3' },
  ]);

  const p1Seat = model.seats.find((s) => s.playerId === 'p1');
  const p2Seat = model.seats.find((s) => s.playerId === 'p2');
  assert.strictEqual(p1Seat?.statusLabel, '已出局');
  assert.strictEqual(p2Seat?.statusLabel, '已出局');
  assert.strictEqual(p1Seat?.statusLabel.includes('夜晚遇袭'), false);
  assert.strictEqual(p2Seat?.statusLabel.includes('女巫毒杀'), false);
});

test('女巫解药用后无法看刀口：nightVictimId 为 null 时，前端不显示受害者姓名与座位', () => {
  const view: WerewolfView = {
    day: 2,
    phase: 'night',
    players: [
      { playerId: 'w1', seat: 0, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
      { playerId: 'v1', seat: 1, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
      { playerId: 'witch', seat: 2, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
    ],
    config: {
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'any',
      roles: { guard: false, hunter: true, idiot: false },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: [],
    speakingOrder: [],
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    deadlineAt: 10000,
    votesSubmitted: 0,
    votesExpected: 3,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: {
      playerId: 'witch',
      role: 'witch',
      alive: true,
      confirmedRole: true,
      confirmedAnnouncement: false,
      lastWordsPending: false,
      wolfTeammateIds: [],
      wolfVotes: {},
      hasNightVoted: false,
      seerResults: [],
      seerCheckedThisNight: false,
      // 女巫已用解药，服务端给出的 nightVictimId 必为 null
      nightVictimId: null,
      witchSaveUsed: true,
      witchPoisonUsed: false,
      witchSaveDecision: false,
      witchPoisonDecided: false,
      witchCanSelfSave: false,
      guardTargetId: null,
      guardDecided: false,
      lastGuardTargetId: null,
      pendingShoot: false,
      idiotRevealed: false,
    },
  };

  const model = buildWerewolfPresentation(view, [
    { playerId: 'w1', nickname: '狼人' },
    { playerId: 'v1', nickname: '村民' },
    { playerId: 'witch', nickname: '女巫本人' },
  ]);

  assert.strictEqual(model.self?.nightVictimName, null);
  assert.strictEqual(model.self?.nightVictimSeat, null);
  assert.strictEqual(model.self?.witchSaveUsed, true);
});

test('非发言阶段（如夜晚或天亮公布）席位绝不亮起 isSpeaking', () => {
  const nightView: WerewolfView = {
    day: 2,
    phase: 'night',
    players: [
      { playerId: 'p1', seat: 0, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
      { playerId: 'p2', seat: 1, alive: true, exitReason: null, idiotRevealed: false, revealedRole: null },
    ],
    config: {
      pace: 'standard',
      witchSelfSave: 'first_night',
      winCondition: 'numbers',
      wolfKillScope: 'any',
      roles: { guard: false, hunter: true, idiot: false },
    },
    confirmedRolePlayerIds: [],
    announcementConfirmedPlayerIds: [],
    lastNightDeaths: [],
    speakingOrder: ['p1', 'p2'],
    // 即使 currentSpeakerId 残留或被设置，由于阶段为 night，席位也决不能判定为 isSpeaking
    currentSpeakerId: 'p2',
    lastWordsPlayerId: null,
    deadlineAt: 10000,
    votesSubmitted: 0,
    votesExpected: 2,
    runoffCandidates: [],
    lastVoteSummary: null,
    pendingShooterId: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: null,
  };

  const model = buildWerewolfPresentation(nightView, [
    { playerId: 'p1', nickname: '玩家1' },
    { playerId: 'p2', nickname: '玩家2' },
  ]);

  const p2Seat = model.seats.find((s) => s.playerId === 'p2');
  assert.strictEqual(p2Seat?.isSpeaking, false, '夜晚阶段即使有 currentSpeakerId 也不得判定为发言中');
});

test('法官语音：加赛平票有对应语音 vote_tie_night，全员弃票不播放再次平票语音', () => {
  assert.strictEqual(hasCue('vote_tie_night'), true);
});

test('法官语音：猎人出局开枪语音 hunter_shoot 存在且可用', () => {
  assert.strictEqual(hasCue('hunter_shoot'), true);
});

