import type { GameEffect } from '@ldj/shared';
import { parseNightTestimonyAction, parseNightTestimonyConfig } from './schemas.ts';
import {
  CRIMES,
  NO_COUNT,
  YES_COUNT,
  type CrimeId,
  type NightTestimonyAction,
  type NightTestimonyEvent,
  type NightTestimonyReduceResult,
  type NightTestimonyState,
} from './types.ts';

export interface TestimonyRandom {
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

/** 随机选择狱警 + 分配罪行卡（每囚犯一罪，互异；狱警无罪） */
export function assignWardenAndCrimes(
  players: readonly string[],
  random: TestimonyRandom,
): { wardenId: string; crimes: Record<string, CrimeId> } {
  const wardenIndex = random.nextInt(0, players.length);
  const wardenId = players[wardenIndex]!;
  const inmates = players.filter((id) => id !== wardenId);
  const pool = random.shuffle([...CRIMES]);
  if (pool.length < inmates.length) throw new Error('罪行池不足以分配全部囚犯');
  const crimes: Record<string, CrimeId> = {};
  inmates.forEach((id, index) => {
    crimes[id] = pool[index]!;
  });
  return { wardenId, crimes };
}

export function createNightTestimonyState(
  players: readonly string[],
  configInput: unknown = {},
  wardenId: string,
  crimes: Record<string, CrimeId>,
): NightTestimonyState {
  if (players.length < 3 || players.length > 6) throw new Error('囚徒之夜需要 3 至 6 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseNightTestimonyConfig(configInput);
  if (!players.includes(wardenId)) throw new Error('狱警不在本局');
  const inmates = players.filter((id) => id !== wardenId);
  if (Object.keys(crimes).length !== inmates.length) throw new Error('罪行卡数量与囚犯数不一致');
  const seen = new Set<CrimeId>();
  for (const id of inmates) {
    const crime = crimes[id];
    if (!crime || !(CRIMES as readonly string[]).includes(crime)) throw new Error('罪行卡无效');
    if (seen.has(crime)) throw new Error('罪行卡重复');
    seen.add(crime);
  }
  const state: NightTestimonyState = {
    schemaVersion: 1,
    phase: 'question',
    players: [...players],
    config,
    wardenId,
    crimes: { ...crimes },
    yesLeft: Object.fromEntries(players.map((id) => [id, YES_COUNT])),
    noLeft: Object.fromEntries(players.map((id) => [id, NO_COUNT])),
    answers: [],
    extraCrime: null,
    pendingQuestion: null,
    votes: {},
    accusedId: null,
    wardenRevealed: null,
    wardenGuesses: null,
    crimesAllGuessed: null,
    winners: [],
  };
  assertNightTestimonyInvariants(state);
  return state;
}

/** 问答阶段结束：进入推理阶段（额外罪行卡公开混入） */
function enterDeduction(
  state: NightTestimonyState,
  events: NightTestimonyEvent[],
  effects: GameEffect[],
  random: TestimonyRandom,
  now: number,
): void {
  // 从罪行池取一张未被使用的罪行作为额外卡（公开混入）
  const used = new Set(Object.values(state.crimes));
  const available = CRIMES.filter((c) => !used.has(c));
  state.extraCrime = available[random.nextInt(0, available.length)]!;
  state.phase = 'deduction';
  events.push({ type: 'deduction_started', extraCrime: state.extraCrime });
  effects.push(system('推理阶段：一张额外罪行卡混入了公开牌堆'));
  effects.push({
    type: 'schedule_timer',
    timerId: 'deduction',
    deadlineAt: now + state.config.deductionSeconds * 1000,
    action: { type: 'end_deduction' },
  });
}

/** 结算：最高票被票出并揭示身份；若狱警被票出进入猜罪环节，否则狱警胜 */
function settleVote(
  state: NightTestimonyState,
  events: NightTestimonyEvent[],
  effects: GameEffect[],
  votes: Record<string, string>,
): void {
  const counts: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  const maxVotes = Math.max(0, ...state.players.map((id) => counts[id] ?? 0));
  const top = maxVotes === 0 ? [] : state.players.filter((id) => (counts[id] ?? 0) === maxVotes);
  // 平票：按座位顺序取第一位（平台裁定）
  const accusedId = top[0] ?? null;
  state.accusedId = accusedId;
  const isWarden = accusedId === state.wardenId;
  events.push({ type: 'accused_revealed', accusedId: accusedId ?? '', isWarden });
  if (!isWarden || accusedId === null) {
    // 票出囚犯（或无人投票）→ 狱警胜利
    state.wardenRevealed = false;
    state.phase = 'game_over';
    state.winners = [state.wardenId];
    events.push({ type: 'game_finished', winners: [...state.winners] });
    effects.push(system(accusedId === null ? '无人被票出，狱警逃脱！' : '票错了！被票出的是囚犯，狱警获胜'));
    return;
  }
  // 票出狱警 → 进入猜罪环节
  state.wardenRevealed = true;
  state.phase = 'game_over';
  state.wardenGuesses = null;
  events.push({ type: 'game_finished', winners: [] });
  effects.push(system('狱警被票出了！狱警现在要猜出所有囚犯的罪行'));
}

/** 狱警猜罪：全部正确 → 狱警单独获胜，否则囚犯获胜 */
function settleGuesses(state: NightTestimonyState, guesses: Record<string, CrimeId>): void {
  const inmates = state.players.filter((id) => id !== state.wardenId);
  const allCorrect = inmates.every((id) => guesses[id] === state.crimes[id]);
  state.wardenGuesses = { ...guesses };
  state.crimesAllGuessed = allCorrect;
  state.winners = allCorrect ? [state.wardenId] : state.players.filter((id) => id !== state.wardenId);
}

export function reduceNightTestimonyState(
  state: NightTestimonyState,
  actionInput: NightTestimonyAction | unknown,
  ctx: { now: number; random: TestimonyRandom },
): NightTestimonyReduceResult {
  let action: NightTestimonyAction;
  try {
    action = parseNightTestimonyAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  if (action.type === 'begin') {
    return {
      ok: true,
      nextState: state,
      events: [{ type: 'question_started' }],
      effects: [
        system('狱警已混入人群。问答阶段开始，用 YES/NO 追踪蛛丝马迹！'),
        {
          type: 'schedule_timer',
          timerId: 'question',
          deadlineAt: ctx.now + state.config.questionSeconds * 1000,
          action: { type: 'resolve_question' },
        },
      ],
    };
  }
  if (state.phase === 'game_over' && state.wardenGuesses !== null) return idempotent(state);

  const next = structuredClone(state);
  const events: NightTestimonyEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作，§6.7）：从局内移除；玩家不足则终局（剩余玩家获胜）
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      delete next.votes[id];
      delete next.crimes[id];
    }
    if (next.players.length < 2 || !next.players.includes(next.wardenId)) {
      // 狱警退出或玩家不足 → 剩余玩家获胜（中局结束）
      next.phase = 'game_over';
      next.wardenRevealed = false;
      next.winners = [...next.players];
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('玩家退出，对局结束'));
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 提问
  if (action.type === 'ask') {
    if (next.phase !== 'question') return deny('当前不能提问');
    if (!next.players.includes(action.playerId)) return deny('只有参局玩家可以操作');
    if (action.targetPlayerId === action.playerId) return deny('不能问自己');
    if (!next.players.includes(action.targetPlayerId)) return deny('目标不在本局');
    if (next.pendingQuestion !== null) return deny('已有待回答的问题');
    if (next.answers.length >= next.config.questionLimit) return deny('已达问答上限');
    next.pendingQuestion = { questionerId: action.playerId, responderId: action.targetPlayerId, text: action.text };
    events.push({ type: 'question_asked', questionerId: action.playerId, responderId: action.targetPlayerId, text: action.text });
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 回答（仅被问者可答）
  if (action.type === 'answer') {
    if (next.phase !== 'question') return deny('当前不能回答');
    if (next.pendingQuestion === null) return deny('当前没有问题待回答');
    if (action.playerId !== next.pendingQuestion.responderId) return deny('还没轮到你回答');
    const record = {
      questionerId: next.pendingQuestion.questionerId,
      responderId: action.playerId,
      question: next.pendingQuestion.text,
      answer: action.answer,
    };
    if (action.answer === 'yes') {
      if (next.yesLeft[action.playerId]! <= 0) return deny('YES 标记已用完');
      next.yesLeft[action.playerId]! -= 1;
    } else {
      if (next.noLeft[action.playerId]! <= 0) return deny('NO 标记已用完');
      next.noLeft[action.playerId]! -= 1;
    }
    next.answers.push(record);
    next.pendingQuestion = null;
    events.push({ type: 'answered', questionerId: record.questionerId, responderId: record.responderId, answer: record.answer });
    // 某玩家 YES 用完 或 达到问答上限 → 立即进入推理
    const yesExhausted = state.players.some((id) => next.yesLeft[id]! <= 0);
    if (yesExhausted || next.answers.length >= next.config.questionLimit) {
      enterDeduction(next, events, effects, ctx.random, ctx.now);
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 问答计时器兜底
  if (action.type === 'resolve_question') {
    if (next.phase !== 'question') return idempotent(state);
    enterDeduction(next, events, effects, ctx.random, ctx.now);
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 推理结束 → 投票
  if (action.type === 'end_deduction') {
    if (next.phase !== 'deduction') return idempotent(state);
    next.phase = 'vote';
    events.push({ type: 'vote_started' });
    effects.push(system('请投票选出你怀疑的狱警'));
    effects.push({
      type: 'schedule_timer',
      timerId: 'vote',
      deadlineAt: ctx.now + state.config.voteSeconds * 1000,
      action: { type: 'resolve_vote' },
    });
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票
  if (action.type === 'cast_vote') {
    if (next.phase !== 'vote') return deny('当前不能投票');
    if (!next.players.includes(action.playerId)) return deny('只有参局玩家可以操作');
    if (action.targetPlayerId === action.playerId) return deny('不能投自己');
    if (!next.players.includes(action.targetPlayerId)) return deny('目标不在本局');
    if (next.votes[action.playerId] !== undefined) return deny('你已经投过票');
    next.votes[action.playerId] = action.targetPlayerId;
    events.push({ type: 'vote_cast', playerId: action.playerId });
    if (next.players.every((id) => next.votes[id] !== undefined)) {
      settleVote(next, events, effects, next.votes);
    }
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票计时器兜底
  if (action.type === 'resolve_vote') {
    if (next.phase !== 'vote') return idempotent(state);
    settleVote(next, events, effects, next.votes);
    assertNightTestimonyInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 狱警猜罪（仅被票出的狱警）
  if (action.type === 'submit_guesses') {
    if (next.phase !== 'game_over') return deny('当前不能猜罪');
    if (next.wardenRevealed !== true || next.wardenGuesses !== null) return deny('当前不能猜罪');
    if (action.playerId !== next.wardenId) return deny('只有狱警可以猜罪');
    const inmates = next.players.filter((id) => id !== next.wardenId);
    if (Object.keys(action.guesses).length !== inmates.length) return deny('必须为每名囚犯猜一个罪行');
    for (const id of inmates) {
      if (!CRIMES.includes(action.guesses[id]!)) return deny('罪行无效');
    }
    settleGuesses(next, action.guesses);
    events.push({ type: 'game_finished', winners: [...next.winners] });
    effects.push(system(next.crimesAllGuessed ? '狱警猜中了全部罪行，单独获胜！' : '狱警猜错了，囚犯们获胜！'));
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
  // 狱警退出（player_forfeited 中局结束）后终局：允许 wardenId 不在剩余 players
  if (state.phase !== 'game_over' && !state.players.includes(state.wardenId)) throw new Error('狱警不在本局');
  const inmates = state.players.filter((id) => id !== state.wardenId);
  for (const id of inmates) {
    if (!CRIMES.includes(state.crimes[id]!)) throw new Error('罪行卡无效');
  }
  if (state.phase !== 'game_over' && Object.keys(state.crimes).length !== inmates.length) {
    throw new Error('罪行卡数量与囚犯数不一致');
  }
  for (const id of state.players) {
    if (!Number.isInteger(state.yesLeft[id]) || state.yesLeft[id]! < 0 || state.yesLeft[id]! > YES_COUNT) {
      throw new Error('YES 标记无效');
    }
    if (!Number.isInteger(state.noLeft[id]) || state.noLeft[id]! < 0 || state.noLeft[id]! > NO_COUNT) {
      throw new Error('NO 标记无效');
    }
  }
  for (const record of state.answers) {
    if (!state.players.includes(record.questionerId) || !state.players.includes(record.responderId)) {
      throw new Error('问答记录无效');
    }
    if (record.answer !== 'yes' && record.answer !== 'no') throw new Error('回答无效');
  }
  if (state.answers.length > state.config.questionLimit) throw new Error('问答数量超限');
  if (state.pendingQuestion !== null) {
    if (!state.players.includes(state.pendingQuestion.questionerId)) throw new Error('待答问题无效');
  }
  if (state.extraCrime !== null && !CRIMES.includes(state.extraCrime)) throw new Error('额外罪行卡无效');
  if (state.phase === 'vote' || state.phase === 'game_over') {
    if (state.accusedId !== null && !state.players.includes(state.accusedId)) throw new Error('被票者无效');
  }
  if (state.phase === 'game_over' && state.wardenRevealed !== null) {
    // 票出囚犯 → 狱警胜（winners 非空）；票出狱警 → 进入猜罪环节（winners 待填）
    if (state.wardenRevealed === true && state.wardenGuesses === null) {
      // 待猜罪中间态：允许
    } else if (state.winners.length === 0) {
      throw new Error('终局状态无效');
    }
    if (state.wardenGuesses !== null && state.crimesAllGuessed === null) {
      throw new Error('猜罪结果未填');
    }
  }
}
