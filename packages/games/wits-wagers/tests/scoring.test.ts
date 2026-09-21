import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBoard, pickWinningTargets } from '../server/board.ts';
import { settlePlayer, settleRound, computeRankings, winningOddsMap } from '../server/scoring.ts';
import type { TargetId, ChipBet } from '../server/board.ts';

interface GoldenCaseFile {
  settlementCases: Array<{
    id: string;
    note?: string;
    scoreBefore: number;
    /** 获胜目标 → 赔率；同距双胜时两项 */
    winning: Record<string, number>;
    eligibleAuthor: boolean;
    bets: Array<{
      chipId: 'A' | 'B';
      targetId: string | null;
      extraStake: number;
    }>;
    expected: {
      reserved: number;
      availableBefore: number;
      winProfit: number;
      loss: number;
      authorBonus: number;
      scoreAfter: number;
    };
  }>;
  roundCases: Array<{
    id: string;
    note?: string;
    correctAnswer: number;
    players: Array<{
      playerId: string;
      /** null 表示本轮超时未作答，不上版图 */
      guess: number | null;
      scoreBefore: number;
      bets: Array<{
        chipId: 'A' | 'B';
        targetId: string | null;
        extraStake: number;
      }>;
    }>;
    expectedWinners: string[];
    expectedAwardedAuthors: string[];
    expectedScores: Record<string, number>;
    expectedWinningGuessIncrements: Record<string, number>;
  }>;
  rankingCases: Array<{
    id: string;
    players: Array<{
      playerId: string;
      score: number;
      winningGuesses: number;
    }>;
    expectedOrder: string[];
    expectedRanks: number[];
    expectedWinners: string[];
  }>;
  fullGameCases: Array<{
    id: string;
    players: string[];
    correctAnswer: number;
    expectedScoreAfterEachRound: number[];
    expectedWinningGuesses: number;
  }>;
}

const goldenUrl = new URL('./golden-cases.json', import.meta.url);
const golden = JSON.parse(readFileSync(goldenUrl, 'utf8')) as GoldenCaseFile;

const toWinningMap = (winning: Record<string, number>) =>
  new Map<TargetId, number>(Object.entries(winning) as Array<[TargetId, number]>);

test('scoring: golden settlementCases', () => {
  for (const tc of golden.settlementCases) {
    const result = settlePlayer({
      scoreBefore: tc.scoreBefore,
      winning: toWinningMap(tc.winning),
      eligibleAuthor: tc.eligibleAuthor,
      bets: tc.bets as [ChipBet, ChipBet],
    });

    assert.equal(result.reserved, tc.expected.reserved, `${tc.id}: reserved 不匹配`);
    assert.equal(result.availableBefore, tc.expected.availableBefore, `${tc.id}: availableBefore 不匹配`);
    assert.equal(result.winProfit, tc.expected.winProfit, `${tc.id}: winProfit 不匹配`);
    assert.equal(result.loss, tc.expected.loss, `${tc.id}: loss 不匹配`);
    assert.equal(result.authorBonus, tc.expected.authorBonus, `${tc.id}: authorBonus 不匹配`);
    assert.equal(result.scoreAfter, tc.expected.scoreAfter, `${tc.id}: scoreAfter 不匹配`);
  }
});

test('scoring: 同一槽位放两枚筹码，基础值各自生效（不被去重为1）', () => {
  // scoreBefore=0, A and B both placed on winning target g:100 (odds=2), extraStake=0 each
  // winProfit should be (1+0)*2 + (1+0)*2 = 4
  const result = settlePlayer({
    scoreBefore: 0,
    winning: new Map<TargetId, number>([['g:100', 2]]),
    eligibleAuthor: false,
    bets: [
      { chipId: 'A', targetId: 'g:100', extraStake: 0 },
      { chipId: 'B', targetId: 'g:100', extraStake: 0 },
    ],
  });
  assert.equal(result.winProfit, 4);
  assert.equal(result.scoreAfter, 4);
});

test('scoring: 未放置筹码 (targetId null) 必须 extraStake=0，不计收益与损失', () => {
  const result = settlePlayer({
    scoreBefore: 10,
    winning: new Map<TargetId, number>([['g:100', 3]]),
    eligibleAuthor: false,
    bets: [
      { chipId: 'A', targetId: null, extraStake: 0 },
      { chipId: 'B', targetId: null, extraStake: 0 },
    ],
  });
  assert.equal(result.reserved, 0);
  assert.equal(result.winProfit, 0);
  assert.equal(result.loss, 0);
  assert.equal(result.scoreAfter, 10);
});

test('scoring: 同距双胜时两个槽各按自己的赔率赔付', () => {
  const board = buildBoard([10, 20]);
  const winners = pickWinningTargets(board, 15);
  assert.deepEqual(winners, ['g:10', 'g:20']);

  const winning = winningOddsMap(board, winners);
  // 两个不同值 → 都在 3 倍位
  assert.equal(winning.get('g:10'), 3);
  assert.equal(winning.get('g:20'), 3);

  const result = settlePlayer({
    scoreBefore: 2,
    winning,
    eligibleAuthor: false,
    bets: [
      { chipId: 'A', targetId: 'g:10', extraStake: 1 },
      { chipId: 'B', targetId: 'g:20', extraStake: 1 },
    ],
  });
  // (1+1)*3 + (1+1)*3 = 12，无损失
  assert.equal(result.winProfit, 12);
  assert.equal(result.loss, 0);
  assert.equal(result.scoreAfter, 14);
});

