import type { Actor, GameContext, GameEffect, VersionedReduceResult } from '@ldj/shared';
import { buildBoard, pickWinningTargets } from './board.ts';
import { settleRound, computeRankings } from './scoring.ts';
import { defaultBetPair, generateRoundToken, TOTAL_ROUNDS } from './state.ts';
import { MIN_GUESS, MAX_GUESS } from './schemas.ts';
import type {
  WitsWagersState,
  WitsWagersAction,
  WitsWagersPublicEvent,
  FinalResult,
  RoundResult,
  Guess,
  BetPair,
  BoardTarget,
} from './types.ts';

/**
 * 用本轮真实提交的作答构建版图。
 *
 * 超时未答者不再被补 1：那样会在版图最低位凭空多出一个槽位，既抢走判定，
 * 又让"离答案最近"的真实作答判负（用户实测到的那个问题）。没作答的人本轮
 * 桌上就是没有牌，但仍可正常下注。
 *
 * 返回 null 表示一张牌都没有——调用方需要作废本轮。
 */
function buildBoardFromGuesses(
  players: readonly string[],
  forfeitedIds: readonly string[],
  guesses: Readonly<Record<string, Guess | null>>,
): BoardTarget[] | null {
  const submitted = players
    .filter((pid) => !forfeitedIds.includes(pid))
    .map((pid) => ({ playerId: pid, guess: guesses[pid] }))
    .filter((entry): entry is { playerId: string; guess: Guess } => !!entry.guess);

  if (submitted.length === 0) return null;

  return buildBoard(
    submitted.map((entry) => ({ playerId: entry.playerId, value: entry.guess.value })),
  );
}

/** 每人一份空作答与空下注，用于开局与换轮。 */
function freshRoundRecords(players: readonly string[]) {
  const guesses: Record<string, null> = {};
  const guessRevisions: Record<string, number> = {};
  const bets: Record<string, BetPair> = {};
  const betRevisions: Record<string, number> = {};
  for (const pid of players) {
    guesses[pid] = null;
    guessRevisions[pid] = 0;
    bets[pid] = defaultBetPair();
    betRevisions[pid] = 0;
  }
  return { guesses, guessRevisions, bets, betRevisions };
}

