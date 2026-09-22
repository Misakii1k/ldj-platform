import type { GameEffect } from '@ldj/shared';
import { parseGooseRelayAction, parseGooseRelayConfig } from './schemas.ts';
import {
  CHARACTERS,
  type CaseCard,
  type CharacterId,
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

/** 恶鹅数量：新版规则统一所有人数（5–9人）均为 1 只恶鹅 */
export function evilCountFor(_players: number): number {
  return 1;
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

/**
 * 抢头鹅超时。所有计时 helper 都顺便把截止时刻写进 state：客户端的倒计时环
 * 需要它，而 effect 里的 deadlineAt 只有运行时看得见，视图拿不到。两处必须同值。
 */
function claimHeadTimer(state: GooseRelayState, now: number): GameEffect {
  const deadlineAt = now + state.config.claimHeadSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'claim_head',
    deadlineAt,
    action: { type: 'claim_head_timeout' },
  };
}

function pickCardsTimer(state: GooseRelayState, now: number): GameEffect {
  const deadlineAt = now + state.config.pickCardsSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'pick_cards',
    deadlineAt,
    action: { type: 'pick_cards_timeout' },
  };
}

function relayTimer(state: GooseRelayState, now: number, index: number): GameEffect {
  const deadlineAt = now + state.config.relaySeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: `relay-${index}`,
    deadlineAt,
    action: { type: 'relay_timeout', index },
  };
}

/** 讨论阶段超时。 */
function discussionTimer(state: GooseRelayState, now: number): GameEffect {
  const deadlineAt = now + state.config.discussionSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'discussion',
    deadlineAt,
    action: { type: 'end_discussion' },
  };
}

/** 指认阶段超时。 */
function accuseTimer(state: GooseRelayState, now: number): GameEffect {
  const deadlineAt = now + state.config.accuseSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: `accuse-${state.currentAccuserIndex}`,
    deadlineAt,
    action: { type: 'accusation_timeout' },
  };
}

/** 投票阶段超时。 */
function voteTimer(state: GooseRelayState, now: number): GameEffect {
  const deadlineAt = now + state.config.voteSeconds * 1000;
  state.deadlineAt = deadlineAt;
  return {
    type: 'schedule_timer',
    timerId: 'vote',
    deadlineAt,
    action: { type: 'resolve_vote' },
  };
}

/** 案情卡是否一致 */
export function sameCase(a: CaseCard, b: CaseCard): boolean {
  return a.murderer === b.murderer && a.victim === b.victim;
}

/** 从全部特征鸭卡中随机抽取指定数量（默认 9 张）作为展示候选池 */
export function pickCandidateCards(random: GooseRandom, count = 9): CharacterId[] {
  const pool = [...CHARACTERS];
  // Fisher-Yates 抽样 count 张
  const selected: CharacterId[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = random.nextInt(0, pool.length);
    selected.push(pool.splice(idx, 1)[0]!);
  }
  return selected;
}

/** 随机生成案情卡（凶手与被害人不同，优先从候选池中选） */
export function buildRandomCase(random: GooseRandom, candidates: readonly CharacterId[] = CHARACTERS): CaseCard {
  const murderer = candidates[random.nextInt(0, candidates.length)]!;
  let victim = candidates[random.nextInt(0, candidates.length)]!;
  while (victim === murderer && candidates.length > 1) {
    victim = candidates[random.nextInt(0, candidates.length)]!;
  }
  return { murderer, victim };
}

