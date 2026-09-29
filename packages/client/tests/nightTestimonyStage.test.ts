/**
 * 谁是狱警（档案室版）纯函数单测：
 * - deriveStageEvents：差分 → 事件（docketPinned 带完整记录、guessesRevealed 边沿）
 * - buildAnswerCells：隐私红线——全员答完前渲染模型里没有 yes/no
 * - buildGuessBoard：已自告预贴锁定、提交前不出现真罪行、核对进度逐袋落章
 * - publicWardenId：票出 / 自曝 / 终局三种公开路径
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStageEvents,
  stageEventKey,
} from '../src/game/night-testimony/stage/deriveStageEvents.ts';
import {
  buildAnswerCells,
  buildGuessBoard,
} from '../src/game/night-testimony/stage/ArchiveProps.tsx';
import { publicWardenId } from '../src/game/night-testimony/stage/ArchiveFiles.tsx';
import type { NightTestimonyPlayerView, QuestionRecord } from '../src/game/night-testimony/types.ts';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'];

function baseView(overrides: Partial<NightTestimonyPlayerView> = {}): NightTestimonyPlayerView {
  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: 'question',
    players: [...PLAYERS],
    currentQuestionerId: 'p1',
    questionIndex: 1,
    questionLimit: 5,
    maxYesPerPlayer: 3,
    history: [],
    playerYesCounts: Object.fromEntries(PLAYERS.map((id) => [id, 0])),
    currentQuestion: null,
    revealedIdentities: {},
    extraCrime: null,
    availableGuessCrimes: null,
    votedPlayerIds: [],
    accusedId: null,
    wardenRevealed: null,
    guessingInProgress: false,
    winners: [],
    deadlineAt: null,
    reveal: null,
    me: {
      playerId: 'p1',
      isWarden: false,
      crime: 'office_theft',
      myYesCount: 0,
      hasAnsweredCurrent: false,
      hasVoted: false,
      pendingCardChoices: null,
    },
    ...overrides,
  };
}

function recordOf(questionIndex: number, answers: Record<string, 'yes' | 'no'>): QuestionRecord {
  return { questionIndex, questionerId: 'p1', cardId: `c${questionIndex}`, question: `第 ${questionIndex} 问？`, answers };
}

/* ── deriveStageEvents ───────────────────────────────────── */

test('docketPinned：history 增长时带着完整归档记录（翻开演出要用 answers）', () => {
  const prev = baseView();
  const record = recordOf(1, { p1: 'yes', p2: 'no', p3: 'yes', p4: 'no', p5: 'no' });
  const next = baseView({ history: [record] });
  const events = deriveStageEvents(prev, next);
  const pinned = events.filter((e) => e.kind === 'docketPinned');
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0]!.kind === 'docketPinned' && pinned[0]!.yesCount, 2);
  assert.equal(pinned[0]!.kind === 'docketPinned' && pinned[0]!.record.answers.p1, 'yes');
  assert.equal(stageEventKey(pinned[0]!), 'docket:1');
});

test('voteResolved：accusedId 从无到有，投票者名单取 next 快照', () => {
  const prev = baseView({ phase: 'vote' });
  const next = baseView({ phase: 'game_over', accusedId: 'p3', wardenRevealed: false, votedPlayerIds: ['p1', 'p2'] });
  const events = deriveStageEvents(prev, next);
  const resolved = events.find((e) => e.kind === 'voteResolved');
  assert.ok(resolved && resolved.kind === 'voteResolved');
  assert.deepEqual([...resolved.voterIds], ['p1', 'p2']);
  // 同一批差分里也要有终局事件
  assert.ok(events.some((e) => e.kind === 'gameOver'));
});

test('guessesRevealed：wardenGuesses 由 null 变为有值时触发一次', () => {
  const base = {
    phase: 'game_over' as const,
    guessingInProgress: true,
    accusedId: 'p2',
    wardenRevealed: true,
    reveal: {
      wardenId: 'p2',
      crimes: { p1: 'arson' as const },
      history: [],
      extraCrime: null,
      accusedId: 'p2',
      wardenRevealed: true,
      wardenGuesses: null,
      crimesAllGuessed: false,
    },
  };
  const prev = baseView(base);
  const next = baseView({
    ...base,
    guessingInProgress: false,
    reveal: { ...base.reveal, wardenGuesses: { p1: 'arson' as const }, crimesAllGuessed: true },
  });
  const events = deriveStageEvents(prev, next);
  assert.equal(events.filter((e) => e.kind === 'guessesRevealed').length, 1);
  // 再推一帧同样的状态：不重复触发
  const again = deriveStageEvents(next, baseView({ ...base, guessingInProgress: false, reveal: { ...base.reveal, wardenGuesses: { p1: 'arson' as const }, crimesAllGuessed: true } }));
  assert.equal(again.filter((e) => e.kind === 'guessesRevealed').length, 0);
});

/* ── buildAnswerCells：隐私红线 ──────────────────────────── */

test('buildAnswerCells：全员答完前只输出 stamped/empty，绝不输出 yes/no', () => {
  // 服务端视角此刻已经带着别人的答案（隐私缺陷），渲染模型也不许读
  const view = baseView({
    currentQuestion: {
      questionIndex: 1,
      questionerId: 'p1',
      cardId: 'c1',
      text: '作案是否在深夜？',
      answers: { p1: 'yes', p2: 'no' },
    },
  });
  const cells = buildAnswerCells(view, null);
  assert.deepEqual(
    cells.map((c) => c.state),
    ['stamped', 'stamped', 'empty', 'empty', 'empty'],
  );
  // 模型里不存在任何答案值
  assert.ok(!cells.some((c) => c.state === 'yes' || c.state === 'no'));
});