test('scoring: 边缘槽获胜时无作者奖励', () => {
  const board = buildBoard([100, 200]);
  const winners = pickWinningTargets(board, 5);
  assert.deepEqual(winners, ['lower']);

  const settled = settleRound({
    board,
    winningTargetIds: winners,
    players: [
      {
        playerId: 'p1',
        scoreBefore: 0,
        bets: [
          { chipId: 'A', targetId: 'lower', extraStake: 0 },
          { chipId: 'B', targetId: null, extraStake: 0 },
        ],
      },
      {
        playerId: 'p2',
        scoreBefore: 0,
        bets: [
          { chipId: 'A', targetId: 'g:100', extraStake: 0 },
          { chipId: 'B', targetId: null, extraStake: 0 },
        ],
      },
    ],
  });

  assert.deepEqual(settled.awardedAuthors, [], '边缘槽获胜不产生作者奖');
  const p1 = settled.ledger.find(l => l.playerId === 'p1')!;
  assert.equal(p1.winProfit, 6, 'lower 槽赔率恒为 6');
  assert.equal(p1.authorBonus, 0);
  const p2 = settled.ledger.find(l => l.playerId === 'p2')!;
  assert.equal(p2.winProfit, 0);
  assert.equal(p2.winningGuessIncrement, 0);
});

test('scoring: golden roundCases', () => {
  for (const tc of golden.roundCases) {
    // 超时未作答者（guess 为 null）不上版图
    const answered = tc.players.filter(
      (p): p is typeof p & { guess: number } => p.guess !== null,
    );
    const board = buildBoard(
      answered.map(p => ({ playerId: p.playerId, value: p.guess })),
    );

    const winningTargetIds = pickWinningTargets(board, tc.correctAnswer);
    assert.deepEqual(
      winningTargetIds,
      tc.expectedWinners,
      `${tc.id}: 胜出目标不匹配${tc.note ? `（${tc.note}）` : ''}`,
    );

    const roundResult = settleRound({
      board,
      winningTargetIds,
      players: tc.players.map(p => ({
        playerId: p.playerId,
        scoreBefore: p.scoreBefore,
        bets: p.bets as [ChipBet, ChipBet],
        // 未作答者不传 guess，由版图作者名单判定（他不在任何槽位上）
        ...(p.guess === null ? {} : { guess: { value: p.guess } }),
      })),
    });

    assert.deepEqual(
      roundResult.awardedAuthors.slice().sort(),
      tc.expectedAwardedAuthors.slice().sort(),
      `${tc.id}: 获胜作者不匹配`,
    );

    const scoreMap: Record<string, number> = {};
    const winGuessMap: Record<string, number> = {};
    for (const l of roundResult.ledger) {
      scoreMap[l.playerId] = l.scoreAfter;
      winGuessMap[l.playerId] = l.winningGuessIncrement;
    }

    assert.deepEqual(scoreMap, tc.expectedScores, `${tc.id}: 玩家最终得分不匹配`);
    assert.deepEqual(
      winGuessMap,
      tc.expectedWinningGuessIncrements,
      `${tc.id}: 答对次数增量不匹配`,
    );
  }
});

test('scoring: golden rankingCases (K01-K03)', () => {
  for (const tc of golden.rankingCases) {
    const rankings = computeRankings(tc.players);

    assert.deepEqual(
      rankings.map(r => r.playerId),
      tc.expectedOrder,
      `${tc.id}: 排名顺序不匹配`,
    );
    assert.deepEqual(
      rankings.map(r => r.rank),
      tc.expectedRanks,
      `${tc.id}: 名次不匹配`,
    );

    const winners = rankings.filter(r => r.rank === 1).map(r => r.playerId);
    assert.deepEqual(
      winners,
      tc.expectedWinners,
      `${tc.id}: 获胜者不匹配`,
    );
  }
});

test('scoring: fullGameCase F01 (七轮推演)', () => {
  const f01 = golden.fullGameCases[0];
  assert.ok(f01);

  const currentScores: Record<string, number> = { p1: 0, p2: 0, p3: 0 };
  const winningGuesses: Record<string, number> = { p1: 0, p2: 0, p3: 0 };

  for (let r = 0; r < 7; r++) {
    const board = buildBoard([
      { playerId: 'p1', value: 100 },
      { playerId: 'p2', value: 100 },
      { playerId: 'p3', value: 100 },
    ]);
    const winners = pickWinningTargets(board, f01.correctAnswer);

    // 每轮每个玩家：A 押满全额可用余额，B 押 0，都在 g:100
    const players = f01.players.map(pid => ({
      playerId: pid,
      scoreBefore: currentScores[pid] ?? 0,
      bets: [
        { chipId: 'A' as const, targetId: 'g:100' as const, extraStake: currentScores[pid] ?? 0 },
        { chipId: 'B' as const, targetId: 'g:100' as const, extraStake: 0 },
      ] as [ChipBet, ChipBet],
      guess: { value: 100 },
    }));

    const settled = settleRound({ board, winningTargetIds: winners, players });

    for (const l of settled.ledger) {
      currentScores[l.playerId] = l.scoreAfter;
      winningGuesses[l.playerId] = (winningGuesses[l.playerId] ?? 0) + l.winningGuessIncrement;
      assert.equal(l.scoreAfter, f01.expectedScoreAfterEachRound[r]);
    }
  }

  for (const pid of f01.players) {
    assert.equal(winningGuesses[pid], f01.expectedWinningGuesses);
  }
});