export function createGooseRelayState(
  players: readonly string[],
  configInput: unknown = {},
  candidateCards: CharacterId[],
  evilGeese: string[],
  initialCase?: CaseCard,
  headPlayerId: string | null = null,
): GooseRelayState {
  if (players.length < 5 || players.length > 9) throw new Error('以鹅传鹅需要 5 至 9 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  if (candidateCards.length < 2) throw new Error('展示候选卡数量不足');
  if (new Set(candidateCards).size !== candidateCards.length) throw new Error('展示候选卡重复');
  if (evilGeese.length !== evilCountFor(players.length)) throw new Error('恶鹅数量无效');
  if (evilGeese.some((id) => !players.includes(id))) throw new Error('恶鹅名单无效');
  if (new Set(evilGeese).size !== evilGeese.length) throw new Error('恶鹅名单重复');

  const config = parseGooseRelayConfig(configInput);
  const defaultCase = initialCase ?? {
    murderer: candidateCards[0]!,
    victim: candidateCards[1]!,
  };

  const initialLineOrder = headPlayerId
    ? [headPlayerId, ...players.filter((p) => p !== headPlayerId)]
    : [...players];

  const state: GooseRelayState = {
    schemaVersion: 2,
    phase: headPlayerId ? 'pick_cards' : 'claim_head',
    players: [...players],
    config,
    headPlayerId,
    candidateCards: [...candidateCards],
    lineOrder: initialLineOrder,
    case: defaultCase,
    currentIndex: 0,
    currentAccuserIndex: players.length - 1,
    accusations: [],
    caseMatched: null,
    evilGeese: [...evilGeese],
    votes: {},
    winners: [],
    evilIdentified: null,
    deadlineAt: null,
  };
  assertGooseRelayInvariants(state);
  return state;
}

/** 结算：白鹅获胜条件为「指对案情」或「投票揪出恶鹅」；否则恶鹅胜 */
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
  // 并列最高票包含恶鹅（最高票玩家均为恶鹅）→ 投中
  const maxVotes = Math.max(0, ...state.players.map((id) => counts[id] ?? 0));
  const top = maxVotes === 0 ? [] : state.players.filter((id) => (counts[id] ?? 0) === maxVotes);
  const evilIdentified =
    top.length > 0 && top.every((id) => state.evilGeese.includes(id));
  
  // OR 胜负逻辑：只要指对案情 或 投出恶鹅，好人白鹅阵营即获胜！
  const whiteWin = caseMatched || evilIdentified;
  state.phase = 'game_over';
  // 终局不再计时：客户端倒计时环据此隐藏
  state.deadlineAt = null;
  state.caseMatched = caseMatched;
  state.evilIdentified = evilIdentified;
  state.winners = whiteWin
    ? state.players.filter((id) => !state.evilGeese.includes(id))
    : [...state.evilGeese];
  events.push({ type: 'settled', caseMatched, evilIdentified, winners: [...state.winners] });
  events.push({ type: 'game_finished', winners: [...state.winners] });
  effects.push(
    system(
      whiteWin
        ? caseMatched && evilIdentified
          ? '白鹅守住了案情真相，并成功揪出了潜伏的恶鹅！'
          : caseMatched
            ? '白鹅成功还原了案情真相，好人阵营获胜！'
            : '虽然案情未还原，但白鹅成功揪出了恶鹅，好人阵营获胜！'
        : '案情长眠，恶鹅也逃过了投票，恶鹅阵营获胜……',
    ),
  );
}

/** 推进下一棒接力表演 */
function advanceRelay(
  state: GooseRelayState,
  events: GooseRelayEvent[],
  effects: GameEffect[],
  now: number,
): void {
  const index = state.currentIndex;
  events.push({ type: 'relay_step_done', playerId: state.lineOrder[index]!, index });
  if (index === state.players.length - 1) {
    state.phase = 'discussion';
    events.push({ type: 'relay_finished' }, { type: 'discussion_started' });
    effects.push(system('动作传递完成，请全员进行线下讨论……'));
    if (state.config.discussionSeconds > 0) {
      effects.push(discussionTimer(state, now));
    }
    if (state.config.discussionSeconds === 0) {
      enterAccusation(state, events, effects, now);
    }
  } else {
    state.currentIndex = index + 1;
    const nextPlayer = state.lineOrder[index + 1]!;
    effects.push(
      system(`第 ${index + 2} 棒（${nextPlayer}）请开始动作传递，表演完成后点击「表演完成」`),
      relayTimer(state, now, index + 1),
    );
  }
}

/** 进入指认阶段：从队尾末棒起倒序向前指认 */
function enterAccusation(
  state: GooseRelayState,
  events: GooseRelayEvent[],
  effects: GameEffect[],
  now: number,
): void {
  state.phase = 'accusation';
  state.currentAccuserIndex = state.players.length - 1;
  events.push({ type: 'accusation_started' });
  const accuser = state.lineOrder[state.currentAccuserIndex]!;
  effects.push(system(`请末棒 ${accuser} 指认凶手鹅与受害鹅`));
  effects.push(accuseTimer(state, now));
}

