import type { GameEffect } from '@ldj/shared';
import { parseNightTestimonyAction, parseNightTestimonyConfig } from './schemas.ts';
import { drawThreeQuestionCards, QUESTION_DECK } from './questionDeck.ts';
import { crimeLabel } from './views.ts';
import {
  CRIMES,
  type CrimeId,
  type NightTestimonyAction,
  type NightTestimonyEvent,
  type NightTestimonyReduceResult,
  type NightTestimonyState,
  type QuestionRecord,
} from './types.ts';

export interface NightRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

const deny = (message: string): NightTestimonyReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: NightTestimonyState): NightTestimonyReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

/**
 * 提问阶段超时（出题者未选卡/有人未作答时自动推进）。
 *
 * 顺便把截止时刻写进 state：客户端的倒计时环需要它，而 effect 里的
 * deadlineAt 只有运行时看得见，视图拿不到。两处必须同值。
 */
function scheduleQuestionTimeout(state: NightTestimonyState, now: number): GameEffect {
  const deadlineAt = now + state.config.questionSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'nt-question-timeout',
    deadlineAt,
    action: { type: 'question_timeout' },
  };
}

/** 投票阶段超时（到点按现有票结算）。同样顺便写 state.deadlineAt。 */
function scheduleVoteTimeout(state: NightTestimonyState, now: number): GameEffect {
  const deadlineAt = now + state.config.voteSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'nt-vote-timeout',
    deadlineAt,
    action: { type: 'vote_timeout' },
  };
}

/** 投票结算：按现有票数开票（cast_vote 全员投完与 vote_timeout 到点共用） */
function settleVotes(
  next: NightTestimonyState,
  events: NightTestimonyEvent[],
  effects: GameEffect[],
): void {
  const tally: Record<string, number> = {};
  for (const target of Object.values(next.votes)) {
    tally[target] = (tally[target] ?? 0) + 1;
  }
  let maxVotes = -1;
  let accused = next.players[0]!;
  for (const [target, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      accused = target;
    }
  }

  const isWarden = accused === next.wardenId;
  next.accusedId = accused;
  next.wardenRevealed = isWarden;
  events.push({ type: 'vote_resolved', accusedId: accused, isWarden });

  if (!isWarden) {
    // 票出的是囚犯（狱警未被投出）-> 狱警直接独胜！
    next.phase = 'game_over';
    // 终局不再计时：客户端倒计时环据此隐藏
    next.deadlineAt = null;
    next.guessingInProgress = false;
    next.winners = [next.wardenId];
    events.push({ type: 'game_finished', winners: [next.wardenId] });
    effects.push(system(`投票结果：${accused} 被票出，但不是狱警！潜伏狱警 ${next.wardenId} 赢得最终胜利！`));
  } else {
    // 票出的是狱警 -> 触发狱警终局猜罪！
    next.phase = 'game_over';
    // 终局不再计时：客户端倒计时环据此隐藏
    next.deadlineAt = null;
    next.guessingInProgress = true;
    const set = new Set<CrimeId>(Object.values(next.crimes));
    if (next.extraCrime) set.add(next.extraCrime);
    const availableCrimes = Array.from(set);
    events.push({ type: 'guessing_started', availableCrimes });
    effects.push(system(`潜伏狱警 ${next.wardenId} 被票出！进入终局猜罪翻盘环节！`));
  }
}

