import type { GameEffect } from '@ldj/shared';
import { parseGooseRelayAction, parseGooseRelayConfig } from './schemas.ts';
import {
  CHARACTERS,
  SCENES,
  TOOLS,
  type CaseCard,
  type GooseRelayAction,
  type GooseRelayEvent,
  type GooseRelayReduceResult,
  type GooseRelayState,
  type ResolvedGooseRelayConfig,
} from './types.ts';

/** 掷骰/抽卡随机源（与 GameContext.random 的 nextInt 同形，便于测试注入） */
export interface GooseRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
}

/** 恶鹅数量：5–6 人 1 只、7–9 人 2 只（原版推广版推断，C 级；可配置见 config） */
export function evilCountFor(players: number): number {
  return players >= 7 ? 2 : 1;
}

const deny = (message: string): GooseRelayReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: GooseRelayState): GooseRelayReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

function relayTimer(config: ResolvedGooseRelayConfig, now: number, index: number): GameEffect {
  return {
    type: 'schedule_timer',
    timerId: `relay-${index}`,
    deadlineAt: now + config.relaySeconds * 1000,
    action: { type: 'relay_timeout', index },
  };
}

/** 案情卡是否逐字段一致（已由 accuse 中凶手/受害比对取代，保留供测试引用） */
export function sameCase(a: CaseCard, b: CaseCard): boolean {
  return a.murderer === b.murderer && a.victim === b.victim && a.tool === b.tool && a.scene === b.scene;
}

/** 随机生成案情卡（凶手与被害人不同） */
export function buildRandomCase(random: GooseRandom): CaseCard {
  const murderer = CHARACTERS[random.nextInt(0, CHARACTERS.length)]!;
  let victim = CHARACTERS[random.nextInt(0, CHARACTERS.length)]!;
  while (victim === murderer) {
    victim = CHARACTERS[random.nextInt(0, CHARACTERS.length)]!;
  }
  return {
    murderer,
    victim,
    tool: TOOLS[random.nextInt(0, TOOLS.length)]!,
    scene: SCENES[random.nextInt(0, SCENES.length)]!,
  };
}

