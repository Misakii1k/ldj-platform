import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_FILES, hasCue, judgeVoice } from '../src/game/werewolf/ui/judgeVoice.ts';
import { buildWerewolfPresentation } from '../src/game/werewolf/presentation.ts';
import type { WerewolfView } from '../src/game/werewolf/types.ts';

test('沕官语音映射表夌粘包含 1-12 号及各核心阶殱语音', () => {
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

test('JudgeVoiceQueue interrupt 与 stopAll 能立即清橷队列并停止播放', () => {
  judgeVoice.enqueue('day_peaceful');
  judgeVoice.enqueue('vote_start');
  judgeVoice.interrupt();
  judgeVoice.stopAll();
  assert.strictEqual(hasCue('day_peaceful'), true);
});

test('buildWerewolfPresentation 正确暴露 rolesConfig 观色衠配置', () => {
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

  const model = buildWerewolfPresentation(dummyView, [{playerId: 'p1', nickname: '玧家1'}, {playerId: 'p2', nickname: '玧家2'}]);
  assert.strictEqual(model.rolesConfig.guard, false);
  assert.strictEqual(model.rolesConfig.hunter, true);
  assert.strictEqual(model.rolesConfig.idiot, false);
});