/** 当前问题已全员作答后的推进：入库、判断停止条件、轮转下一位出题者或进入投票 */
function advanceQuestion(
  next: NightTestimonyState,
  events: NightTestimonyEvent[],
  effects: GameEffect[],
  random: NightRandom,
  now: number,
): void {
  const current = next.currentQuestion;
  if (current === null) return;
  const record: QuestionRecord = {
    questionIndex: current.questionIndex,
    questionerId: current.questionerId,
    cardId: current.cardId,
    question: current.text,
    answers: { ...next.currentQuestionAnswers },
  };
  next.history.push(record);
  events.push({
    type: 'question_completed',
    questionIndex: record.questionIndex,
    answers: record.answers,
  });

  const hitMaxYes = Object.values(next.playerYesCounts).some((count) => count >= next.config.maxYesPerPlayer);
  const hitLimit = next.history.length >= next.config.questionLimit;

  if (hitMaxYes || hitLimit) {
    next.phase = 'vote';
    next.currentQuestion = null;
    next.currentQuestionAnswers = {};
    next.pendingCardChoices = null;
    events.push({ type: 'vote_started' });
    effects.push(
      system(
        hitMaxYes
          ? '有玩家累计回答达到 3 次「是」，提问终止，进入投票！'
          : '已完成 5 轮全员审讯，提问终止，进入投票！',
      ),
    );
    effects.push(scheduleVoteTimeout(next, now));
  } else {
    let nextIdx = next.questionerIndex;
    let nextQId = '';
    for (let step = 1; step <= next.players.length; step++) {
      const idx = (next.questionerIndex + step) % next.players.length;
      const pid = next.players[idx]!;
      if (next.revealedIdentities[pid] === undefined) {
        nextIdx = idx;
        nextQId = pid;
        break;
      }
    }
    if (!nextQId) {
      next.phase = 'vote';
      next.currentQuestion = null;
      next.currentQuestionAnswers = {};
      next.pendingCardChoices = null;
      events.push({ type: 'vote_started' });
      effects.push(system('所有未自告囚犯已完成审讯，进入投票！'));
      effects.push(scheduleVoteTimeout(next, now));
    } else {
      next.questionerIndex = nextIdx;
      next.currentQuestionerId = nextQId;
      next.currentQuestion = null;
      next.currentQuestionAnswers = {};
      next.pendingCardChoices = drawThreeQuestionCards(QUESTION_DECK, next.usedCardIds, random);
      events.push({
        type: 'question_card_offered',
        questionerId: next.currentQuestionerId,
        cards: [...next.pendingCardChoices],
      });
      effects.push(system(`轮到 ${next.currentQuestionerId} 挑选下一道审讯卡`));
      effects.push(scheduleQuestionTimeout(next, now));
    }
  }
}

export function assignRolesAndCrimes(
  players: readonly string[],
  random: NightRandom,
): { wardenId: string; crimes: Record<string, CrimeId>; extraCrime: CrimeId } {
  const shuffledPlayers = random.shuffle([...players]);
  const wardenId = shuffledPlayers[0]!;
  const inmates = shuffledPlayers.slice(1);
  const shuffledCrimes = random.shuffle([...CRIMES]);
  const crimes: Record<string, CrimeId> = {};
  inmates.forEach((inmateId, index) => {
    crimes[inmateId] = shuffledCrimes[index]!;
  });
  // 额外随机混入一张干扰罪行卡
  const extraCrime = shuffledCrimes[inmates.length]!;
  return { wardenId, crimes, extraCrime };
}

export function createNightTestimonyState(
  players: readonly string[],
  configInput: unknown = {},
  wardenId: string,
  crimes: Record<string, CrimeId>,
  extraCrime: CrimeId | null = null,
): NightTestimonyState {
  if (players.length < 3 || players.length > 6) {
    throw new Error('囚徒之夜需要 3 至 6 名玩家');
  }
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseNightTestimonyConfig(configInput);
  if (!players.includes(wardenId)) throw new Error('狱警必须在玩家列表中');
  const inmates = players.filter((id) => id !== wardenId);
  const crimeValues = inmates.map((id) => crimes[id]);
  if (crimeValues.some((c) => c === undefined || !CRIMES.includes(c))) {
    throw new Error('囚犯罪行未完全分配或无效');
  }
  if (new Set(crimeValues).size !== inmates.length) {
    throw new Error('囚犯罪行必须互不相同');
  }
  if (crimes[wardenId] !== undefined) {
    throw new Error('狱警不能分配罪行');
  }

  const initialCards = QUESTION_DECK.slice(0, 3);
  const state: NightTestimonyState = {
    schemaVersion: 1,
    phase: 'question',
    players: [...players],
    config,
    wardenId,
    crimes: { ...crimes },
    extraCrime,
    questionerIndex: 0,
    currentQuestionerId: players[0]!,
    pendingCardChoices: [...initialCards],
    usedCardIds: [],
    currentQuestion: null,
    currentQuestionAnswers: {},
    history: [],
    playerYesCounts: Object.fromEntries(players.map((id) => [id, 0])),
    revealedIdentities: {},
    votes: {},
    accusedId: null,
    wardenRevealed: null,
    guessingInProgress: false,
    wardenGuesses: null,
    crimesAllGuessed: null,
    winners: [],
    deadlineAt: null,
  };
  assertNightTestimonyInvariants(state);
  return state;
}

