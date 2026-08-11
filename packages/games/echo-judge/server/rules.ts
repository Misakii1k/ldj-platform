import type { GameEffect } from '@ldj/shared';
import { parseEchoJudgeAction, parseEchoJudgeConfig } from './schemas.ts';
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

/** 伪人数量：3–4 人 1、5–8 人 2、9–12 人 3（平台裁定，原版比例未确认） */
export function impostorCountFor(players: number): number {
  if (players <= 4) return 1;
  if (players <= 8) return 2;
  return 3;
}

/** 触发词库（原创表达，不复制原版词卡） */
export const TRIGGER_WORDS = [
  '月亮', '面条', '雨伞', '抽屉', '薄荷', '风筝', '纽扣', '邮筒',
  '青苔', '铅笔', '窗帘', '冰块', '南瓜', '水壶', '篝火', '围巾',
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

/** 伪人数量与触发词分配（随机取伪人，每人一个不重复触发词） */
export function assignRoles(
  players: readonly string[],
  judgeId: string,
  random: EchoRandom,
): { roles: Record<string, EchoJudgeRole>; triggerWords: Record<string, string> } {
  const candidates = random.shuffle(players.filter((id) => id !== judgeId));
  const count = impostorCountFor(players.length);
  const impostors = candidates.slice(0, count);
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
  // 创建时总是 judge_setup 阶段，题目可空（由 start_round 出题后置非空）
  const impostors = players.filter((id) => roles[id] === 'impostor');
  if (impostors.length !== impostorCountFor(players.length)) throw new Error('伪人数量无效');
  for (const id of players) {
    if (id === judgeId) {
      if (roles[id] !== 'human') throw new Error('判官不能是伪人');
    } else if (roles[id] !== 'human' && roles[id] !== 'impostor') {
      throw new Error('身份无效');
    }
  }
  const state: EchoJudgeState = {
    schemaVersion: 1,
    phase: 'judge_setup',
    players: [...players],
    config,
    round: 1,
    judgeId,
    question,
    roles: { ...roles },
    triggerWords: { ...triggerWords },
    answerOrder: players.filter((id) => id !== judgeId),
    answers: {},
    accusation: null,
    caughtImpostor: null,
    scores: Object.fromEntries(players.map((id) => [id, 0])),
    winners: [],
  };
  assertEchoJudgeInvariants(state);
  return state;
}

/** 找下一位可当判官的人类玩家（跳过伪人与已当过判官者）；无则返回 null（终局） */
function nextJudge(state: EchoJudgeState): string | null {
  const humanCount = state.players.filter((id) => state.roles[id] === 'human').length;
  // 每轮由不同人类玩家当判官：已进行 round 轮（含本轮）
  if (state.round >= humanCount) return null;
  const start = state.players.indexOf(state.judgeId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(start + offset) % state.players.length]!;
    if (state.roles[candidate] === 'human') return candidate;
  }
  return null;
}

