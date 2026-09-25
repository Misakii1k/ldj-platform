import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import {
  cannedWerewolfSpeech,
  overlayWerewolfBotPrompt,
  pickWerewolfPlayAction,
  type WerewolfPlayView,
} from '../server/play.ts';

function view(overrides: Partial<WerewolfPlayView> & { me: WerewolfPlayView['me'] }): WerewolfPlayView {
  return {
    phase: 'night',
    day: 1,
    currentSpeakerId: null,
    lastWordsPlayerId: null,
    runoffCandidates: [],
    lastNightDeaths: [],
    players: [
      { playerId: 'w1', alive: true, seat: 0 },
      { playerId: 'w2', alive: true, seat: 1 },
      { playerId: 's', alive: true, seat: 2 },
      { playerId: 'x', alive: true, seat: 3 },
      { playerId: 'v1', alive: true, seat: 4 },
      { playerId: 'v2', alive: true, seat: 5 },
    ],
    config: { wolfKillScope: 'non_wolf' },
    ...overrides,
  };
}

function decide(current: WerewolfPlayView, playerId: string, seed = 'play') {
  return pickWerewolfPlayAction({
    view: current,
    playerId,
    random: createSeededRandom(seed),
  });
}

test('预言家不重复查已有记录', () => {
  const current = view({
    me: {
      role: 'seer',
      alive: true,
      forfeited: false,
      seerCheckedThisNight: false,
      seerResults: [{ playerId: 'v1', team: 'village' }],
    },
  });
  const action = decide(current, 's', 'seer-fresh');
  assert.deepEqual(action?.type, 'seer_check');
  assert.notEqual(action && 'targetPlayerId' in action ? action.targetPlayerId : null, 'v1');
});

test('女巫首夜优先救人，自刀可自救时也救', () => {
  const firstNight = view({
    day: 1,
    me: {
      role: 'witch',
      alive: true,
      forfeited: false,
      nightVictimId: 'v2',
      witchSaveUsed: false,
      witchSaveDecision: null,
      witchPoisonDecided: false,
      witchCanSelfSave: true,
    },
  });
  assert.deepEqual(decide(firstNight, 'x'), { type: 'witch_save', save: true });

  const selfHit = view({
    day: 2,
    me: {
      role: 'witch',
      alive: true,
      forfeited: false,
      nightVictimId: 'x',
      witchSaveUsed: false,
      witchSaveDecision: null,
      witchPoisonDecided: false,
      witchCanSelfSave: true,
    },
  });
  assert.deepEqual(decide(selfHit, 'x'), { type: 'witch_save', save: true });
});

test('狼人不刀同伴，白天投票也避开队友', () => {
  const night = view({
    config: { wolfKillScope: 'any' },
    me: {
      role: 'wolf',
      alive: true,
      forfeited: false,
      hasNightVoted: false,
      wolfTeammateIds: ['w2'],
    },
  });
  const kill = decide(night, 'w1', 'wolf-night');
  assert.equal(kill?.type, 'night_kill');
  assert.ok(kill && 'targetPlayerId' in kill);
  assert.notEqual(kill.targetPlayerId, 'w1');
  assert.notEqual(kill.targetPlayerId, 'w2');

  const voting = view({
    phase: 'voting',
    me: {
      role: 'wolf',
      alive: true,
      forfeited: false,
      hasVoted: false,
      wolfTeammateIds: ['w2'],
    },
  });
  const vote = decide(voting, 'w1', 'wolf-vote');
  assert.equal(vote?.type, 'day_vote');
  assert.ok(vote && 'targetPlayerId' in vote);
  assert.notEqual(vote.targetPlayerId, 'w2');
});

test('预言家白天优先投自己验到的狼', () => {
  const voting = view({
    phase: 'voting',
    me: {
      role: 'seer',
      alive: true,
      forfeited: false,
      hasVoted: false,
      seerResults: [{ playerId: 'w2', team: 'wolves' }],
    },
  });
  assert.deepEqual(decide(voting, 's'), { type: 'day_vote', targetPlayerId: 'w2' });
});

test('套话和 prompt 覆盖不泄露他人私密身份', () => {
  const discussion = view({
    phase: 'discussion',
    currentSpeakerId: 'v1',
    lastNightDeaths: ['v2'],
    me: { role: 'villager', alive: true, forfeited: false },
  });
  const line = cannedWerewolfSpeech(discussion, 'v1');
  assert.match(line, /6 号|先听/);
  assert.doesNotMatch(line, /我是狼人|预言家/);

  const prompt = overlayWerewolfBotPrompt(
    {
      view: discussion,
      playerId: 'v1',
      random: createSeededRandom('prompt'),
      recentChat: [{ fromPlayerId: 's', text: '3 号先听身份' }],
    },
    {
      roleBrief: '简报',
      situation: '轮到你发言',
      options: [{ id: 'done', label: '结束发言', action: { type: 'finish_speech' } }],
    },
  );
  assert.ok(prompt?.speech);
  assert.match(prompt.situation, /3 号："3 号先听身份"/);
  assert.doesNotMatch(prompt.situation, /w2 是狼人/);
});
