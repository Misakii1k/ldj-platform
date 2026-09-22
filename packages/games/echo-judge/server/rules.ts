import type { GameEffect } from '@ldj/shared';
import { parseEchoJudgeAction, parseEchoJudgeConfig } from './schemas.ts';
import { drawThreeTopicCards, TOPIC_DECK } from './questionDeck.ts';
import {
  type EchoJudgeAction,
  type EchoJudgeEvent,
  type EchoJudgeReduceResult,
  type EchoJudgeRole,
  type EchoJudgeState,
} from './types.ts';

export interface EchoRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

/** 触发词库（原创表达，不复制原版词卡） */
export const TRIGGER_WORDS = [
  '月亮', '面条', '雨伞', '抽屉', '薄荷', '风筝', '纽扣', '邮筒',
  '青苔', '铅笔', '窗帘', '冰块', '南瓜', '水壶', '篝火', '围巾',
  '指南针', '气球', '沙漏', '贝壳', '书签', '手电筒', '怀表', '望远镜',
] as const;

const deny = (message: string): EchoJudgeReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: EchoJudgeState): EchoJudgeReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

/**
 * 发言超时。顺便把截止时刻写进 state：客户端的倒计时环需要它，
 * 而 effect 里的 deadlineAt 只有运行时看得见，视图拿不到。两处必须同值。
 */
function scheduleAnswerTimeout(state: EchoJudgeState, speakerId: string, now: number): GameEffect {
  const deadlineAt = now + state.config.answerSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: `answer-${state.round}-${speakerId}`,
    deadlineAt,
    action: { type: 'finish_speaking', playerId: speakerId },
  };
}

/** 审判超时。同样顺便写 state.deadlineAt。 */
function scheduleJudgmentTimeout(state: EchoJudgeState, now: number): GameEffect {
  const deadlineAt = now + state.config.judgmentSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: `judgment-${state.round}`,
    deadlineAt,
    action: { type: 'resolve_round', playerId: state.judgeId },
  };
}

/** 开局/每轮初始化分配身份：除判官外默认初始化（可选伪人/人类），并为伪人派发触发词 */
export function assignRoles(
  players: readonly string[],
  judgeId: string,
  random: EchoRandom,
): { roles: Record<string, EchoJudgeRole>; triggerWords: Record<string, string> } {
  const candidates = random.shuffle(players.filter((id) => id !== judgeId));
  // 初始默认分配 1 名伪人（其余可在出题阶段自由切换），其余为人类
  const impostors = candidates.slice(0, 1);
  const roles: Record<string, EchoJudgeRole> = {};
  for (const id of players) {
    roles[id] = impostors.includes(id) ? 'impostor' : 'human';
  }
  const wordPool = random.shuffle([...TRIGGER_WORDS]);
  const triggerWords: Record<string, string> = {};
  impostors.forEach((id, index) => {
    triggerWords[id] = wordPool[index]!;
  });
  return { roles, triggerWords };
}