export function reduceNightTestimonyState(
  state: NightTestimonyState,
  actionInput: NightTestimonyAction | unknown,
  ctx: { now: number; random?: NightRandom },
): NightTestimonyReduceResult {
  let action: NightTestimonyAction;
  try {
    action = parseNightTestimonyAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  const random = ctx.random ?? {
    nextInt: (min, _max) => min,
    shuffle: (arr) => [...arr],
  };

  if (action.type === 'begin') {
    // 幂等：仅开局最初（无已问问题、无进行中问题）生效；重放/进行中/已终局一律原样返回
    if (state.phase !== 'question' || state.currentQuestion !== null || state.history.length > 0) {
      return idempotent(state);
    }
    const next = structuredClone(state);
    if (!next.pendingCardChoices || next.pendingCardChoices.length === 0) {
      next.pendingCardChoices = drawThreeQuestionCards(QUESTION_DECK, next.usedCardIds, random);
    }
    return {
      ok: true,
      nextState: next,
      events: [
        { type: 'round_started' },
        { type: 'question_card_offered', questionerId: next.currentQuestionerId, cards: [...next.pendingCardChoices] },
      ],
      effects: [
        system('囚徒之夜开始！顺时针轮流出题，全员提交 YES/NO 进行审讯推理'),
        scheduleQuestionTimeout(next, ctx.now),
      ],
    };
  }

  if (state.phase === 'game_over' && !state.guessingInProgress) {
    return idempotent(state);
  }

  const next = structuredClone(state);
  const events: NightTestimonyEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出处理
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      delete next.crimes[id];
      delete next.playerYesCounts[id];
      delete next.revealedIdentities[id];
      delete next.votes[id];
      delete next.currentQuestionAnswers[id];
    }
    if (next.players.length < 3 || forfeited.includes(next.wardenId)) {
      next.phase = 'game_over';
      // 终局不再计时：客户端倒计时环据此隐藏
      next.deadlineAt = null;
      next.guessingInProgress = false;
      next.winners = [...next.players];
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('对局人数不足或关键角色离开，对局提前结束'));
      assertNightTestimonyInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    if (!next.players.includes(next.currentQuestionerId)) {
      next.questionerIndex = next.questionerIndex % next.players.length;
      next.currentQuestionerId = next.players[next.questionerIndex]!;
      next.currentQuestion = null;
      next.currentQuestionAnswers = {};
      next.pendingCardChoices = drawThreeQuestionCards(QUESTION_DECK, next.usedCardIds, random);
      effects.push(scheduleQuestionTimeout(next, ctx.now));
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 主动自告 / 自曝身份
  if (action.type === 'self_expose') {
    if (next.phase !== 'question' && next.phase !== 'vote') {
      return deny('当前阶段不能自告身份');
    }
    if (!next.players.includes(action.playerId)) return deny('玩家不在本局');
    if (next.revealedIdentities[action.playerId] !== undefined) {
      return deny('你已经自告过身份');
    }

    if (action.playerId === next.wardenId) {
      // 狱警主动自曝身份 -> 直接跳过提问与投票，立即进入终局猜罪！
      next.revealedIdentities[action.playerId] = 'warden';
      next.wardenRevealed = true;
      next.accusedId = next.wardenId;
      next.phase = 'game_over';
      // 终局不再计时：客户端倒计时环据此隐藏
      next.deadlineAt = null;
      next.guessingInProgress = true;
      next.currentQuestion = null;
      next.pendingCardChoices = null;

      const set = new Set<CrimeId>(Object.values(next.crimes));
      if (next.extraCrime) set.add(next.extraCrime);
      const availableCrimes = Array.from(set);

      events.push({ type: 'identity_exposed', playerId: action.playerId, identity: 'warden' });
      events.push({ type: 'guessing_started', availableCrimes });
      effects.push(system(`狱警 ${action.playerId} 主动自曝！直接进入终局猜罪环节！`));
      assertNightTestimonyInvariants(next);
      return { ok: true, nextState: next, events, effects };
    } else {
      // 罪犯自告 -> 公开真实罪行，排除狱警嫌疑
      const crime = next.crimes[action.playerId]!;
      next.revealedIdentities[action.playerId] = crime;
      events.push({ type: 'identity_exposed', playerId: action.playerId, identity: crime });
      effects.push(system(`玩家 ${action.playerId} 主动自告身份！公开真实罪行：【${crimeLabel(crime)}】，确认为罪犯（排除狱警嫌疑）！`));

      // 若在提问阶段，检查是否需要推进出题或题目完成
      if (next.phase === 'question') {
        const unexposed = next.players.filter((p) => next.revealedIdentities[p] === undefined);
        if (unexposed.length === 0) {
          next.phase = 'vote';
          next.currentQuestion = null;
          next.currentQuestionAnswers = {};
          next.pendingCardChoices = null;
          events.push({ type: 'vote_started' });
          effects.push(system('所有囚犯均已自告身份，提问终止，进入指认狱警投票！'));
          effects.push(scheduleVoteTimeout(next, ctx.now));
        } else if (next.currentQuestion !== null) {
          const isComplete = unexposed.every((p) => next.currentQuestionAnswers[p] !== undefined);
          if (isComplete) {
            const record: QuestionRecord = {
              questionIndex: next.currentQuestion.questionIndex,
              questionerId: next.currentQuestion.questionerId,
              cardId: next.currentQuestion.cardId,
              question: next.currentQuestion.text,
              answers: { ...next.currentQuestionAnswers },
            };
            next.history.push(record);
            events.push({
              type: 'question_completed',
              questionIndex: record.questionIndex,
              answers: record.answers,
            });

            const hitMaxYes = Object.values(next.playerYesCounts).some((count) => count >= next.config.maxYesPerPlayer);
            const hitLimit = next.history.length >= next.config.questionLimit;

            if (hitMaxYes || hitLimit) {
              next.phase = 'vote';
              next.currentQuestion = null;
              next.currentQuestionAnswers = {};
              next.pendingCardChoices = null;
              events.push({ type: 'vote_started' });
              effects.push(
                system(
                  hitMaxYes
                    ? '有玩家累计回答达到 3 次「是」，提问终止，进入投票！'
                    : '已完成 5 轮全员审讯，提问终止，进入投票！',
                ),
              );
            } else {
              let nextIdx = next.questionerIndex;
              let nextQId = '';
              for (let step = 1; step <= next.players.length; step++) {
                const idx = (next.questionerIndex + step) % next.players.length;
                const pid = next.players[idx]!;
                if (next.revealedIdentities[pid] === undefined) {
                  nextIdx = idx;
                  nextQId = pid;
                  break;
                }
              }
              if (!nextQId) {
                next.phase = 'vote';
                next.currentQuestion = null;
                next.currentQuestionAnswers = {};
                next.pendingCardChoices = null;
                events.push({ type: 'vote_started' });
                effects.push(system('所有未自告囚犯已完成审讯，进入投票！'));
                effects.push(scheduleVoteTimeout(next, ctx.now));
              } else {
                next.questionerIndex = nextIdx;
                next.currentQuestionerId = nextQId;
                next.currentQuestion = null;
                next.currentQuestionAnswers = {};
                next.pendingCardChoices = drawThreeQuestionCards(QUESTION_DECK, next.usedCardIds, random);

                events.push({
                  type: 'question_card_offered',
                  questionerId: next.currentQuestionerId,
                  cards: [...next.pendingCardChoices],
                });
                effects.push(system(`轮到 ${next.currentQuestionerId} 挑选下一道审讯卡`));
                effects.push(scheduleQuestionTimeout(next, ctx.now));
              }
            }
          }
        } else if (next.currentQuestion === null && next.currentQuestionerId === action.playerId) {
          // 当前出题者自告 -> 轮转到下一个未自告出题者
          let nextIdx = next.questionerIndex;
          let nextQId = '';
          for (let step = 1; step <= next.players.length; step++) {
            const idx = (next.questionerIndex + step) % next.players.length;
            const pid = next.players[idx]!;
            if (next.revealedIdentities[pid] === undefined) {
              nextIdx = idx;
              nextQId = pid;
              break;
            }
          }
          if (!nextQId) {
            next.phase = 'vote';
            next.currentQuestion = null;
            next.currentQuestionAnswers = {};
            next.pendingCardChoices = null;
            events.push({ type: 'vote_started' });
            effects.push(system('所有囚犯均已自告身份，进入投票！'));
            effects.push(scheduleVoteTimeout(next, ctx.now));
          } else {
            next.questionerIndex = nextIdx;
            next.currentQuestionerId = nextQId;
            next.pendingCardChoices = drawThreeQuestionCards(QUESTION_DECK, next.usedCardIds, random);
            events.push({
              type: 'question_card_offered',
              questionerId: next.currentQuestionerId,
              cards: [...next.pendingCardChoices],
            });
            effects.push(system(`出题者已自告身份，轮转至 ${next.currentQuestionerId} 挑选下一道审讯卡`));
            effects.push(scheduleQuestionTimeout(next, ctx.now));
          }
        }
      }

      assertNightTestimonyInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
  }

  // 顺时针出题者 3 选 1 挑选题卡
  if (action.type === 'pick_question_card') {
    if (next.phase !== 'question') return deny('当前不是提问阶段');
    if (action.playerId !== next.currentQuestionerId) return deny('还没轮到你出题');
    if (next.revealedIdentities[action.playerId] !== undefined) return deny('已自告身份的玩家不参与出题');
    if (next.currentQuestion !== null) return deny('当前问题全员尚未作答完毕');

    // 只能从本轮提供的 3 张问题卡中选择（pendingCardChoices 为 null 视为已选过）
    const card = next.pendingCardChoices?.find((c) => c.id === action.cardId);
    if (!card) return deny('只能选择提供的 3 张问题卡');

    next.usedCardIds.push(card.id);
    next.pendingCardChoices = null;
    const qIndex = next.history.length + 1;
    next.currentQuestion = {
      questionIndex: qIndex,
      questionerId: action.playerId,
      cardId: card.id,
      text: card.text,
    };
    next.currentQuestionAnswers = {};

    events.push({
      type: 'question_asked',
      questionIndex: qIndex,
      questionerId: action.playerId,
      cardId: card.id,
      text: card.text,
    });
    effects.push(system(`第 ${qIndex} 题由 ${action.playerId} 提出：「${card.text}」——请全员提交是或否`));
    // 重武装作答超时（同 id 定时器被替换为最新期限）
    effects.push(scheduleQuestionTimeout(next, ctx.now));
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 全员提交当前问题的 YES / NO 作答
  if (action.type === 'answer_question') {
    if (next.phase !== 'question') return deny('当前不是提问阶段');
    if (next.currentQuestion === null) return deny('当前无待回答的问题');
    if (!next.players.includes(action.playerId)) return deny('玩家不在本局');
    if (next.revealedIdentities[action.playerId] !== undefined) {
      return deny('已自告身份的玩家不参与问题回答');
    }
    if (next.currentQuestionAnswers[action.playerId] !== undefined) {
      return deny('你已经回答过当前问题');
    }

    next.currentQuestionAnswers[action.playerId] = action.answer;
    if (action.answer === 'yes') {
      next.playerYesCounts[action.playerId] = (next.playerYesCounts[action.playerId] ?? 0) + 1;
    }

    events.push({
      type: 'question_answered',
      questionIndex: next.currentQuestion.questionIndex,
      playerId: action.playerId,
      answer: action.answer,
    });

    // 检查所有未自告身份的玩家是否都已作答
    const unexposed = next.players.filter((p) => next.revealedIdentities[p] === undefined);
    const isComplete = unexposed.every((p) => next.currentQuestionAnswers[p] !== undefined);
    if (isComplete) {
      // 入库 + 停止条件判断 + 轮转/进入投票（与 question_timeout 共用推进逻辑）
      advanceQuestion(next, events, effects, random, ctx.now);
    }

    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票选出潜伏狱警
  if (action.type === 'cast_vote') {
    if (next.phase !== 'vote') return deny('当前不是投票阶段');
    if (!next.players.includes(action.playerId)) return deny('玩家不在本局');

    // 只剩一名未自告玩家（其余全部自告为罪犯）时，狱警身份已被锁定：
    // 投票无合法目标（禁投自己/已自告者），直接判定狱警被票出进入终局猜罪，避免永久卡死
    const unexposedPlayers = next.players.filter((p) => next.revealedIdentities[p] === undefined);
    if (unexposedPlayers.length <= 1) {
      const accused = unexposedPlayers[0] ?? next.wardenId;
      next.accusedId = accused;
      next.wardenRevealed = true;
      next.phase = 'game_over';
      // 终局不再计时：客户端倒计时环据此隐藏
      next.deadlineAt = null;
      next.guessingInProgress = true;
      const set = new Set<CrimeId>(Object.values(next.crimes));
      if (next.extraCrime) set.add(next.extraCrime);
      const availableCrimes = Array.from(set);
      events.push({ type: 'vote_resolved', accusedId: accused, isWarden: true });
      events.push({ type: 'guessing_started', availableCrimes });
      effects.push(system(`所有罪犯均已自告身份，潜伏狱警 ${next.wardenId} 无处藏身，进入终局猜罪翻盘环节！`));
      assertNightTestimonyInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    if (action.targetPlayerId === action.playerId) return deny('不能投票给自己');
    if (!next.players.includes(action.targetPlayerId)) return deny('投票目标不在本局');
    if (next.revealedIdentities[action.targetPlayerId] !== undefined) {
      return deny('不能投票指认已自告身份的罪犯');
    }
    if (next.votes[action.playerId] !== undefined) return deny('你已经投过票了');

    next.votes[action.playerId] = action.targetPlayerId;
    events.push({ type: 'vote_cast', playerId: action.playerId, targetPlayerId: action.targetPlayerId });

    // 全员投票完毕 -> 开票结算
    if (Object.keys(next.votes).length >= next.players.length) {
      settleVotes(next, events, effects);
    }

    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 狱警提交终局猜罪
  if (action.type === 'submit_guesses') {
    if (!next.guessingInProgress) return deny('当前不在猜罪环节');
    if (action.playerId !== next.wardenId) return deny('只有狱警可以提交猜罪');

    const inmates = next.players.filter((id) => id !== next.wardenId);
    const guessKeys = Object.keys(action.guesses);
    if (inmates.some((id) => !guessKeys.includes(id))) {
      return deny('必须为所有囚犯指定罪行');
    }

    const allCorrect = inmates.every((id) => action.guesses[id] === next.crimes[id]);
    next.wardenGuesses = { ...action.guesses };
    next.crimesAllGuessed = allCorrect;
    next.guessingInProgress = false;
    next.phase = 'game_over';
    // 终局不再计时：客户端倒计时环据此隐藏
    next.deadlineAt = null;
    next.winners = allCorrect ? [next.wardenId] : inmates;

    events.push({ type: 'guesses_resolved', allCorrect });
    events.push({ type: 'game_finished', winners: [...next.winners] });
    effects.push(
      system(
        allCorrect
          ? `狱警准确猜出了全部囚犯的真实罪行，惊天翻盘独胜！`
          : `狱警猜罪失败，囚犯联盟（${inmates.join('、')}）赢得最终胜利！`,
      ),
    );

    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 提问阶段超时（系统计时器）：出题者未选卡 → 自动选第一张；有人未作答 → 自动补"否"并推进
  if (action.type === 'question_timeout') {
    if (next.phase !== 'question') return idempotent(state);
    if (next.currentQuestion === null) {
      if (!next.pendingCardChoices || next.pendingCardChoices.length === 0) return idempotent(state);
      const autoCard = next.pendingCardChoices[0]!;
      next.usedCardIds.push(autoCard.id);
      next.pendingCardChoices = null;
      const qIndex = next.history.length + 1;
      next.currentQuestion = {
        questionIndex: qIndex,
        questionerId: next.currentQuestionerId,
        cardId: autoCard.id,
        text: autoCard.text,
      };
      next.currentQuestionAnswers = {};
      events.push({
        type: 'question_asked',
        questionIndex: qIndex,
        questionerId: next.currentQuestionerId,
        cardId: autoCard.id,
        text: autoCard.text,
      });
      effects.push(system(`出题超时，系统代 ${next.currentQuestionerId} 选题：「${autoCard.text}」——请全员提交是或否`));
      effects.push(scheduleQuestionTimeout(next, ctx.now));
    } else {
      // 作答超时：未作答的未自告玩家按"否"计入，然后照常推进（不重复推 question_completed）
      const unexposedPlayers = next.players.filter((p) => next.revealedIdentities[p] === undefined);
      let autoAnswered = false;
      for (const p of unexposedPlayers) {
        if (next.currentQuestionAnswers[p] === undefined) {
          next.currentQuestionAnswers[p] = 'no';
          autoAnswered = true;
        }
      }
      if (!autoAnswered) return idempotent(state);
      advanceQuestion(next, events, effects, random, ctx.now);
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票阶段超时（系统计时器）：到点按现有票结算；无人投票则狱警直接获胜
  if (action.type === 'vote_timeout') {
    if (next.phase !== 'vote') return idempotent(state);
    if (Object.keys(next.votes).length === 0) {
      next.phase = 'game_over';
      // 终局不再计时：客户端倒计时环据此隐藏
      next.deadlineAt = null;
      next.guessingInProgress = false;
      next.winners = [next.wardenId];
      events.push({ type: 'game_finished', winners: [next.wardenId] });
      effects.push(system('投票超时无人指认，潜伏狱警成功隐藏，赢得最终胜利！'));
    } else {
      settleVotes(next, events, effects);
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  return deny('动作无效');
}

export function assertNightTestimonyInvariants(state: NightTestimonyState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (
    (state.phase !== 'game_over' && (state.players.length < 3 || state.players.length > 6)) ||
    state.players.length < 1 ||
    new Set(state.players).size !== state.players.length
  ) {
    throw new Error('玩家列表无效');
  }
  if (state.phase !== 'game_over' && !state.players.includes(state.wardenId)) {
    throw new Error('狱警不在本局');
  }
  const inmates = state.players.filter((id) => id !== state.wardenId);
  for (const id of inmates) {
    if (state.phase !== 'game_over' && !CRIMES.includes(state.crimes[id] as CrimeId)) {
      throw new Error(`囚犯 ${id} 罪行无效`);
    }
  }
  if (state.crimes[state.wardenId] !== undefined) {
    throw new Error('狱警不能有罪行');
  }
  for (const id of state.players) {
    if (!Number.isInteger(state.playerYesCounts[id]) || state.playerYesCounts[id]! < 0) {
      throw new Error('玩家 YES 计数无效');
    }
  }
}