/** 结算本轮：判官指认 → 计分 → 终局或进入下一轮 */
function settleRound(
  state: EchoJudgeState,
  events: EchoJudgeEvent[],
  effects: GameEffect[],
  now: number,
): void {
  const accused = state.accusation!;
  const caught = state.roles[accused] === 'impostor';
  state.caughtImpostor = caught;
  // 计分：判官抓对 +1 / 抓错 penalty；被抓伪人 −1；隐藏成功伪人 +2
  state.scores[state.judgeId] = (state.scores[state.judgeId] ?? 0) + (caught ? 1 : state.config.judgeWrongPenalty);
  if (caught) {
    state.scores[accused] = (state.scores[accused] ?? 0) - 1;
  } else {
    for (const id of state.players) {
      if (id !== state.judgeId && state.roles[id] === 'impostor') {
        state.scores[id] = (state.scores[id] ?? 0) + 2;
      }
    }
  }
  events.push({ type: 'accused', playerId: accused, caughtImpostor: caught });
  events.push({ type: 'round_resolved', scores: { ...state.scores } });
  effects.push(system(caught ? `判官抓对了！${accused} 是伪人` : `判官抓错了，伪人隐藏成功`));

  // 轮换到下一名人类玩家当判官；无更多人类判官则终局
  const next = nextJudge(state);
  if (next === null) {
    state.phase = 'game_over';
    const maxScore = Math.max(...Object.values(state.scores));
    state.winners = state.players.filter((id) => state.scores[id] === maxScore);
    events.push({ type: 'game_finished', winners: [...state.winners] });
    effects.push(system('所有玩家都当过判官，游戏结束！'));
    return;
  }
  state.round += 1;
  state.judgeId = next;
  state.phase = 'judge_setup';
  state.question = '';
  state.answers = {};
  state.accusation = null;
  // caughtImpostor 保留为最近一轮结果（供 UI 展示），不随轮换清空
  events.push({ type: 'round_started', round: state.round, judgeId: next });
  effects.push(system(`轮到 ${next} 当判官，请出题`));
  void now;
}