export function createEchoJudgeState(
  players: readonly string[],
  configInput: unknown = {},
  judgeId: string,
  question: string,
  roles: Record<string, EchoJudgeRole>,
  triggerWords: Record<string, string>,
): EchoJudgeState {
  if (players.length < 3 || players.length > 12) throw new Error('伪人测试需要 3 至 12 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseEchoJudgeConfig(configInput);
  if (!players.includes(judgeId)) throw new Error('判官不在本局');
  for (const id of players) {
    if (id === judgeId) {
      if (roles[id] !== 'human') throw new Error('判官不能是伪人');
    } else if (roles[id] !== 'human' && roles[id] !== 'impostor') {
      throw new Error('身份无效');
    }
  }
  const initialCards = TOPIC_DECK.slice(0, 3);
  const state: EchoJudgeState = {
    schemaVersion: 1,
    phase: 'judge_setup',
    players: [...players],
    config,
    round: 1,
    judgeId,
    question,
    topicCardId: null,
    pendingTopicChoices: [...initialCards],
    usedTopicCardIds: [],
    roles: { ...roles },
    triggerWords: { ...triggerWords },
    answerOrder: players.filter((id) => id !== judgeId),
    answers: {},
    currentSpeakerId: null,
    accusations: [],
    caughtImpostors: [],
    wrongAccusations: [],
    escapedImpostors: [],
    scores: Object.fromEntries(players.map((id) => [id, 0])),
    winners: [],
    deadlineAt: null,
  };
  assertEchoJudgeInvariants(state);
  return state;
}

/** 找下一位可当判官的玩家；每位玩家当一次判官后终局 */
function nextJudge(state: EchoJudgeState): string | null {
  if (state.round >= state.players.length) return null;
  const start = state.players.indexOf(state.judgeId);
  const nextCandidate = state.players[(start + 1) % state.players.length]!;
  return nextCandidate;
}

/** 结算本轮：判官多选指认 → 计分 → 终局或进入下一轮 */
function settleRound(
  state: EchoJudgeState,
  events: EchoJudgeEvent[],
  effects: GameEffect[],
  now: number,
  random?: EchoRandom,
): void {
  const targetIds = state.accusations;
  const actualImpostors = state.players.filter((id) => id !== state.judgeId && state.roles[id] === 'impostor');
  const caught = targetIds.filter((id) => state.roles[id] === 'impostor');
  const wrong = targetIds.filter((id) => state.roles[id] === 'human');
  const escaped = actualImpostors.filter((id) => !targetIds.includes(id));

  state.caughtImpostors = caught;
  state.wrongAccusations = wrong;
  state.escapedImpostors = escaped;

  // 1. 判官计分
  let judgeScoreDelta = 0;
  if (actualImpostors.length === 0 && targetIds.length === 0) {
    // 场上原本 0 个伪人且判官英明未指认任何人：判官 +1
    judgeScoreDelta += 1;
  } else {
    // 每抓对 1 个伪人 +1；每误抓 1 个人类扣分
    judgeScoreDelta += caught.length * 1 + wrong.length * state.config.judgeWrongPenalty;
  }
  state.scores[state.judgeId] = (state.scores[state.judgeId] ?? 0) + judgeScoreDelta;

  // 2. 被抓伪人扣分
  for (const id of caught) {
    state.scores[id] = (state.scores[id] ?? 0) - 1;
  }

  // 3. 成功隐藏逃脱的伪人每人 +2
  for (const id of escaped) {
    state.scores[id] = (state.scores[id] ?? 0) + 2;
  }

  events.push({
    type: 'accused',
    playerId: state.judgeId,
    targetPlayerIds: [...targetIds],
    caughtCount: caught.length,
    wrongCount: wrong.length,
  });
  events.push({ type: 'round_resolved', scores: { ...state.scores } });

  const msg = caught.length > 0
    ? `判官指认结束：成功抓出伪人（${caught.join('、')}）！${wrong.length > 0 ? `误抓了正常人类（${wrong.join('、')}）` : ''}`
    : wrong.length > 0
      ? `判官指认失败：误抓了正常人类（${wrong.join('、')}），伪人潜伏成功！`
      : actualImpostors.length === 0
        ? '场上无伪人，判官明察秋毫！'
        : '判官未指认任何人，伪人全员潜伏成功！';
  effects.push(system(msg));

  // 轮换到下一位判官；全部玩家轮流当过判官后终局
  const next = nextJudge(state);
  if (next === null) {
    state.phase = 'game_over';
    state.currentSpeakerId = null;
    // 终局不再计时：客户端倒计时环据此隐藏
    state.deadlineAt = null;
    const maxScore = Math.max(...Object.values(state.scores));
    state.winners = state.players.filter((id) => state.scores[id] === maxScore);
    events.push({ type: 'game_finished', winners: [...state.winners] });
    effects.push(system('所有玩家都担任过审判长，游戏结束！'));
    return;
  }

  state.round += 1;
  state.judgeId = next;
  state.phase = 'judge_setup';
  // 出题阶段不催审判长，倒计时环隐藏
  state.deadlineAt = null;
  state.question = '';
  state.topicCardId = null;
  state.answers = {};
  // 保持上轮指认战报直到新指认产生

  // 新一轮默认初始身份分配（非判官玩家可在出题阶段随时自由切换）
  const rnd = random ?? { nextInt: (min, _max) => min, shuffle: (arr) => [...arr] };
  const reassigned = assignRoles(state.players, next, rnd);
  state.roles = reassigned.roles;
  state.triggerWords = reassigned.triggerWords;

  state.pendingTopicChoices = drawThreeTopicCards(TOPIC_DECK, state.usedTopicCardIds, rnd);
  events.push({ type: 'round_started', round: state.round, judgeId: next });
  events.push({ type: 'topic_cards_offered', judgeId: next, cards: [...state.pendingTopicChoices] });
  effects.push(system(`第 ${state.round} 轮开始，轮到 ${next} 当审判长，请挑选题目卡`));
  void now;
}

export function reduceEchoJudgeState(
  state: EchoJudgeState,
  actionInput: EchoJudgeAction | unknown,
  ctx: { now: number; random?: EchoRandom },
): EchoJudgeReduceResult {
  let action: EchoJudgeAction;
  try {
    action = parseEchoJudgeAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  const random = ctx.random ?? {
    nextInt: (min, _max) => min,
    shuffle: (arr) => [...arr],
  };

  if (action.type === 'begin') {
    // 幂等：仅"全新未抽卡"的初始状态生效；重放/已开局/已终局一律原样返回，
    // 否则 at-least-once 重投会重抽题卡并改写出题选项
    if (state.phase !== 'judge_setup' || (state.pendingTopicChoices?.length ?? 0) > 0) {
      return idempotent(state);
    }
    const next = structuredClone(state);
    next.pendingTopicChoices = drawThreeTopicCards(TOPIC_DECK, next.usedTopicCardIds, random);
    return {
      ok: true,
      nextState: next,
      events: [
        { type: 'round_started', round: 1, judgeId: state.judgeId },
        { type: 'topic_cards_offered', judgeId: state.judgeId, cards: [...next.pendingTopicChoices] },
      ],
      effects: [system('伪人测试开始！审判长挑选题目，非审判长玩家可自由选择当人类或伪人')],
    };
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: EchoJudgeEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作）
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      delete next.answers[id];
      delete next.scores[id];
      delete next.roles[id];
      delete next.triggerWords[id];
      next.answerOrder = next.answerOrder.filter((p) => p !== id);
    }
    const remaining = next.players.length;
    if (remaining < 3) {
      next.phase = 'game_over';
      next.currentSpeakerId = null;
      next.winners = [...next.players];
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('玩家退出，对局结束'));
      assertEchoJudgeInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    if (!next.players.includes(next.judgeId)) {
      const newJudge = nextJudge(next);
      if (newJudge === null) {
        next.phase = 'game_over';
        next.currentSpeakerId = null;
        next.winners = [...next.players];
        events.push({ type: 'game_finished', winners: [...next.players] });
        effects.push(system('审判长退出，对局结束'));
        assertEchoJudgeInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }
      next.judgeId = newJudge;
      next.phase = 'judge_setup';
      next.question = '';
      next.topicCardId = null;
      next.answers = {};
      next.currentSpeakerId = null;
      next.accusations = [];
      next.pendingTopicChoices = drawThreeTopicCards(TOPIC_DECK, next.usedTopicCardIds, random);
      events.push({ type: 'round_started', round: next.round, judgeId: newJudge });
      events.push({ type: 'topic_cards_offered', judgeId: newJudge, cards: [...next.pendingTopicChoices] });
      effects.push(system(`审判长退出，轮到 ${newJudge} 担任审判长`));
    } else if (next.currentSpeakerId && !next.players.includes(next.currentSpeakerId)) {
      // 当前发言者退出：按"已作答数"推进下一个；若已无人可答，直接进入审判阶段，
      // 避免 currentSpeakerId=null 后 phase 停留在 answering 造成永久卡死
      if (next.phase === 'answering') {
        const answered = Object.keys(next.answers).length;
        if (answered >= next.answerOrder.length) {
          next.phase = 'judgment';
          next.currentSpeakerId = null;
          next.accusations = [];
          events.push({ type: 'judgment_started' });
          effects.push(system('发言者退出，所有剩余玩家已作答，审判长请指认伪人'));
          effects.push(scheduleJudgmentTimeout(next, ctx.now));
        } else {
          next.currentSpeakerId = next.answerOrder[answered] ?? null;
          if (next.currentSpeakerId) {
            events.push({ type: 'speaker_advanced', speakerId: next.currentSpeakerId });
          }
        }
      } else {
        const answered = Object.keys(next.answers).length;
        next.currentSpeakerId = next.answerOrder[answered] ?? null;
      }
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 自由选择当人类或伪人（仅在出题阶段允许非审判长玩家操作）
  if (action.type === 'choose_role') {
    if (next.phase !== 'judge_setup') return deny('只能在出题准备阶段自由选择身份');
    if (action.playerId === next.judgeId) return deny('审判长为主持人，不能选择伪人身份');
    if (!next.players.includes(action.playerId)) return deny('玩家不在本局');

    if (action.role === 'impostor') {
      next.roles[action.playerId] = 'impostor';
      if (!next.triggerWords[action.playerId]) {
        const usedWords = new Set(Object.values(next.triggerWords));
        const availableWords = TRIGGER_WORDS.filter((w) => !usedWords.has(w));
        const pool = availableWords.length > 0 ? availableWords : TRIGGER_WORDS;
        next.triggerWords[action.playerId] = pool[random.nextInt(0, pool.length)]!;
      }
    } else {
      next.roles[action.playerId] = 'human';
      delete next.triggerWords[action.playerId];
    }

    events.push({ type: 'role_chosen', playerId: action.playerId, role: action.role });
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 审判长 3 选 1 挑选题卡
  if (action.type === 'pick_topic_card') {
    if (action.playerId !== next.judgeId) return deny('只有审判长可以出题');
    if (next.phase !== 'judge_setup') return deny('当前不能出题');
    if (next.question !== '') return deny('本轮已出题');

    // 只能从本轮提供的 3 张题卡中选择（pendingTopicChoices 为 null 视为已选过）
    const card = next.pendingTopicChoices?.find((c) => c.id === action.cardId);
    if (!card) return deny('只能选择提供的 3 张题卡');

    next.question = card.text;
    next.topicCardId = card.id;
    next.usedTopicCardIds.push(card.id);
    next.pendingTopicChoices = null;
    next.phase = 'answering';
    next.answerOrder = next.players.filter((id) => id !== next.judgeId);
    next.answers = {};
    const firstSpeaker = next.answerOrder[0] ?? null;
    next.currentSpeakerId = firstSpeaker;

    events.push({ type: 'topic_card_picked', judgeId: next.judgeId, cardId: card.id, text: card.text });
    if (firstSpeaker) {
      events.push({ type: 'speaker_advanced', speakerId: firstSpeaker });
      effects.push(scheduleAnswerTimeout(next, firstSpeaker, ctx.now));
    }
    effects.push(system(`审判长已出题：「${card.text}」，请 ${firstSpeaker} 开始口头发言`));
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 自定义出题
  if (action.type === 'start_round') {
    if (action.playerId !== next.judgeId) return deny('只有审判长可以出题');
    if (next.phase !== 'judge_setup') return deny('当前不能出题');
    if (next.question !== '') return deny('本轮已出题');

    next.question = action.question;
    next.topicCardId = null;
    next.pendingTopicChoices = null;
    next.phase = 'answering';
    next.answerOrder = next.players.filter((id) => id !== next.judgeId);
    next.answers = {};
    const firstSpeaker = next.answerOrder[0] ?? null;
    next.currentSpeakerId = firstSpeaker;

    events.push({ type: 'topic_card_picked', judgeId: next.judgeId, cardId: '', text: action.question });
    if (firstSpeaker) {
      events.push({ type: 'speaker_advanced', speakerId: firstSpeaker });
      effects.push(scheduleAnswerTimeout(next, firstSpeaker, ctx.now));
    }
    effects.push(system(`审判长已出题：「${action.question}」，请 ${firstSpeaker} 开始口头发言`));
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 口头发言推进
  if (action.type === 'finish_speaking') {
    if (next.phase !== 'answering') return deny('当前非发言阶段');
    const speaker = next.currentSpeakerId;
    if (!speaker) return deny('当前无正在发言者');
    if (action.playerId !== speaker && action.playerId !== next.judgeId) {
      return deny('只有当前发言者或审判长可以推进发言');
    }
    next.answers[speaker] = '（口头发言完毕）';
    events.push({ type: 'answer_submitted', playerId: speaker });

    const answeredCount = Object.keys(next.answers).length;
    if (answeredCount >= next.answerOrder.length) {
      next.phase = 'judgment';
      next.currentSpeakerId = null;
      next.accusations = [];
      events.push({ type: 'judgment_started' });
      effects.push(system('全部发言完毕，审判长请指认潜伏的伪人（可多选）'));
      effects.push(scheduleJudgmentTimeout(next, ctx.now));
    } else {
      const nextSpeaker = next.answerOrder[answeredCount]!;
      next.currentSpeakerId = nextSpeaker;
      events.push({ type: 'speaker_advanced', speakerId: nextSpeaker });
      effects.push(scheduleAnswerTimeout(next, nextSpeaker, ctx.now));
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 提交文本回答
  if (action.type === 'submit_answer') {
    if (next.phase !== 'answering') return deny('当前不能回答');
    if (action.playerId === next.judgeId) return deny('审判长不能回答');
    if (next.answers[action.playerId] !== undefined) return deny('你已经回答过');
    const orderIndex = next.answerOrder.indexOf(action.playerId);
    const answered = Object.keys(next.answers).length;
    if (orderIndex !== answered) return deny('还没轮到你回答');
    next.answers[action.playerId] = action.text;
    events.push({ type: 'answer_submitted', playerId: action.playerId });

    const answeredCount = Object.keys(next.answers).length;
    if (answeredCount >= next.answerOrder.length) {
      next.phase = 'judgment';
      next.currentSpeakerId = null;
      next.accusations = [];
      events.push({ type: 'judgment_started' });
      effects.push(system('全部回答完毕，审判长请指认伪人'));
      effects.push(scheduleJudgmentTimeout(next, ctx.now));
    } else {
      const nextSpeaker = next.answerOrder[answeredCount]!;
      next.currentSpeakerId = nextSpeaker;
      events.push({ type: 'speaker_advanced', speakerId: nextSpeaker });
      effects.push(scheduleAnswerTimeout(next, nextSpeaker, ctx.now));
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 审判长多选指认
  if (action.type === 'accuse') {
    if (next.phase !== 'judgment') return deny('当前不能指认');
    if (action.playerId !== next.judgeId) return deny('只有审判长可以指认');
    if (action.targetPlayerIds.includes(next.judgeId)) return deny('不能指认审判长自己');
    if (action.targetPlayerIds.some((id) => !next.players.includes(id))) return deny('目标不在本局');
    if (new Set(action.targetPlayerIds).size !== action.targetPlayerIds.length) return deny('指认列表有重复');

    next.accusations = [...action.targetPlayerIds];
    settleRound(next, events, effects, ctx.now, random);
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 审判长指认超时兜底（按指认 0 人结算）
  if (action.type === 'resolve_round') {
    if (next.phase !== 'judgment') return idempotent(state);
    if (action.playerId !== next.judgeId) return idempotent(state);
    next.accusations = [];
    settleRound(next, events, effects, ctx.now, random);
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  return deny('动作无效');
}

export function assertEchoJudgeInvariants(state: EchoJudgeState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (
    (state.phase !== 'game_over' && (state.players.length < 3 || state.players.length > 12)) ||
    state.players.length < 1 ||
    new Set(state.players).size !== state.players.length
  ) {
    throw new Error('玩家列表无效');
  }
  if (state.phase !== 'game_over' && !state.players.includes(state.judgeId)) throw new Error('判官不在本局');
  if (state.question.length > 0 && state.question.length > 200) throw new Error('题目过长');
  if (state.phase !== 'game_over' && state.roles[state.judgeId] !== 'human') throw new Error('判官不能是伪人');
  for (const id of state.players) {
    if (state.roles[id] !== 'human' && state.roles[id] !== 'impostor') throw new Error('身份无效');
  }
  if (state.phase === 'answering') {
    if (state.answerOrder.length !== state.players.length - 1) throw new Error('回答顺序无效');
    if (state.answerOrder.some((id) => !state.players.includes(id) || id === state.judgeId)) {
      throw new Error('回答顺序含判官或局外人');
    }
  }
  for (const [id, text] of Object.entries(state.answers)) {
    if (!state.players.includes(id)) throw new Error('回答者不在本局');
    if (typeof text !== 'string') throw new Error('回答无效');
  }
  if (state.accusations.some((id) => !state.players.includes(id))) {
    throw new Error('指认目标无效');
  }
  if (state.phase === 'judgment' && state.accusations.includes(state.judgeId)) {
    throw new Error('指认目标无效');
  }
  for (const id of state.players) {
    if (!Number.isInteger(state.scores[id])) throw new Error('分数无效');
  }
}
