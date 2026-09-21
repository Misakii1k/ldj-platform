import type { WitsWagersState } from './types.ts';
import { EDGE_ODDS } from './board.ts';
import { TOTAL_ROUNDS } from './state.ts';

/**
 * 校验一智千金核心状态不变量（02 §8）。
 * 任何状态违反不变量时抛出错误，确保服务端状态不被污染。
 */
export function assertInvariants(state: WitsWagersState): void {
  if (state.schemaVersion !== 1) {
    throw new Error(`Invalid schemaVersion: ${state.schemaVersion}`);
  }
  if (state.rulesetId !== 'wits_wagers_platform_v1') {
    throw new Error(`Invalid rulesetId: ${state.rulesetId}`);
  }

  // 1. 玩家人数与唯一性
  if (!Array.isArray(state.players) || state.players.length < 3 || state.players.length > 7) {
    throw new Error(`Players count must be between 3 and 7, got ${state.players?.length}`);
  }
  const uniquePlayers = new Set(state.players);
  if (uniquePlayers.size !== state.players.length) {
    throw new Error('Players array contains duplicates');
  }

  // 2. 轮次与题库
  if (!Number.isSafeInteger(state.round) || state.round < 0 || state.round > TOTAL_ROUNDS) {
    throw new Error(`Invalid round: ${state.round}`);
  }
  // 题目计划含备用题，长度不固定为 7；只要求够打完正式轮且 id 不重复
  if (!Array.isArray(state.questionPlan) || state.questionPlan.length < TOTAL_ROUNDS) {
    throw new Error(
      `questionPlan must contain at least ${TOTAL_ROUNDS} questions, got ${state.questionPlan?.length}`,
    );
  }
  const questionIds = new Set(state.questionPlan.map((q) => q.id));
  if (questionIds.size !== state.questionPlan.length) {
    throw new Error('questionPlan contains duplicate question IDs');
  }
  if (
    !Number.isSafeInteger(state.questionIndex) ||
    state.questionIndex < 0 ||
    state.questionIndex >= state.questionPlan.length
  ) {
    throw new Error(`Invalid questionIndex: ${state.questionIndex}`);
  }
  // 作废重抽只会让题目下标跑在轮次前面，绝不会落后
  if (state.round > 0 && state.questionIndex < state.round - 1) {
    throw new Error(`questionIndex ${state.questionIndex} is behind round ${state.round}`);
  }
  for (const q of state.questionPlan) {
    if (!q.reviewed) {
      throw new Error(`Question ${q.id} is not reviewed`);
    }
  }

  // 3. 玩家积分与计数
  for (const p of state.players) {
    const score = state.scores[p];
    if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) {
      throw new Error(`Invalid score for player ${p}: ${score}`);
    }
    const winGuesses = state.winningGuesses[p];
    if (typeof winGuesses !== 'number' || !Number.isSafeInteger(winGuesses) || winGuesses < 0) {
      throw new Error(`Invalid winningGuesses for player ${p}: ${winGuesses}`);
    }
    const gRev = state.guessRevisions[p];
    if (typeof gRev !== 'number' || !Number.isSafeInteger(gRev) || gRev < 0) {
      throw new Error(`Invalid guessRevision for player ${p}: ${gRev}`);
    }
    const bRev = state.betRevisions[p];
    if (typeof bRev !== 'number' || !Number.isSafeInteger(bRev) || bRev < 0) {
      throw new Error(`Invalid betRevision for player ${p}: ${bRev}`);
    }
  }

  // 4. 阶段与特定约束
  if (!Number.isSafeInteger(state.phaseEpoch) || state.phaseEpoch < 0) {
    throw new Error(`Invalid phaseEpoch: ${state.phaseEpoch}`);
  }

  if (state.phase === 'created') {
    if (state.round !== 0) {
      throw new Error(`round in created phase must be 0, got ${state.round}`);
    }
    if (state.roundToken !== '') {
      throw new Error(`roundToken in created phase must be empty, got ${state.roundToken}`);
    }
    if (state.deadlineAt !== null) {
      throw new Error(`deadlineAt in created phase must be null, got ${state.deadlineAt}`);
    }
    if (state.board.length !== 0) {
      throw new Error('board in created phase must be empty');
    }
    if (state.history.length !== 0) {
      throw new Error('history in created phase must be empty');
    }
    if (state.result !== null) {
      throw new Error('result in created phase must be null');
    }
  }

  if (state.phase === 'game_over') {
    if (state.round !== 7) {
      throw new Error(`round in game_over must be 7, got ${state.round}`);
    }
    if (state.deadlineAt !== null) {
      throw new Error(`deadlineAt in game_over must be null, got ${state.deadlineAt}`);
    }
    if (state.result === null) {
      throw new Error('result in game_over must not be null');
    }
    if (state.result.roundsPlayed !== 7) {
      throw new Error(`result.roundsPlayed must be 7, got ${state.result.roundsPlayed}`);
    }
    if (state.history.length !== 7) {
      throw new Error(`history in game_over must have 7 rounds, got ${state.history.length}`);
    }
  }

  // 5. 下注期筹码总额不变量
  if (state.phase === 'betting') {
    for (const p of state.players) {
      if (state.forfeitedIds.includes(p)) continue;
      const betPair = state.bets[p];
      if (betPair) {
        const extraA = betPair[0].targetId !== null ? betPair[0].extraStake : 0;
        const extraB = betPair[1].targetId !== null ? betPair[1].extraStake : 0;
        const reserved = extraA + extraB;
        const score = state.scores[p] ?? 0;
        if (reserved > score) {
          throw new Error(`Player ${p} reserved (${reserved}) exceeds score (${score}) during betting`);
        }
      }
    }
  }

  // 6. 版图不变量（当 board 非空时）
  if (state.board.length > 0) {
    for (const [id, slot] of [['lower', 'LOWER'], ['higher', 'HIGHER']] as const) {
      const edge = state.board.find((t) => t.id === id);
      if (!edge) {
        throw new Error(`board must contain a ${id} target`);
      }
      if (edge.slot !== slot || edge.odds !== EDGE_ODDS || edge.value !== null) {
        throw new Error(`${id} target has invalid slot, odds, or value`);
      }
    }
  }

  if (state.history.length > TOTAL_ROUNDS) {
    throw new Error(`history length cannot exceed ${TOTAL_ROUNDS}, got ${state.history.length}`);
  }
}