export function reduceEchoJudgeState(
  state: EchoJudgeState,
  actionInput: EchoJudgeAction | unknown,
  ctx: { now: number },
): EchoJudgeReduceResult {
  let action: EchoJudgeAction;
  try {
    action = parseEchoJudgeAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  if (action.type === 'begin') {
    return {
      ok: true,
      nextState: state,
      events: [{ type: 'round_started', round: 1, judgeId: state.judgeId }],
      effects: [system('伪人测试开始！判官出题，其余玩家依次回答')],
    };
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: EchoJudgeEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作，§6.7 席位保留期）：从局内移除；无足够玩家则中局结束
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
    // 剩余玩家不足 3 人或判官已退出且无可轮换判官 → 终局（其余玩家获胜）
    const remaining = next.players.length;
    if (remaining < 3) {
      next.phase = 'game_over';
      next.winners = [...next.players];
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('玩家退出，对局结束'));
      assertEchoJudgeInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    if (!next.players.includes(next.judgeId)) {
      // 判官退出：轮换到下一名人类判官；无可轮换则终局
      const newJudge = nextJudge(next);
      if (newJudge === null) {
        next.phase = 'game_over';
        next.winners = [...next.players];
        events.push({ type: 'game_finished', winners: [...next.players] });
        effects.push(system('判官退出，对局结束'));
        assertEchoJudgeInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }
      next.judgeId = newJudge;
      next.phase = 'judge_setup';
      next.question = '';
      next.answers = {};
      next.accusation = null;
      events.push({ type: 'round_started', round: next.round, judgeId: newJudge });
      effects.push(system(`判官退出，轮到 ${newJudge} 当判官`));
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 判官出题（judge_setup 阶段）
  if (action.type === 'start_round') {
    if (action.playerId !== next.judgeId) return deny('只有判官可以出题');
    if (next.phase !== 'judge_setup') return deny('当前不能出题');
    if (next.question !== '') return deny('本轮已出题');
    next.question = action.question;
    next.phase = 'answering';
    next.answerOrder = next.players.filter((id) => id !== next.judgeId);
    next.answers = {};
    events.push({ type: 'roles_assigned' });
    effects.push(system(`题目：${action.question}——请非判官玩家依次回答`));
    const first = next.answerOrder[0];
    if (first) {
      effects.push({
        type: 'schedule_timer',
        timerId: `answer-${next.round}-${first}`,
        deadlineAt: ctx.now + state.config.answerSeconds * 1000,
        action: { type: 'submit_answer', playerId: first, text: '（超时未答）' },
      });
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 依次回答
  if (action.type === 'submit_answer') {
    if (next.phase !== 'answering') return deny('当前不能回答');
    if (action.playerId === next.judgeId) return deny('判官不能回答');
    if (next.answers[action.playerId] !== undefined) return deny('你已经回答过');
    const orderIndex = next.answerOrder.indexOf(action.playerId);
    const answered = Object.keys(next.answers).length;
    if (orderIndex !== answered) return deny('还没轮到你回答');
    next.answers[action.playerId] = action.text;
    events.push({ type: 'answer_submitted', playerId: action.playerId });
    if (next.answerOrder.every((id) => next.answers[id] !== undefined)) {
      next.phase = 'judgment';
      events.push({ type: 'judgment_started' });
      effects.push(system('全部回答完毕，判官请指认一名伪人'));
      effects.push({
        type: 'schedule_timer',
        timerId: `judgment-${next.round}`,
        deadlineAt: ctx.now + state.config.judgmentSeconds * 1000,
        action: { type: 'resolve_round', playerId: next.judgeId },
      });
    } else {
      effects.push({
        type: 'schedule_timer',
        timerId: `answer-${next.round}-${action.playerId}`,
        deadlineAt: ctx.now + state.config.answerSeconds * 1000,
        action: { type: 'submit_answer', playerId: action.playerId, text: '（超时未答）' },
      });
    }
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 判官指认
  if (action.type === 'accuse') {
    if (next.phase !== 'judgment') return deny('当前不能指认');
    if (action.playerId !== next.judgeId) return deny('只有判官可以指认');
    if (action.targetPlayerId === next.judgeId) return deny('不能指认自己');
    if (!next.players.includes(action.targetPlayerId)) return deny('目标不在本局');
    if (next.accusation !== null) return deny('本局已指认');
    next.accusation = action.targetPlayerId;
    settleRound(next, events, effects, ctx.now);
    assertEchoJudgeInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 判官指认超时兜底：自动跳过（不计分，直接下一轮）
  if (action.type === 'resolve_round') {
    if (next.phase !== 'judgment') return idempotent(state);
    if (action.playerId !== next.judgeId) return idempotent(state);
    // 判官未指认：伪人全部隐藏成功 +2，判官不扣分
    next.caughtImpostor = false;
    for (const id of next.players) {
      if (id !== next.judgeId && next.roles[id] === 'impostor') {
        next.scores[id] = (next.scores[id] ?? 0) + 2;
      }
    }
    events.push({ type: 'accused', playerId: '', caughtImpostor: false });
    events.push({ type: 'round_resolved', scores: { ...next.scores } });
    effects.push(system('判官超时未指认，伪人全部隐藏成功'));
    const nextJudgeId = nextJudge(next);
    if (nextJudgeId === null) {
      next.phase = 'game_over';
      const maxScore = Math.max(...Object.values(next.scores));
      next.winners = next.players.filter((id) => next.scores[id] === maxScore);
      events.push({ type: 'game_finished', winners: [...next.winners] });
      effects.push(system('所有玩家都当过判官，游戏结束！'));
    } else {
      next.round += 1;
      next.judgeId = nextJudgeId;
      next.phase = 'judge_setup';
      next.question = '';
      next.answers = {};
      next.accusation = null;
      // caughtImpostor 保留为最近一轮结果
      events.push({ type: 'round_started', round: next.round, judgeId: nextJudgeId });
      effects.push(system(`轮到 ${nextJudgeId} 当判官，请出题`));
    }
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
  // 玩家退出（player_forfeited）后终局：判官/伪人比例可因缩员不匹配
  if (state.phase !== 'game_over' && !state.players.includes(state.judgeId)) throw new Error('判官不在本局');
  if (state.question.length > 0 && state.question.length > 200) throw new Error('题目过长');
  const impostors = state.players.filter((id) => state.roles[id] === 'impostor');
  if (state.phase !== 'game_over' && impostors.length !== impostorCountFor(state.players.length)) throw new Error('伪人数量无效');
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
  if (state.accusation !== null && !state.players.includes(state.accusation)) throw new Error('指认目标无效');
  for (const id of state.players) {
    if (!Number.isInteger(state.scores[id])) throw new Error('分数无效');
  }
}