export function createGooseRelayState(
  players: readonly string[],
  configInput: unknown = {},
  caseCard: CaseCard,
  evilGeese: string[],
): GooseRelayState {
  if (players.length < 5 || players.length > 9) throw new Error('以鹅传鹅需要 5 至 9 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseGooseRelayConfig(configInput);
  const head = players[0]!;
  if (evilGeese.length !== evilCountFor(players.length)) throw new Error('恶鹅数量无效');
  if (evilGeese.some((id) => !players.includes(id) || id === head)) throw new Error('恶鹅名单无效');
  if (new Set(evilGeese).size !== evilGeese.length) throw new Error('恶鹅名单重复');
  const state: GooseRelayState = {
    schemaVersion: 1,
    phase: 'case_view',
    players: [...players],
    lineOrder: [...players],
    config,
    case: { ...caseCard },
    transmissions: players.map(() => null),
    currentIndex: 0,
    currentAccuserIndex: players.length - 1,
    accusations: [],
    caseMatched: null,
    evilGeese: [...evilGeese],
    votes: {},
    winners: [],
    evilIdentified: null,
  };
  assertGooseRelayInvariants(state);
  return state;
}

/** 结算：无人指对 → 恶鹅胜；指对且投中恶鹅 → 头鹅+好鹅胜；投错 → 恶鹅胜 */
function settle(
  state: GooseRelayState,
  events: GooseRelayEvent[],
  effects: GameEffect[],
): void {
  const caseMatched = state.caseMatched === true;
  const counts: Record<string, number> = {};
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  // 并列最高票均为恶鹅 → 投中（否则投错；无人投票视为未投中）
  const maxVotes = Math.max(0, ...state.players.map((id) => counts[id] ?? 0));
  const top = maxVotes === 0 ? [] : state.players.filter((id) => (counts[id] ?? 0) === maxVotes);
  const evilIdentified =
    top.length > 0 && top.every((id) => state.evilGeese.includes(id));
  const whiteWin = caseMatched && evilIdentified;
  state.phase = 'game_over';
  state.caseMatched = caseMatched;
  state.evilIdentified = evilIdentified;
  state.winners = whiteWin
    ? state.players.filter((id) => !state.evilGeese.includes(id))
    : [...state.evilGeese];
  events.push({ type: 'settled', caseMatched, evilIdentified, winners: [...state.winners] });
  events.push({ type: 'game_finished', winners: [...state.winners] });
  effects.push(
    system(
      !caseMatched
        ? '真相长眠，恶鹅获胜……'
        : whiteWin
          ? '白鹅守住了案情，并揪出了恶鹅！'
          : '案情被指对，但恶鹅逃过了投票！',
    ),
  );
}

/** 提交/超时后的队列推进（传递阶段） */
function advanceRelay(state: GooseRelayState, events: GooseRelayEvent[], effects: GameEffect[], now: number): void {
  const index = state.currentIndex;
  const submitted = state.transmissions[index];
  if (submitted === null) throw new Error('INTERNAL: 当前节点未提交');
  // 头鹅（下标 0）读卡提交后进入正式传递阶段
  if (index === 0 && state.phase === 'case_view') state.phase = 'relay';
  events.push({ type: 'transmitted', playerId: state.lineOrder[index]!, index });
  if (index === state.players.length - 1) {
    state.phase = 'discussion';
    events.push({ type: 'relay_finished' }, { type: 'discussion_started' });
    effects.push(system('传递完成，演绎链公开，请讨论……'));
    if (state.config.discussionSeconds > 0) {
      effects.push({
        type: 'schedule_timer',
        timerId: 'discussion',
        deadlineAt: now + state.config.discussionSeconds * 1000,
        action: { type: 'end_discussion' },
      });
    }
    // discussionSeconds = 0：立即进入指认阶段
    if (state.config.discussionSeconds === 0) {
      enterAccusation(state, events, effects, now);
    }
  } else {
    state.currentIndex = index + 1;
    effects.push(relayTimer(state.config, now, index + 1));
  }
}

/** 进入指认阶段：从末位起逐一指认（线下为口头，App 推进/计时） */
function enterAccusation(
  state: GooseRelayState,
  events: GooseRelayEvent[],
  effects: GameEffect[],
  now: number,
): void {
  state.phase = 'accusation';
  state.currentAccuserIndex = state.players.length - 1;
  events.push({ type: 'accusation_started' });
  effects.push(system(`请 ${state.lineOrder[state.currentAccuserIndex]} 指认凶手鹅与受害鹅`));
  effects.push({
    type: 'schedule_timer',
    timerId: `accuse-${state.currentAccuserIndex}`,
    deadlineAt: now + state.config.accuseSeconds * 1000,
    action: { type: 'accusation_timeout' },
  });
}

/** 指认一步：公开对比；指对 → 进入投票；否则下一个（倒序） */
function advanceAccusation(
  state: GooseRelayState,
  events: GooseRelayEvent[],
  effects: GameEffect[],
  now: number,
): void {
  if (state.phase !== 'accusation') return;
  if (state.caseMatched === true) {
    // 已指对 → 进入投票
    state.phase = 'vote';
    events.push({ type: 'vote_started' });
    effects.push(system('有人指对了案情！请投票揪出恶鹅'));
    effects.push({
      type: 'schedule_timer',
      timerId: 'vote',
      deadlineAt: now + state.config.voteSeconds * 1000,
      action: { type: 'resolve_vote' },
    });
    return;
  }
  // 无人指对 → 下一个（倒序）；全部指完仍无人指对 → 恶鹅胜
  if (state.currentAccuserIndex <= 0) {
    state.caseMatched = false;
    settle(state, events, effects);
    return;
  }
  state.currentAccuserIndex -= 1;
  effects.push(system(`请 ${state.lineOrder[state.currentAccuserIndex]} 指认凶手鹅与受害鹅`));
  effects.push({
    type: 'schedule_timer',
    timerId: `accuse-${state.currentAccuserIndex}`,
    deadlineAt: now + state.config.accuseSeconds * 1000,
    action: { type: 'accusation_timeout' },
  });
}

export function reduceGooseRelayState(
  state: GooseRelayState,
  actionInput: GooseRelayAction | unknown,
  ctx: { now: number },
): GooseRelayReduceResult {
  let action: GooseRelayAction;
  try {
    action = parseGooseRelayAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  if (action.type === 'begin') {
    return {
      ok: true,
      nextState: state,
      events: [{ type: 'case_view_started', headPlayerId: state.lineOrder[0]! }],
      effects: [system('头鹅正在阅读案情卡……'), relayTimer(state.config, ctx.now, 0)],
    };
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: GooseRelayEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作，§6.7）：从局内移除；玩家不足则终局（剩余玩家获胜）
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      const index = next.lineOrder.indexOf(id);
      next.players = next.players.filter((p) => p !== id);
      next.lineOrder = next.lineOrder.filter((p) => p !== id);
      next.evilGeese = next.evilGeese.filter((p) => p !== id);
      if (index >= 0) next.transmissions.splice(index, 1);
      delete next.votes[id];
    }
    // 以鹅传鹅依赖完整传递队列：任一玩家退出即中局结束（剩余玩家获胜）
    next.phase = 'game_over';
    next.caseMatched = next.caseMatched ?? false;
    next.evilIdentified = false;
    next.winners = [...next.players];
    events.push({ type: 'settled', caseMatched: next.caseMatched, evilIdentified: false, winners: [...next.players] });
    events.push({ type: 'game_finished', winners: [...next.players] });
    effects.push(system('玩家退出，对局结束'));
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  if (action.type === 'transmit') {
    const index = next.lineOrder.indexOf(action.playerId);
    if (index !== next.currentIndex) return deny('还没轮到你演绎');
    if (next.transmissions[index] !== null) return deny('你已经提交过演绎');
    next.transmissions[index] = { ...action.case };
    advanceRelay(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  if (action.type === 'relay_timeout') {
    if (action.index !== next.currentIndex) return idempotent(state);
    if (next.transmissions[action.index] !== null) return idempotent(state);
    // 超时自动「忠实复述」：头鹅用原始案情，其余用上一位演绎
    next.transmissions[action.index] =
      action.index === 0 ? { ...next.case } : { ...next.transmissions[action.index - 1]! };
    advanceRelay(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  if (action.type === 'end_discussion') {
    if (next.phase !== 'discussion') return idempotent(state);
    enterAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 从末位起逐一指认
  if (action.type === 'accuse') {
    if (next.phase !== 'accusation') return deny('当前不能指认');
    const index = next.lineOrder.indexOf(action.playerId);
    if (index !== next.currentAccuserIndex) return deny('还没轮到你指认');
    const guess: CaseCard = {
      murderer: action.murderer,
      victim: action.victim,
      tool: next.case.tool,
      scene: next.case.scene,
    };
    const correct = guess.murderer === next.case.murderer && guess.victim === next.case.victim;
    next.accusations.push({ playerId: action.playerId, guess, correct });
    if (correct) {
      next.caseMatched = true;
      events.push({ type: 'accused', playerId: action.playerId, correct: true, index });
      events.push({ type: 'case_matched', playerId: action.playerId });
      effects.push(system(`${action.playerId} 指对了案情！`));
    } else {
      events.push({ type: 'accused', playerId: action.playerId, correct: false, index });
      effects.push(system(`${action.playerId} 指错了……`));
    }
    advanceAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 指认超时兜底：视为指错，推进下一个
  if (action.type === 'accusation_timeout') {
    if (next.phase !== 'accusation') return idempotent(state);
    const index = next.currentAccuserIndex;
    next.accusations.push({
      playerId: next.lineOrder[index]!,
      guess: { murderer: next.case.murderer, victim: next.case.victim, tool: next.case.tool, scene: next.case.scene },
      correct: false,
    });
    events.push({ type: 'accused', playerId: next.lineOrder[index]!, correct: false, index });
    advanceAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  if (action.type === 'cast_vote') {
    if (next.phase !== 'vote') return deny('当前不能投票');
    if (!next.players.includes(action.playerId)) return deny('只有参局玩家可以操作');
    if (action.targetPlayerId === action.playerId) return deny('不能投自己');
    if (!next.players.includes(action.targetPlayerId)) return deny('目标不在本局');
    if (next.votes[action.playerId] !== undefined) return deny('你已经投过票');
    next.votes[action.playerId] = action.targetPlayerId;
    events.push({ type: 'vote_cast', playerId: action.playerId });
    if (next.players.every((id) => next.votes[id] !== undefined)) {
      settle(next, events, effects);
    }
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // resolve_vote（计时器或兜底）
  if (next.phase !== 'vote') return idempotent(state);
  settle(next, events, effects);
  assertGooseRelayInvariants(next);
  return { ok: true, nextState: next, events, effects };
}

export function assertGooseRelayInvariants(state: GooseRelayState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (
    (state.phase !== 'game_over' && (state.players.length < 5 || state.players.length > 9)) ||
    state.players.length < 1 ||
    new Set(state.players).size !== state.players.length
  ) {
    throw new Error('玩家列表无效');
  }
  if (state.lineOrder.length !== state.players.length || state.lineOrder.some((id) => !state.players.includes(id))) {
    throw new Error('传递队列无效');
  }
  if (new Set(state.lineOrder).size !== state.players.length) throw new Error('传递队列重复');
  const head = state.lineOrder[0];
  if (state.phase !== 'game_over' && state.evilGeese.length !== evilCountFor(state.players.length)) {
    throw new Error('恶鹅数量无效');
  }
  if (state.evilGeese.some((id) => !state.players.includes(id) || id === head)) throw new Error('恶鹅名单无效');
  if (state.case.murderer === state.case.victim) throw new Error('案情卡凶手被害人重复');
  if (!CHARACTERS.includes(state.case.murderer) || !CHARACTERS.includes(state.case.victim)) throw new Error('案情卡角色无效');
  if (!TOOLS.includes(state.case.tool) || !SCENES.includes(state.case.scene)) throw new Error('案情卡组件无效');
  if (state.transmissions.length !== state.players.length) throw new Error('演绎链长度无效');
  if (state.currentIndex < 0 || state.currentIndex >= state.players.length) throw new Error('队列下标无效');
  if (
    state.phase === 'case_view' ||
    state.phase === 'relay' ||
    state.phase === 'discussion'
  ) {
    if (state.currentAccuserIndex !== state.players.length - 1) throw new Error('未到指认阶段时指认下标应为末位');
  }
  if (state.phase === 'case_view' && (state.currentIndex !== 0 || state.transmissions[0] !== null)) {
    throw new Error('读卡阶段状态无效');
  }
  if (state.phase === 'relay' && (state.currentIndex < 1 || state.transmissions[state.currentIndex] !== null)) {
    throw new Error('传递阶段状态无效');
  }
  if (
    (state.phase === 'discussion' || state.phase === 'accusation' || state.phase === 'vote') &&
    state.transmissions.some((t) => t === null)
  ) {
    throw new Error('讨论阶段演绎链应完整');
  }
  if (state.phase === 'accusation') {
    if (state.currentAccuserIndex < 0 || state.currentAccuserIndex >= state.players.length) {
      throw new Error('指认下标无效');
    }
    if (state.caseMatched === true && state.accusations.length === 0) {
      throw new Error('指对但无指认记录');
    }
  }
  if (state.phase === 'vote') {
    if (state.caseMatched !== true || state.accusations.length === 0) {
      throw new Error('投票阶段应已指对');
    }
  }
  for (const [id, target] of Object.entries(state.votes)) {
    if (!state.players.includes(id) || !state.players.includes(target)) throw new Error('投票无效');
  }
  if (state.phase === 'game_over') {
    if (state.caseMatched === null || state.evilIdentified === null || state.winners.length === 0) {
      throw new Error('终局状态无效');
    }
  } else {
    // vote 阶段允许 caseMatched=true（已指对）；evilIdentified/winners 只在终局填写
    if (state.evilIdentified !== null || state.winners.length !== 0) {
      throw new Error('未终局时结算字段应为空');
    }
  }
}