/** 指认一步推进：指对 → 直接进入投票；全部指错 → 进入投票 */
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
    effects.push(system('有人指对了案情！请全员投票揪出恶鹅'));
    effects.push(voteTimer(state, now));
    return;
  }
  // 全员指完无人指对 → 依然进入揪恶投票（好人仍有机会通过投出恶鹅获胜！）
  if (state.currentAccuserIndex <= 0) {
    state.caseMatched = false;
    state.phase = 'vote';
    events.push({ type: 'vote_started' });
    effects.push(system('全员指认完毕，无人指对案情！请全员投票揪出恶鹅'));
    effects.push(voteTimer(state, now));
    return;
  }
  state.currentAccuserIndex -= 1;
  const accuser = state.lineOrder[state.currentAccuserIndex]!;
  effects.push(system(`请 ${accuser} 指认凶手鹅与受害鹅`));
  effects.push(accuseTimer(state, now));
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
    if (state.phase === 'claim_head') {
      return {
        ok: true,
        nextState: state,
        events: [{ type: 'claim_head_started' }],
        effects: [
          system('抢当头鹅开始！请点击「我要当头鹅」抢先确立身份'),
          claimHeadTimer(state, ctx.now),
        ],
      };
    }
    return idempotent(state);
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: GooseRelayEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      next.lineOrder = next.lineOrder.filter((p) => p !== id);
      next.evilGeese = next.evilGeese.filter((p) => p !== id);
      delete next.votes[id];
    }
    next.phase = 'game_over';
    next.deadlineAt = null;
    next.caseMatched = next.caseMatched ?? false;
    next.evilIdentified = false;
    next.winners = [...next.players];
    events.push({ type: 'settled', caseMatched: next.caseMatched, evilIdentified: false, winners: [...next.players] });
    events.push({ type: 'game_finished', winners: [...next.players] });
    effects.push(system('玩家退出，对局结束'));
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 抢当头鹅
  if (action.type === 'claim_head') {
    if (next.phase !== 'claim_head') return deny('当前不是抢头鹅阶段');
    if (!next.players.includes(action.playerId)) return deny('非局内玩家不能抢头鹅');
    if (next.headPlayerId !== null) return deny('已有玩家抢到头鹅');

    next.headPlayerId = action.playerId;
    // 重排队列：头鹅置首，其余人按原相对顺序排列
    next.lineOrder = [action.playerId, ...next.players.filter((p) => p !== action.playerId)];
    // 若恶鹅被抽中为头鹅，则重新将恶鹅分配给非头鹅
    if (next.evilGeese.includes(action.playerId)) {
      const otherPlayers = next.players.filter((p) => p !== action.playerId);
      next.evilGeese = [otherPlayers[0]!];
    }
    next.phase = 'pick_cards';
    events.push({ type: 'head_claimed', playerId: action.playerId });
    effects.push(
      system(`${action.playerId} 抢到了头鹅！请头鹅在展示区选择凶手鹅与受害鹅`),
      pickCardsTimer(next, ctx.now),
    );
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 抢头鹅超时
  if (action.type === 'claim_head_timeout') {
    if (next.phase !== 'claim_head') return idempotent(state);
    if (next.headPlayerId !== null) return idempotent(state);

    const defaultHead = next.players[0]!;
    next.headPlayerId = defaultHead;
    next.lineOrder = [defaultHead, ...next.players.filter((p) => p !== defaultHead)];
    if (next.evilGeese.includes(defaultHead)) {
      const otherPlayers = next.players.filter((p) => p !== defaultHead);
      next.evilGeese = [otherPlayers[0]!];
    }
    next.phase = 'pick_cards';
    events.push({ type: 'head_claimed', playerId: defaultHead });
    effects.push(
      system(`抢头鹅超时，系统指派 ${defaultHead} 为头鹅！请头鹅选择凶手鹅与受害鹅`),
      pickCardsTimer(next, ctx.now),
    );
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 头鹅选卡
  if (action.type === 'pick_cards') {
    if (next.phase !== 'pick_cards') return deny('当前不是头鹅选卡阶段');
    if (action.playerId !== next.headPlayerId) return deny('只有头鹅可以选卡');
    if (!next.candidateCards.includes(action.murderer) || !next.candidateCards.includes(action.victim)) {
      return deny('所选卡牌不在展示候选区中');
    }
    if (action.murderer === action.victim) return deny('凶手与受害人不能相同');

    next.case = { murderer: action.murderer, victim: action.victim };
    next.phase = 'relay';
    next.currentIndex = 0;
    events.push(
      { type: 'cards_picked', murderer: action.murderer, victim: action.victim },
      { type: 'relay_started' },
    );
    effects.push(
      system(`头鹅已确立案情真相！第 1 棒（${next.lineOrder[0]}）请开始表演，完成后点击「表演完成」`),
      relayTimer(next, ctx.now, 0),
    );
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 选卡超时
  if (action.type === 'pick_cards_timeout') {
    if (next.phase !== 'pick_cards') return idempotent(state);
    const m = next.candidateCards[0]!;
    const v = next.candidateCards[1]!;
    next.case = { murderer: m, victim: v };
    next.phase = 'relay';
    next.currentIndex = 0;
    events.push(
      { type: 'cards_picked', murderer: m, victim: v },
      { type: 'relay_started' },
    );
    effects.push(
      system(`选卡超时，系统自动确立案情！第 1 棒（${next.lineOrder[0]}）请开始表演，完成后点击「表演完成」`),
      relayTimer(next, ctx.now, 0),
    );
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 动作传递完成（每棒玩家点击确认）
  if (action.type === 'relay_done') {
    if (next.phase !== 'relay') return deny('当前不是动作传递阶段');
    const expectedPlayer = next.lineOrder[next.currentIndex];
    if (action.playerId !== expectedPlayer) return deny('还没轮到你表演');

    advanceRelay(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 传递超时
  if (action.type === 'relay_timeout') {
    if (action.index !== next.currentIndex) return idempotent(state);
    if (next.phase !== 'relay') return idempotent(state);

    advanceRelay(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 讨论结束：由头鹅（首位玩家）负责发起结束讨论并开启倒序指认
  if (action.type === 'end_discussion') {
    if (next.phase !== 'discussion') return idempotent(state);
    if (action.playerId && action.playerId !== next.headPlayerId) {
      return deny('只有头鹅可以结束讨论并开启指认');
    }
    enterAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 末棒倒序指认
  if (action.type === 'accuse') {
    if (next.phase !== 'accusation') return deny('当前不能指认');
    const index = next.lineOrder.indexOf(action.playerId);
    if (index !== next.currentAccuserIndex) return deny('还没轮到你指认');
    if (!next.candidateCards.includes(action.murderer) || !next.candidateCards.includes(action.victim)) {
      return deny('指认的卡牌必须在展示候选区中');
    }

    const guess: CaseCard = { murderer: action.murderer, victim: action.victim };
    const correct = guess.murderer === next.case.murderer && guess.victim === next.case.victim;
    next.accusations.push({ playerId: action.playerId, guess, correct });
    if (correct) {
      next.caseMatched = true;
      events.push({ type: 'accused', playerId: action.playerId, correct: true, index });
      events.push({ type: 'case_matched', playerId: action.playerId });
      effects.push(system(`${action.playerId} 指对了案情真相！`));
    } else {
      events.push({ type: 'accused', playerId: action.playerId, correct: false, index });
      effects.push(system(`${action.playerId} 指错了……`));
    }
    advanceAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 指认超时
  if (action.type === 'accusation_timeout') {
    if (next.phase !== 'accusation') return idempotent(state);
    const index = next.currentAccuserIndex;
    const accuser = next.lineOrder[index]!;
    next.accusations.push({
      playerId: accuser,
      guess: { murderer: next.candidateCards[0]!, victim: next.candidateCards[1]! },
      correct: false,
    });
    events.push({ type: 'accused', playerId: accuser, correct: false, index });
    advanceAccusation(next, events, effects, ctx.now);
    assertGooseRelayInvariants(next);
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
      settle(next, events, effects);
    }
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票结算
  if (action.type === 'resolve_vote') {
    if (next.phase !== 'vote') return idempotent(state);
    settle(next, events, effects);
    assertGooseRelayInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  return idempotent(state);
}

export function assertGooseRelayInvariants(state: GooseRelayState): void {
  if (state.schemaVersion !== 2) throw new Error('状态版本无效');
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

  if (state.phase !== 'game_over' && state.evilGeese.length !== evilCountFor(state.players.length)) {
    throw new Error('恶鹅数量无效');
  }
  if (state.headPlayerId !== null && state.evilGeese.includes(state.headPlayerId)) {
    throw new Error('头鹅不能是恶鹅');
  }
  if (state.candidateCards.length < 2) throw new Error('候选展示卡数量不足');
  if (new Set(state.candidateCards).size !== state.candidateCards.length) throw new Error('候选展示卡重复');

  if (state.case.murderer === state.case.victim) throw new Error('案情卡凶手被害人重复');
  if (!CHARACTERS.includes(state.case.murderer) || !CHARACTERS.includes(state.case.victim)) {
    throw new Error('案情卡角色无效');
  }

  if (state.currentIndex < 0 || state.currentIndex >= state.players.length) throw new Error('队列下标无效');
  if (
    state.phase === 'claim_head' ||
    state.phase === 'pick_cards' ||
    state.phase === 'relay' ||
    state.phase === 'discussion'
  ) {
    if (state.currentAccuserIndex !== state.players.length - 1) throw new Error('未到指认阶段时指认下标应为末位');
  }

  if (state.phase === 'claim_head' && state.headPlayerId !== null) {
    throw new Error('抢头鹅阶段头鹅应未确立');
  }
  if (state.phase === 'pick_cards' && state.headPlayerId === null) {
    throw new Error('选卡阶段应已确立头鹅');
  }

  if (state.phase === 'accusation') {
    if (state.currentAccuserIndex < 0 || state.currentAccuserIndex >= state.players.length) {
      throw new Error('指认下标无效');
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
    if (state.evilIdentified !== null || state.winners.length !== 0) {
      throw new Error('未终局时结算字段应为空');
    }
  }
}
