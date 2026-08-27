/**
 * 谁是卧底 LLM 决策材料：发言阶段必须带上公屏上下文与 speech 请求，
 * 否则 AI 玩家结束发言时只会回落平台套话（"先听大家发言。"）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { buildUndercoverBotPrompt } from '../server/botPrompt.ts';
import type { UndercoverPlayerView } from '../server/views.ts';
import type { BotDecisionInput } from '@ldj/shared';

function fakeInput(
  view: UndercoverPlayerView,
  recentChat: BotDecisionInput<UndercoverPlayerView>['recentChat'],
): BotDecisionInput<UndercoverPlayerView> {
  return { view, playerId: 'p3', random: createSeededRandom('test'), recentChat };
}

function baseView(phase: UndercoverPlayerView['phase']): UndercoverPlayerView {
  return {
    phase,
    round: 1,
    players: [
      { playerId: 'p1', seat: 0, alive: true, exitReason: null, revealedRole: null },
      { playerId: 'p2', seat: 1, alive: true, exitReason: null, revealedRole: null },
      { playerId: 'p3', seat: 2, alive: true, exitReason: null, revealedRole: null },
    ],
    speakingOrder: ['p1', 'p2', 'p3'],
    currentSpeakerId: phase === 'speaking' ? 'p3' : null,
    deadlineAt: null,
    votesSubmitted: 0,
    votesExpected: 3,
    runoffCandidates: [],
    confirmedPlayerIds: ['p1', 'p2', 'p3'],
    lastVoteSummary: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: {
      playerId: 'p3',
      word: '苹果',
      role: null,
      alive: true,
      confirmed: true,
      hasVoted: false,
      myVote: null,
    },
  };
}

test('发言阶段声明 speech 请求，让模型写真正的描述词发言', () => {
  const prompt = buildUndercoverBotPrompt(fakeInput(baseView('speaking'), []));
  assert.ok(prompt);
  assert.ok(prompt.options.some((option) => option.id === 'done'));
  assert.ok(prompt.speech, '发言阶段必须请求模型写公屏发言');
  assert.equal(prompt.speech.maxChars, 120);
  assert.match(prompt.speech.instruction, /不要直接说出你的词/);
});

test('发言阶段把大家已说的内容带进局势描述', () => {
  const chat = [
    { fromPlayerId: 'p1', text: '这个东西我每天早上都会吃。' },
    { fromPlayerId: 'p2', text: '它一般是红色的。' },
  ];
  const prompt = buildUndercoverBotPrompt(fakeInput(baseView('speaking'), chat));
  assert.ok(prompt);
  assert.match(prompt.situation, /目前大家的发言：/);
  assert.match(prompt.situation, /1 号玩家：这个东西我每天早上都会吃。/);
  assert.match(prompt.situation, /2 号玩家：它一般是红色的。/);
});

test('没有发言时不附加空段落', () => {
  const prompt = buildUndercoverBotPrompt(fakeInput(baseView('speaking'), []));
  assert.ok(prompt);
  assert.doesNotMatch(prompt.situation, /目前大家的发言/);
});

test('投票阶段同样参考大家的发言来推理', () => {
  const chat = [{ fromPlayerId: 'p1', text: '我觉得 2 号说的跟我不太一样。' }];
  const prompt = buildUndercoverBotPrompt(fakeInput(baseView('voting'), chat));
  assert.ok(prompt);
  assert.match(prompt.situation, /结合大家的发言判断谁拿到了不同的词/);
  assert.match(prompt.situation, /我觉得 2 号说的跟我不太一样。/);
});