test('buildAnswerCells：归档记录传入后（答案已公开）输出 yes/no', () => {
  const view = baseView();
  const record = recordOf(1, { p1: 'yes', p2: 'no', p3: 'yes', p4: 'no', p5: 'yes' });
  const cells = buildAnswerCells(view, record);
  assert.deepEqual(
    cells.map((c) => c.state),
    ['yes', 'no', 'yes', 'no', 'yes'],
  );
});

/* ── buildGuessBoard ─────────────────────────────────────── */

function guessingView(overrides: Partial<NightTestimonyPlayerView> = {}): NightTestimonyPlayerView {
  return baseView({
    phase: 'game_over',
    guessingInProgress: true,
    accusedId: 'p4',
    wardenRevealed: true,
    availableGuessCrimes: ['arson', 'dine_and_dash', 'hacker', 'noise_nuisance', 'office_theft'],
    // 已自告的囚犯：罪行是公开信息，预贴锁定
    revealedIdentities: { p5: 'hacker' },
    // 服务端隐私缺陷：猜罪期间 reveal 已经带着 crimes —— 模型不许读它
    reveal: {
      wardenId: 'p4',
      crimes: { p1: 'arson', p2: 'dine_and_dash', p3: 'noise_nuisance', p5: 'hacker' },
      history: [],
      extraCrime: 'office_theft',
      accusedId: 'p4',
      wardenRevealed: true,
      wardenGuesses: null,
      crimesAllGuessed: false,
    },
    ...overrides,
  });
}

test('buildGuessBoard：已自告预贴锁定；猜罪期间不出现任何真罪行', () => {
  const view = guessingView();
  const board = buildGuessBoard(view, 'p4', {}, null, true);
  assert.equal(board.inmateCount, 4);
  // 已自告：locked + 公开罪行
  assert.equal(board.slots.p5!.state, 'locked');
  assert.equal(board.slots.p5!.text, '黑客入侵');
  assert.equal(board.filledCount, 1);
  // 其余：空位、无章、无真罪行
  for (const id of ['p1', 'p2', 'p3']) {
    assert.equal(board.slots[id]!.state, 'empty');
    assert.equal(board.slots[id]!.mark, null);
    assert.equal(board.slots[id]!.truth, null);
  }
  // 狱警自己没有标签位
  assert.equal(board.slots.p4, undefined);
  // 模型 JSON 里不出现任何真罪行名（p1 的真实罪行是「恶意纵火」）
  const json = JSON.stringify(board.slots);
  assert.ok(!json.includes('恶意纵火'));
  assert.ok(!json.includes('吃霸王餐'));
  assert.ok(!json.includes('深夜扰民'));
});

test('buildGuessBoard：本地贴标签进 used；囚犯视角空位写「待贴」', () => {
  const view = guessingView();
  const board = buildGuessBoard(view, 'p4', { p1: 'arson' }, null, true);
  assert.equal(board.slots.p1!.state, 'filled');
  assert.ok(board.used.has('arson'));
  assert.equal(board.filledCount, 2);

  const inmateBoard = buildGuessBoard(view, 'p4', {}, null, false);
  assert.equal(inmateBoard.slots.p1!.text, '待贴');
});

test('buildGuessBoard：提交后按 checkProgress 逐袋落章，错的上真罪行', () => {
  const view = guessingView({
    guessingInProgress: false,
    reveal: {
      wardenId: 'p4',
      crimes: { p1: 'arson', p2: 'dine_and_dash', p3: 'noise_nuisance', p5: 'hacker' },
      history: [],
      extraCrime: 'office_theft',
      accusedId: 'p4',
      wardenRevealed: true,
      // p1 对、p2 错（猜成 hacker 但 hacker 是 p5 的）、p3 对、p5 已自告锁定
      wardenGuesses: { p1: 'arson', p2: 'hacker', p3: 'noise_nuisance', p5: 'hacker' },
      crimesAllGuessed: false,
    },
  });
  // 只核对了前 1 只
  const mid = buildGuessBoard(view, 'p4', {}, 1, true);
  assert.equal(mid.slots.p1!.mark, 'ok');
  assert.equal(mid.slots.p2!.mark, null);
  assert.equal(mid.slots.p2!.truth, null);
  // 全部核对完（null = 一次全显）
  const done = buildGuessBoard(view, 'p4', {}, null, true);
  assert.equal(done.slots.p2!.mark, 'bad');
  assert.equal(done.slots.p2!.truth, '吃霸王餐');
  assert.equal(done.slots.p3!.mark, 'ok');
});

/* ── publicWardenId ──────────────────────────────────────── */

test('publicWardenId：票出 / 自曝 / 终局三条路径', () => {
  // 票出
  assert.equal(publicWardenId(baseView({ wardenRevealed: true, accusedId: 'p2' })), 'p2');
  // 自曝
  assert.equal(publicWardenId(baseView({ revealedIdentities: { p3: 'warden' } })), 'p3');
  // 终局（不在猜罪）读 reveal
  const over = guessingView({ guessingInProgress: false });
  assert.equal(publicWardenId(over), 'p4');
  // 问答进行中：不公开
  assert.equal(publicWardenId(baseView()), null);
});
