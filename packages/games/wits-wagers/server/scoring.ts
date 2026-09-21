import { isEdgeTarget, type TargetId, type BoardTarget, type ChipBet, type BetPair, type GuessOrigin } from './board.ts';

export interface PlayerRoundSettlementInput {
  playerId: string;
  scoreBefore: number;
  bets: readonly ChipBet[] | BetPair;
  guess?: { value: number; origin?: GuessOrigin } | number;
  origin?: GuessOrigin;
}

export interface PlayerRoundLedger {
  playerId: string;
  scoreBefore: number;
  reserved: number;
  availableBefore: number;
  winProfit: number;
  loss: number;
  authorBonus: number;
  scoreAfter: number;
  winningGuessIncrement: number;
}

export interface SettlePlayerParams {
  scoreBefore: number;
  /** 获胜目标 → 该目标的净赢赔率；等距双胜时有两项，边缘槽获胜时为一项 */
  winning: ReadonlyMap<TargetId, number>;
  eligibleAuthor: boolean;
  bets: readonly ChipBet[];
  playerId?: string;
}

/**
 * 单个玩家的账本结算。
 * 遵循 01 §4 唯一算法：
 * reserved = sum(extraStake)
 * availableBefore = scoreBefore - reserved
 * winProfit = sum((1 + extraStake) * odds(target) for each winning placed chip)
 * loss = sum(extraStake for each losing placed chip)
 * authorBonus = 3 if eligibleAuthor else 0（eligibleAuthor 已排除边缘槽获胜的情况）
 * scoreAfter = scoreBefore + winProfit - loss + authorBonus
 */
export function settlePlayer(params: SettlePlayerParams): PlayerRoundLedger {
  const { scoreBefore, winning, eligibleAuthor, bets, playerId = '' } = params;

  let reserved = 0;
  let winProfit = 0;
  let loss = 0;

  for (const bet of bets) {
    if (bet.targetId === null) {
      // 未放置筹码，无收益无损失，不计入 reserved（未放置筹码 extraStake 应为 0）
      continue;
    }
    const extra = bet.extraStake;
    reserved += extra;

    const odds = winning.get(bet.targetId);
    if (odds !== undefined) {
      // 获胜筹码：返还本金并按倍率获得净收益
      winProfit += (1 + extra) * odds;
    } else {
      // 失败筹码：永久筹码不扣分，仅损失附加积分
      loss += extra;
    }
  }

  const availableBefore = scoreBefore - reserved;
  const authorBonus = eligibleAuthor ? 3 : 0;
  const scoreAfter = scoreBefore + winProfit - loss + authorBonus;
  const winningGuessIncrement = eligibleAuthor ? 1 : 0;

  return {
    playerId,
    scoreBefore,
    reserved,
    availableBefore,
    winProfit,
    loss,
    authorBonus,
    scoreAfter,
    winningGuessIncrement,
  };
}

export interface SettleRoundParams {
  board: readonly BoardTarget[];
  winningTargetIds: readonly TargetId[];
  players: readonly PlayerRoundSettlementInput[];
}

export interface SettleRoundResult {
  winningTargetIds: TargetId[];
  awardedAuthors: string[];
  ledger: PlayerRoundLedger[];
}

/** 把获胜目标列表展开成 目标 → 赔率 的映射；不在版图上的 id 按边缘槽 6 兜底。 */
export function winningOddsMap(
  board: readonly BoardTarget[],
  winningTargetIds: readonly TargetId[],
): Map<TargetId, number> {
  const map = new Map<TargetId, number>();
  for (const id of winningTargetIds) {
    const target = board.find((t) => t.id === id);
    map.set(id, target ? target.odds : 6);
  }
  return map;
}

/**
 * 整轮结算。
 * 按照 01 §2 R10（2026-09-22 修订）：
 * 每个获胜数值槽的作者各 +3；等距双胜时两侧作者都得奖；边缘槽获胜无作者奖励。
 * 超时未答者本轮不在版图上，自然不可能成为作者。
 */
export function settleRound(params: SettleRoundParams): SettleRoundResult {
  const { board, winningTargetIds, players } = params;

  const winning = winningOddsMap(board, winningTargetIds);

  const awardedAuthors: string[] = [];
  for (const id of winningTargetIds) {
    if (isEdgeTarget(id)) continue;
    const target = board.find((t) => t.id === id);
    if (!target) continue;
    for (const p of players) {
      let isWinningGuess = false;
      if (typeof p.guess === 'number') {
        isWinningGuess = p.guess === target.value;
      } else if (p.guess && typeof p.guess === 'object') {
        isWinningGuess = p.guess.value === target.value;
      } else {
        isWinningGuess = target.authors.includes(p.playerId);
      }
      if (isWinningGuess && !awardedAuthors.includes(p.playerId)) {
        awardedAuthors.push(p.playerId);
      }
    }
  }

  const ledger: PlayerRoundLedger[] = players.map(p => {
    const eligibleAuthor = awardedAuthors.includes(p.playerId);
    return settlePlayer({
      playerId: p.playerId,
      scoreBefore: p.scoreBefore,
      winning,
      eligibleAuthor,
      bets: p.bets,
    });
  });

  return {
    winningTargetIds: [...winningTargetIds],
    awardedAuthors,
    ledger,
  };
}

export interface PlayerScoreSummary {
  playerId: string;
  score: number;
  winningGuesses: number;
}

export interface PlayerRanking extends PlayerScoreSummary {
  rank: number;
}

/**
 * 计算对局终局排名与胜者。
 * 按照 01 §2 R12 与 G0 P4：
 * 1. 优先按总积分 score 降序；
 * 2. 同分按答对获胜答案次数 winningGuesses 降序；
 * 3. 仍同分则并列获胜，展示顺序按原始席位稳定排序。
 * 名次采用标准比赛名次（如 1, 1, 3）。
 */
export function computeRankings(
  players: readonly PlayerScoreSummary[],
): PlayerRanking[] {
  const indexed = players.map((p, originalIndex) => ({
    ...p,
    originalIndex,
  }));

  indexed.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.winningGuesses !== a.winningGuesses) {
      return b.winningGuesses - a.winningGuesses;
    }
    return a.originalIndex - b.originalIndex;
  });

  const rankings: PlayerRanking[] = [];
  for (let i = 0; i < indexed.length; i++) {
    const curr = indexed[i];
    if (!curr) {
      continue;
    }
    if (i === 0) {
      rankings.push({
        playerId: curr.playerId,
        score: curr.score,
        winningGuesses: curr.winningGuesses,
        rank: 1,
      });
    } else {
      const prev = indexed[i - 1];
      const prevRank = rankings[i - 1]?.rank ?? 1;
      if (prev && curr.score === prev.score && curr.winningGuesses === prev.winningGuesses) {
        rankings.push({
          playerId: curr.playerId,
          score: curr.score,
          winningGuesses: curr.winningGuesses,
          rank: prevRank,
        });
      } else {
        rankings.push({
          playerId: curr.playerId,
          score: curr.score,
          winningGuesses: curr.winningGuesses,
          rank: i + 1,
        });
      }
    }
  }

  return rankings;
}
