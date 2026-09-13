import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cannedUndercoverSpeech } from '../server/bot.ts';
import type { UndercoverPlayerView } from '../server/views.ts';

function mockView(overrides: Partial<UndercoverPlayerView> = {}): UndercoverPlayerView {
  return {
    phase: 'speaking',
    round: 1,
    players: [
      { playerId: 'p1', seat: 0, alive: true, exitReason: null, revealedRole: null },
      { playerId: 'p2', seat: 1, alive: true, exitReason: null, revealedRole: null },
      { playerId: 'p3', seat: 2, alive: true, exitReason: null, revealedRole: null },
      { playerId: 'p4', seat: 3, alive: true, exitReason: null, revealedRole: null },
    ],
    speakingOrder: ['p1', 'p2', 'p3', 'p4'],
    currentSpeakerId: 'p1',
    deadlineAt: null,
    votesSubmitted: 0,
    votesExpected: 4,
    runoffCandidates: [],
    confirmedPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    lastVoteSummary: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: {
      playerId: 'p1',
      word: '白菜',
      role: null,
      alive: true,
      confirmed: true,
      hasVoted: false,
      myVote: null,
    },
    ...overrides,
  };
}

test('cannedUndercoverSpeech: 首位发言者起头自然且非空', () => {
  const view = mockView();
  const line = cannedUndercoverSpeech(view, 'p1');
  assert.ok(typeof line === 'string' && line.length > 5);
  assert.ok(!line.includes('先听大家发言'));
});

test('cannedUndercoverSpeech: 后续发言者与首位发言者语料不同', () => {
  const view = mockView();
  const lineP1 = cannedUndercoverSpeech(view, 'p1');
  const lineP2 = cannedUndercoverSpeech(view, 'p2');
  assert.notEqual(lineP1, lineP2);
});

test('cannedUndercoverSpeech: 后续轮次（第2轮）生成递进语料', () => {
  const view = mockView({ round: 2 });
  const line = cannedUndercoverSpeech(view, 'p1');
  assert.ok(typeof line === 'string' && line.length > 5);
});

test('cannedUndercoverSpeech: 加赛阶段生成为平民辩护的加赛语料', () => {
  const view = mockView({
    phase: 'runoff_voting',
    runoffCandidates: ['p1', 'p2'],
  });
  const line = cannedUndercoverSpeech(view, 'p1');
  assert.ok(line.includes('平民') || line.includes('卧底'));
});