export function reduce(
  ctx: GameContext,
  state: WitsWagersState,
  actor: Actor,
  action: WitsWagersAction,
): VersionedReduceResult<WitsWagersState, WitsWagersPublicEvent, FinalResult> {
  switch (action.type) {
    case 'begin': {
      if (actor.kind !== 'system') {
        return { ok: false, code: 'ACTOR_NOT_ALLOWED', message: '只有系统可发起 begin' };
      }
      if (state.phase !== 'created') {
        return { ok: false, code: 'INVALID_PHASE', message: '游戏只能在 created 阶段开始' };
      }

      const round = 1;
      const phaseEpoch = state.phaseEpoch + 1;
      const roundToken = generateRoundToken(round, ctx.now, ctx.random);
      const deadlineAt = ctx.now + state.config.answerSeconds * 1000;

      const { guesses, guessRevisions, bets, betRevisions } = freshRoundRecords(state.players);

      const currentQuestion = state.questionPlan[0];
      if (!currentQuestion) {
        return { ok: false, code: 'MISSING_QUESTION', message: '题库缺失第 1 题' };
      }

      const timerId = `ww:${roundToken}:${phaseEpoch}`;
      const effects: GameEffect[] = [
        {
          type: 'schedule_timer',
          timerId,
          deadlineAt,
          action: {
            type: 'phase_timeout',
            roundToken,
            phaseEpoch,
            phase: 'answering',
          },
        },
      ];

      const publicEvents: WitsWagersPublicEvent[] = [
        {
          type: 'round_started',
          round,
          question: {
            prompt: currentQuestion.prompt,
            unit: currentQuestion.unit,
          },
        },
      ];

      const nextState: WitsWagersState = {
        ...state,
        phase: 'answering',
        round,
        questionIndex: 0,
        phaseEpoch,
        roundToken,
        deadlineAt,
        guesses,
        guessRevisions,
        bets,
        betRevisions,
        board: [],
      };

      return {
        ok: true,
        nextState,
        publicEvents,
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }

    case 'submit_guess': {
      if (actor.kind !== 'player') {
        return { ok: false, code: 'ACTOR_NOT_ALLOWED', message: '只有参赛玩家可提交猜测' };
      }
      const pid = actor.playerId;
      if (!state.players.includes(pid)) {
        return { ok: false, code: 'NOT_A_PLAYER', message: '非本局参赛玩家' };
      }
      if (state.forfeitedIds.includes(pid)) {
        return { ok: false, code: 'PLAYER_FORFEITED', message: '已退席玩家不能作答' };
      }
      if (state.phase !== 'answering') {
        return { ok: false, code: 'INVALID_PHASE', message: '当前阶段不接受作答' };
      }
      if (state.deadlineAt === null || ctx.now >= state.deadlineAt) {
        return { ok: false, code: 'DEADLINE_PASSED', message: '作答时间已截止' };
      }
      if (action.roundToken !== state.roundToken) {
        return { ok: false, code: 'STALE_ROUND', message: '轮次已更新' };
      }
      if (action.expectedRevision !== (state.guessRevisions[pid] ?? 0)) {
        return { ok: false, code: 'STALE_REVISION', message: '作答版本不匹配' };
      }
      if (!Number.isSafeInteger(action.value) || action.value < MIN_GUESS || action.value > MAX_GUESS) {
        return { ok: false, code: 'INVALID_GUESS', message: '猜测值必须在有效正整数区间内' };
      }

      const nextGuesses: Record<string, Guess | null> = {
        ...state.guesses,
        [pid]: { value: action.value, origin: 'submitted' },
      };
      const nextGuessRevisions: Record<string, number> = {
        ...state.guessRevisions,
        [pid]: (state.guessRevisions[pid] ?? 0) + 1,
      };

      const publicEvents: WitsWagersPublicEvent[] = [
        { type: 'guess_submitted', playerId: pid },
      ];

      // G0 P3: 检查是否全员已提交，若全员已交则可提前翻牌进入 arranging
      const activePlayers = state.players.filter((p) => !state.forfeitedIds.includes(p));
      const allSubmitted = activePlayers.every((p) => nextGuesses[p] !== null);

      if (allSubmitted) {
        // 取消旧 answering 计时器
        const cancelTimerEffect: GameEffect = {
          type: 'cancel_timer',
          timerId: `ww:${state.roundToken}:${state.phaseEpoch}`,
        };

        const arrangingEpoch = state.phaseEpoch + 1;
        const arrangingDeadline = ctx.now + state.config.arrangingSeconds * 1000;

        // 全员已交，必然至少有一张牌
        const board = buildBoardFromGuesses(state.players, state.forfeitedIds, nextGuesses)!;

        const scheduleArrangingEffect: GameEffect = {
          type: 'schedule_timer',
          timerId: `ww:${state.roundToken}:${arrangingEpoch}`,
          deadlineAt: arrangingDeadline,
          action: {
            type: 'phase_timeout',
            roundToken: state.roundToken,
            phaseEpoch: arrangingEpoch,
            phase: 'arranging',
          },
        };

        publicEvents.push({ type: 'board_revealed', board });

        const nextState: WitsWagersState = {
          ...state,
          phase: 'arranging',
          phaseEpoch: arrangingEpoch,
          deadlineAt: arrangingDeadline,
          guesses: nextGuesses,
          guessRevisions: nextGuessRevisions,
          board,
        };

        return {
          ok: true,
          nextState,
          publicEvents,
          privateEvents: [],
          effects: [cancelTimerEffect, scheduleArrangingEffect],
          resultCandidate: null,
        };
      }

      const nextState: WitsWagersState = {
        ...state,
        guesses: nextGuesses,
        guessRevisions: nextGuessRevisions,
      };

      return {
        ok: true,
        nextState,
        publicEvents,
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    case 'set_bets': {
      if (actor.kind !== 'player') {
        return { ok: false, code: 'ACTOR_NOT_ALLOWED', message: '只有参赛玩家可提交下注' };
      }
      const pid = actor.playerId;
      if (!state.players.includes(pid)) {
        return { ok: false, code: 'NOT_A_PLAYER', message: '非本局参赛玩家' };
      }
      if (state.forfeitedIds.includes(pid)) {
        return { ok: false, code: 'PLAYER_FORFEITED', message: '已退席玩家不能下注' };
      }
      if (state.phase !== 'betting') {
        return { ok: false, code: 'INVALID_PHASE', message: '当前阶段不接受下注' };
      }
      if (state.deadlineAt === null || ctx.now >= state.deadlineAt) {
        return { ok: false, code: 'DEADLINE_PASSED', message: '下注时间已截止' };
      }
      if (action.roundToken !== state.roundToken) {
        return { ok: false, code: 'STALE_ROUND', message: '轮次已更新' };
      }
      if (action.expectedRevision !== (state.betRevisions[pid] ?? 0)) {
        return { ok: false, code: 'STALE_REVISION', message: '下注版本不匹配' };
      }

      const [chipA, chipB] = action.chips;
      if (!chipA || !chipB || chipA.chipId !== 'A' || chipB.chipId !== 'B') {
        return { ok: false, code: 'INVALID_BETS', message: '筹码格式必须为 A 后 B 两项' };
      }

      const boardTargetIds = new Set(state.board.map((t) => t.id));
      if (chipA.targetId !== null && !boardTargetIds.has(chipA.targetId)) {
        return { ok: false, code: 'INVALID_TARGET', message: '筹码 A 下注目标不在当前版图上' };
      }
      if (chipB.targetId !== null && !boardTargetIds.has(chipB.targetId)) {
        return { ok: false, code: 'INVALID_TARGET', message: '筹码 B 下注目标不在当前版图上' };
      }

      if (chipA.targetId === null && chipA.extraStake !== 0) {
        return { ok: false, code: 'INVALID_EXTRA_STAKE', message: '未放置筹码 extraStake 必须为 0' };
      }
      if (chipB.targetId === null && chipB.extraStake !== 0) {
        return { ok: false, code: 'INVALID_EXTRA_STAKE', message: '未放置筹码 extraStake 必须为 0' };
      }

      const totalExtraStake = chipA.extraStake + chipB.extraStake;
      const currentScore = state.scores[pid] ?? 0;
      if (totalExtraStake > currentScore) {
        return { ok: false, code: 'INSUFFICIENT_FUNDS', message: '附加下注积分超出当前可用余额' };
      }

      const nextBets: Record<string, BetPair> = {
        ...state.bets,
        [pid]: action.chips,
      };
      const nextBetRevisions: Record<string, number> = {
        ...state.betRevisions,
        [pid]: (state.betRevisions[pid] ?? 0) + 1,
      };

      const publicEvents: WitsWagersPublicEvent[] = [
        { type: 'bets_changed', bets: nextBets },
      ];

      const nextState: WitsWagersState = {
        ...state,
        bets: nextBets,
        betRevisions: nextBetRevisions,
      };

      return {
        ok: true,
        nextState,
        publicEvents,
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    case 'phase_timeout': {
      if (actor.kind !== 'system') {
        return { ok: false, code: 'ACTOR_NOT_ALLOWED', message: '只有系统可处理超时' };
      }
      if (
        action.roundToken !== state.roundToken ||
        action.phaseEpoch !== state.phaseEpoch ||
        action.phase !== state.phase
      ) {
        return { ok: false, code: 'STALE_TIMER', message: '过期的计时器事件' };
      }

      if (state.phase === 'answering') {
        // G0 P1（2026-09-22 修订）：超时不再补 1。
        // 未作答者本轮不上版图；一个人都没作答则本轮作废、换题重打。
        const board = buildBoardFromGuesses(state.players, state.forfeitedIds, state.guesses);

        if (board === null) {
          const nextQuestionIndex = state.questionIndex + 1;
          const backupQuestion = state.questionPlan[nextQuestionIndex];
          const nextEpoch = state.phaseEpoch + 1;

          if (backupQuestion) {
            // 作废重打：轮次号不变（不占正式轮名额），但必须换一道没人看过的题，
            // 并换新 roundToken 让上一轮的在途动作全部失效。
            const nextRoundToken = generateRoundToken(state.round, ctx.now, ctx.random);
            const deadlineAt = ctx.now + state.config.answerSeconds * 1000;
            const { guesses, guessRevisions, bets, betRevisions } = freshRoundRecords(state.players);

            return {
              ok: true,
              nextState: {
                ...state,
                phase: 'answering',
                questionIndex: nextQuestionIndex,
                voidedRounds: state.voidedRounds + 1,
                phaseEpoch: nextEpoch,
                roundToken: nextRoundToken,
                deadlineAt,
                guesses,
                guessRevisions,
                bets,
                betRevisions,
                board: [],
              },
              publicEvents: [
                { type: 'round_voided', round: state.round, reason: 'no_answers' },
                {
                  type: 'round_started',
                  round: state.round,
                  question: { prompt: backupQuestion.prompt, unit: backupQuestion.unit },
                },
              ],
              privateEvents: [],
              effects: [
                {
                  type: 'schedule_timer',
                  timerId: `ww:${nextRoundToken}:${nextEpoch}`,
                  deadlineAt,
                  action: {
                    type: 'phase_timeout',
                    roundToken: nextRoundToken,
                    phaseEpoch: nextEpoch,
                    phase: 'answering',
                  },
                },
              ],
              resultCandidate: null,
            };
          }

          // 备用题用尽：不能无限重抽，本轮按无人得分直接结算收场。
          const question = state.questionPlan[state.questionIndex];
          if (!question) {
            return { ok: false, code: 'MISSING_QUESTION', message: `缺失第 ${state.round} 题` };
          }
          const emptySettlement = settleRound({
            board: [],
            winningTargetIds: [],
            players: state.players.map((pid) => ({
              playerId: pid,
              scoreBefore: state.scores[pid] ?? 0,
              bets: state.bets[pid] ?? defaultBetPair(),
            })),
          });
          const roundResult: RoundResult = {
            round: state.round,
            question,
            board: [],
            bets: { ...state.bets },
            winningTargetIds: [],
            awardedAuthors: [],
            ledger: emptySettlement.ledger,
          };
          const settlementDeadline = ctx.now + state.config.settlementSeconds * 1000;

          return {
            ok: true,
            nextState: {
              ...state,
              phase: 'settlement',
              phaseEpoch: nextEpoch,
              deadlineAt: settlementDeadline,
              history: [...state.history, roundResult],
            },
            publicEvents: [{ type: 'round_settled', result: roundResult }],
            privateEvents: [],
            effects: [
              {
                type: 'schedule_timer',
                timerId: `ww:${state.roundToken}:${nextEpoch}`,
                deadlineAt: settlementDeadline,
                action: {
                  type: 'phase_timeout',
                  roundToken: state.roundToken,
                  phaseEpoch: nextEpoch,
                  phase: 'settlement',
                },
              },
            ],
            resultCandidate: null,
          };
        }

        const nextEpoch = state.phaseEpoch + 1;
        const arrangingDeadline = ctx.now + state.config.arrangingSeconds * 1000;

        const effects: GameEffect[] = [
          {
            type: 'schedule_timer',
            timerId: `ww:${state.roundToken}:${nextEpoch}`,
            deadlineAt: arrangingDeadline,
            action: {
              type: 'phase_timeout',
              roundToken: state.roundToken,
              phaseEpoch: nextEpoch,
              phase: 'arranging',
            },
          },
        ];

        const publicEvents: WitsWagersPublicEvent[] = [
          { type: 'board_revealed', board },
        ];

        const nextState: WitsWagersState = {
          ...state,
          phase: 'arranging',
          phaseEpoch: nextEpoch,
          deadlineAt: arrangingDeadline,
          board,
        };

        return {
          ok: true,
          nextState,
          publicEvents,
          privateEvents: [],
          effects,
          resultCandidate: null,
        };
      }

      if (state.phase === 'arranging') {
        // 转入 betting 阶段，始终给予完整的 betSeconds
        const nextEpoch = state.phaseEpoch + 1;
        const bettingDeadline = ctx.now + state.config.betSeconds * 1000;

        const effects: GameEffect[] = [
          {
            type: 'schedule_timer',
            timerId: `ww:${state.roundToken}:${nextEpoch}`,
            deadlineAt: bettingDeadline,
            action: {
              type: 'phase_timeout',
              roundToken: state.roundToken,
              phaseEpoch: nextEpoch,
              phase: 'betting',
            },
          },
        ];

        const nextState: WitsWagersState = {
          ...state,
          phase: 'betting',
          phaseEpoch: nextEpoch,
          deadlineAt: bettingDeadline,
        };

        return {
          ok: true,
          nextState,
          publicEvents: [],
          privateEvents: [],
          effects,
          resultCandidate: null,
        };
      }

      if (state.phase === 'betting') {
        // 结算当前轮
        const question = state.questionPlan[state.questionIndex];
        if (!question) {
          return { ok: false, code: 'MISSING_QUESTION', message: `缺失第 ${state.round} 题` };
        }

        const winningTargetIds = pickWinningTargets(state.board, question.answer);
        const roundSettlement = settleRound({
          board: state.board,
          winningTargetIds,
          players: state.players.map((pid) => ({
            playerId: pid,
            scoreBefore: state.scores[pid] ?? 0,
            bets: state.bets[pid] ?? defaultBetPair(),
          })),
        });

        const nextScores: Record<string, number> = { ...state.scores };
        const nextWinningGuesses: Record<string, number> = { ...state.winningGuesses };

        for (const entry of roundSettlement.ledger) {
          nextScores[entry.playerId] = entry.scoreAfter;
          nextWinningGuesses[entry.playerId] =
            (nextWinningGuesses[entry.playerId] ?? 0) + entry.winningGuessIncrement;
        }

        const roundResult: RoundResult = {
          round: state.round,
          question,
          board: state.board,
          bets: { ...state.bets },
          winningTargetIds,
          awardedAuthors: roundSettlement.awardedAuthors,
          ledger: roundSettlement.ledger,
        };

        const nextHistory = [...state.history, roundResult];

        const nextEpoch = state.phaseEpoch + 1;
        const settlementDeadline = ctx.now + state.config.settlementSeconds * 1000;

        const effects: GameEffect[] = [
          {
            type: 'schedule_timer',
            timerId: `ww:${state.roundToken}:${nextEpoch}`,
            deadlineAt: settlementDeadline,
            action: {
              type: 'phase_timeout',
              roundToken: state.roundToken,
              phaseEpoch: nextEpoch,
              phase: 'settlement',
            },
          },
        ];

        const publicEvents: WitsWagersPublicEvent[] = [
          { type: 'round_settled', result: roundResult },
        ];

        const nextState: WitsWagersState = {
          ...state,
          phase: 'settlement',
          phaseEpoch: nextEpoch,
          deadlineAt: settlementDeadline,
          scores: nextScores,
          winningGuesses: nextWinningGuesses,
          history: nextHistory,
        };

        return {
          ok: true,
          nextState,
          publicEvents,
          privateEvents: [],
          effects,
          resultCandidate: null,
        };
      }

      if (state.phase === 'settlement') {
        if (state.round < TOTAL_ROUNDS) {
          // 进入下一轮 answering
          const nextRound = state.round + 1;
          const nextQuestionIndex = state.questionIndex + 1;
          const nextEpoch = state.phaseEpoch + 1;
          const nextRoundToken = generateRoundToken(nextRound, ctx.now, ctx.random);
          const deadlineAt = ctx.now + state.config.answerSeconds * 1000;

          const nextQuestion = state.questionPlan[nextQuestionIndex];
          if (!nextQuestion) {
            return { ok: false, code: 'MISSING_QUESTION', message: `缺失第 ${nextRound} 题` };
          }

          const { guesses, guessRevisions, bets, betRevisions } = freshRoundRecords(state.players);

          const timerId = `ww:${nextRoundToken}:${nextEpoch}`;
          const effects: GameEffect[] = [
            {
              type: 'schedule_timer',
              timerId,
              deadlineAt,
              action: {
                type: 'phase_timeout',
                roundToken: nextRoundToken,
                phaseEpoch: nextEpoch,
                phase: 'answering',
              },
            },
          ];

          const publicEvents: WitsWagersPublicEvent[] = [
            {
              type: 'round_started',
              round: nextRound,
              question: {
                prompt: nextQuestion.prompt,
                unit: nextQuestion.unit,
              },
            },
          ];

          const nextState: WitsWagersState = {
            ...state,
            phase: 'answering',
            round: nextRound,
            questionIndex: nextQuestionIndex,
            phaseEpoch: nextEpoch,
            roundToken: nextRoundToken,
            deadlineAt,
            guesses,
            guessRevisions,
            bets,
            betRevisions,
            board: [],
          };

          return {
            ok: true,
            nextState,
            publicEvents,
            privateEvents: [],
            effects,
            resultCandidate: null,
          };
        }

        // 第 7 轮结束，结算完毕后进入 game_over
        const rankings = computeRankings(
          state.players.map((p) => ({
            playerId: p,
            score: state.scores[p] ?? 0,
            winningGuesses: state.winningGuesses[p] ?? 0,
          })),
        );
        const winners = rankings.filter((r) => r.rank === 1).map((r) => r.playerId);
        const finalResult: FinalResult = {
          rankings,
          winners,
          roundsPlayed: TOTAL_ROUNDS,
        };

        const nextEpoch = state.phaseEpoch + 1;
        const publicEvents: WitsWagersPublicEvent[] = [
          { type: 'game_finished', result: finalResult },
        ];

        const nextState: WitsWagersState = {
          ...state,
          phase: 'game_over',
          phaseEpoch: nextEpoch,
          deadlineAt: null,
          result: finalResult,
        };

        return {
          ok: true,
          nextState,
          publicEvents,
          privateEvents: [],
          effects: [],
          resultCandidate: finalResult,
        };
      }

      return { ok: false, code: 'INVALID_PHASE', message: `阶段 ${state.phase} 不支持 phase_timeout` };
    }

    case 'player_forfeited': {
      if (actor.kind !== 'system') {
        return { ok: false, code: 'ACTOR_NOT_ALLOWED', message: '只有系统可处理退席' };
      }

      const newlyForfeited = action.playerIds.filter(
        (id) => state.players.includes(id) && !state.forfeitedIds.includes(id),
      );
      if (newlyForfeited.length === 0) {
        // 幂等处理
        return {
          ok: true,
          nextState: state,
          publicEvents: [],
          privateEvents: [],
          effects: [],
          resultCandidate: null,
        };
      }

      const nextForfeitedIds = [...state.forfeitedIds, ...newlyForfeited];

      // 若在 answering 阶段且所有剩下的活跃玩家都已提交，触发提前进入 arranging
      if (state.phase === 'answering') {
        const remainingActive = state.players.filter((p) => !nextForfeitedIds.includes(p));
        const allSubmitted = remainingActive.every((p) => state.guesses[p] !== null);
        const board =
          allSubmitted && remainingActive.length > 0
            ? buildBoardFromGuesses(state.players, nextForfeitedIds, state.guesses)
            : null;

        // board 为 null 说明活跃玩家一个都没作答（例如作答者刚好全退席），
        // 此时不提前翻牌，交给作答超时那条路去走作废流程。
        if (board !== null) {
          const cancelTimerEffect: GameEffect = {
            type: 'cancel_timer',
            timerId: `ww:${state.roundToken}:${state.phaseEpoch}`,
          };

          const arrangingEpoch = state.phaseEpoch + 1;
          const arrangingDeadline = ctx.now + state.config.arrangingSeconds * 1000;

          const scheduleArrangingEffect: GameEffect = {
            type: 'schedule_timer',
            timerId: `ww:${state.roundToken}:${arrangingEpoch}`,
            deadlineAt: arrangingDeadline,
            action: {
              type: 'phase_timeout',
              roundToken: state.roundToken,
              phaseEpoch: arrangingEpoch,
              phase: 'arranging',
            },
          };

          const publicEvents: WitsWagersPublicEvent[] = [
            { type: 'board_revealed', board },
          ];

          const nextState: WitsWagersState = {
            ...state,
            phase: 'arranging',
            phaseEpoch: arrangingEpoch,
            deadlineAt: arrangingDeadline,
            forfeitedIds: nextForfeitedIds,
            board,
          };

          return {
            ok: true,
            nextState,
            publicEvents,
            privateEvents: [],
            effects: [cancelTimerEffect, scheduleArrangingEffect],
            resultCandidate: null,
          };
        }
      }

      const nextState: WitsWagersState = {
        ...state,
        forfeitedIds: nextForfeitedIds,
      };

      return {
        ok: true,
        nextState,
        publicEvents: [],
        privateEvents: [],
        effects: [],
        resultCandidate: null,
      };
    }

    default: {
      return { ok: false, code: 'UNKNOWN_ACTION', message: '未知动作' };
    }
  }
}
