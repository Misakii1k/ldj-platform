import type { GameEffect } from '@ldj/shared';
import { parseBellClashAction, parseBellClashConfig } from './schemas.ts';
import {
  COLORS,
  type BellClashAction,
  type BellClashCard,
  type BellClashEvent,
  type BellClashReduceResult,
  type BellClashState,
  type CardColor,
} from './types.ts';

export interface BellRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

/** 原创短语池（不复制原版牌表文案） */
const PHRASES: Record<CardColor, string[]> = {
  red: ['大声说「好耶！」', '拍一下桌子'],
  yellow: ['说「真不错」', '打个响指'],
  green: ['说「加油！」', '咳嗽一声'],
  blue: ['说「来啦」', '敲两下桌面'],
};

const deny = (message: string): BellClashReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: BellClashState): BellClashReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

/** 构建原创牌库：每色数字 1–8 各 2 张 + 每色短语卡 2 张 */
export function buildDeck(): BellClashCard[] {
  const deck: BellClashCard[] = [];
  for (const color of COLORS) {
    for (let number = 1; number <= 8; number += 1) {
      deck.push({ kind: 'number', color, number });
      deck.push({ kind: 'number', color, number });
    }
    for (const phrase of PHRASES[color]) {
      deck.push({ kind: 'phrase', color, phrase });
    }
  }
  return deck;
}

/** 出牌合法性：同颜色或同数字（短语卡按颜色匹配） */
export function canPlay(card: BellClashCard, top: BellClashCard | null): boolean {
  if (top === null) return true;
  if (card.color === top.color) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
  return false;
}

export function createBellClashState(
  players: readonly string[],
  configInput: unknown = {},
  deck: BellClashCard[],
  hands: Record<string, BellClashCard[]>,
  discardTop: BellClashCard | null,
): BellClashState {
  if (players.length < 2 || players.length > 7) throw new Error('铃铛对决需要 2 至 7 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseBellClashConfig(configInput);
  for (const id of players) {
    if (!hands[id] || hands[id].length !== config.handSize) throw new Error('手牌数量与配置不一致');
  }
  const state: BellClashState = {
    schemaVersion: 1,
    phase: 'playing',
    players: [...players],
    config,
    hands: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, [...cards]])),
    drawPile: [...deck],
    discardTop,
    currentPlayerId: players[0]!,
    bellOpen: false,
    bellClaimantId: null,
    penaltyPulls: {},
    winners: [],
  };
  assertBellClashInvariants(state);
  return state;
}

/** 从抽牌堆摸一张；空则返回 null（由调用方结算抽牌堆耗尽） */
function drawOne(state: BellClashState, playerId: string): BellClashCard | null {
  const card = state.drawPile.pop() ?? null;
  if (card) state.hands[playerId]!.push(card);
  return card;
}

/** 抽牌堆耗尽结算（平台裁定）：手牌最少者获胜；并列则并列获胜 */
function settleDeckEmpty(
  state: BellClashState,
  events: BellClashEvent[],
  effects: GameEffect[],
): void {
  state.phase = 'game_over';
  const minHand = Math.min(...state.players.map((id) => state.hands[id]!.length));
  state.winners = state.players.filter((id) => state.hands[id]!.length === minHand);
  events.push({ type: 'game_finished', winners: [...state.winners] });
  effects.push(system('抽牌堆耗尽！手牌最少者获胜'));
}

/** 出牌后结算：手牌清空 → 获胜；否则弃牌堆顶更新并轮到下一位 */
function afterPlay(
  state: BellClashState,
  playerId: string,
  card: BellClashCard,
  events: BellClashEvent[],
  effects: GameEffect[],
  now: number,
): void {
  state.discardTop = card;
  state.bellClaimantId = null;
  state.bellOpen = false;
  events.push({ type: 'card_played', playerId, card });
  if (state.hands[playerId]!.length === 0) {
    state.phase = 'game_over';
    state.winners = [playerId];
    events.push({ type: 'game_finished', winners: [playerId] });
    effects.push(system(`${playerId} 先打完手牌，获胜！`));
    return;
  }
  // 短语卡被打出 → 打开按铃窗口（口头触发由线下玩家判断后拍铃）
  if (card.kind === 'phrase') {
    state.bellOpen = true;
    events.push({ type: 'bell_opened' });
    effects.push(system('行动短语卡！若有人说了/做了牌上内容，可拍铃抢回合'));
    effects.push({
      type: 'schedule_timer',
      timerId: 'bell-window',
      deadlineAt: now + state.config.bellSeconds * 1000,
      action: { type: 'resolve_bell', claimantId: '' },
    });
    return;
  }
  state.currentPlayerId = nextPlayer(state, playerId);
  events.push({ type: 'turn_passed', playerId: state.currentPlayerId });
  effects.push({
    type: 'schedule_timer',
    timerId: `turn-${state.currentPlayerId}`,
    deadlineAt: now + state.config.turnSeconds * 1000,
    action: { type: 'turn_timeout', playerId: state.currentPlayerId },
  });
}

function nextPlayer(state: BellClashState, playerId: string): string {
  const index = state.players.indexOf(playerId);
  return state.players[(index + 1) % state.players.length]!;
}

export function reduceBellClashState(
  state: BellClashState,
  actionInput: BellClashAction | unknown,
  ctx: { now: number },
): BellClashReduceResult {
  let action: BellClashAction;
  try {
    action = parseBellClashAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  if (action.type === 'begin') {
    return {
      ok: true,
      nextState: state,
      events: [{ type: 'game_started' }],
      effects: [
        system('铃铛对决开始！先打完手牌者获胜'),
        {
          type: 'schedule_timer',
          timerId: `turn-${state.currentPlayerId}`,
          deadlineAt: ctx.now + state.config.turnSeconds * 1000,
          action: { type: 'turn_timeout', playerId: state.currentPlayerId },
        },
      ],
    };
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: BellClashEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作，§6.7）：从局内移除；剩余玩家不足则终局（剩余玩家获胜）
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      delete next.hands[id];
      delete next.penaltyPulls[id];
    }
    // 当前出牌者退出且未终局：轮换到剩余玩家中它之后的第一位
    if (next.players.length >= 2 && !next.players.includes(next.currentPlayerId)) {
      const oldIndex = state.players.indexOf(state.currentPlayerId);
      const remaining = state.players.slice(oldIndex + 1).concat(state.players.slice(0, oldIndex)).filter((p) => next.players.includes(p));
      next.currentPlayerId = remaining[0] ?? next.players[0]!;
    }
    if (next.players.length < 2) {
      next.phase = 'game_over';
      next.winners = [...next.players];
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('玩家退出，对局结束'));
    }
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 出牌：当前出牌者打出合法牌
  if (action.type === 'play_card') {
    if (action.playerId !== next.currentPlayerId) return deny('还没轮到你出牌');
    if (next.bellOpen) return deny('按铃窗口开启中，先结算抢铃');
    const hand = next.hands[action.playerId]!;
    const card = hand[action.cardIndex];
    if (!card) return deny('卡牌索引无效');
    if (!canPlay(card, next.discardTop)) return deny('只能打出同颜色或同数字的牌');
    hand.splice(action.cardIndex, 1);
    afterPlay(next, action.playerId, card, events, effects, ctx.now);
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 摸牌：打不出时摸一张；若摸到的牌可打出则直接打出
  if (action.type === 'draw_card') {
    if (action.playerId !== next.currentPlayerId) return deny('还没轮到你摸牌');
    if (next.bellOpen) return deny('按铃窗口开启中，先结算抢铃');
    const drawn = drawOne(next, action.playerId);
    if (!drawn) {
      // 抽牌堆耗尽：手牌最少者获胜
      settleDeckEmpty(next, events, effects);
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    events.push({ type: 'card_drawn', playerId: action.playerId });
    // 摸到可打出的牌 → 自动打出
    if (canPlay(drawn, next.discardTop)) {
      const hand = next.hands[action.playerId]!;
      hand.splice(hand.length - 1, 1);
      afterPlay(next, action.playerId, drawn, events, effects, ctx.now);
    } else {
      next.currentPlayerId = nextPlayer(next, action.playerId);
      events.push({ type: 'turn_passed', playerId: next.currentPlayerId });
      effects.push({
        type: 'schedule_timer',
        timerId: `turn-${next.currentPlayerId}`,
        deadlineAt: ctx.now + state.config.turnSeconds * 1000,
        action: { type: 'turn_timeout', playerId: next.currentPlayerId },
      });
    }
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 拍铃：仅按铃窗口开启时；拍铃者须持有可打出的短语卡（同色）
  if (action.type === 'ring_bell') {
    if (!next.bellOpen) return deny('当前没有可拍铃的窗口');
    if (next.bellClaimantId !== null) return deny('已有人拍铃');
    const top = next.discardTop;
    if (!top || top.kind !== 'phrase') return deny('当前顶牌不是行动短语卡');
    const hand = next.hands[action.playerId]!;
    const hasPlayablePhrase = hand.some((card) => card.kind === 'phrase' && card.color === top.color);
    if (!hasPlayablePhrase) {
      // 错误拍铃：罚摸一张并关闭本次窗口（防止无限罚摸死循环）
      drawOne(next, action.playerId);
      next.penaltyPulls[action.playerId] = (next.penaltyPulls[action.playerId] ?? 0) + 1;
      next.bellOpen = false;
      next.currentPlayerId = nextPlayer(next, next.currentPlayerId);
      events.push({ type: 'bell_rung', claimantId: action.playerId });
      events.push({ type: 'bell_resolved', claimantId: action.playerId, wonTurn: false });
      effects.push(system(`${action.playerId} 拍铃但手中没有可打出的短语卡，罚摸一张`));
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    next.bellClaimantId = action.playerId;
    events.push({ type: 'bell_rung', claimantId: action.playerId });
    effects.push(system(`${action.playerId} 拍铃！说出/做了牌上内容即可打出短语卡`));
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 结算拍铃：拍铃者打出同色短语卡并接管回合
  if (action.type === 'resolve_bell') {
    if (!next.bellOpen) return idempotent(state);
    const claimantId = next.bellClaimantId || (action.claimantId || null);
    if (!claimantId) {
      // 无人拍铃：短语卡留在弃牌顶，回到当前出牌者继续
      next.bellOpen = false;
      next.currentPlayerId = nextPlayer(next, next.currentPlayerId);
      events.push({ type: 'bell_resolved', claimantId: '', wonTurn: false });
      effects.push(system('无人拍铃，回合继续'));
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    const top = next.discardTop;
    const hand = next.hands[claimantId]!;
    const phraseIndex = hand.findIndex((card) => card.kind === 'phrase' && card.color === top?.color);
    if (phraseIndex === -1) {
      // 结算时已无合法短语卡（异常兜底）：视为无人拍铃
      next.bellOpen = false;
      events.push({ type: 'bell_resolved', claimantId, wonTurn: false });
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    const phrase = hand.splice(phraseIndex, 1)[0]!;
    // 拍铃结算：打出短语卡并接管回合，但不再触发新的按铃窗口（本轮已结算）
    next.discardTop = phrase;
    next.bellOpen = false;
    next.currentPlayerId = claimantId;
    events.push({ type: 'card_played', playerId: claimantId, card: phrase });
    if (next.hands[claimantId]!.length === 0) {
      next.phase = 'game_over';
      next.winners = [claimantId];
      events.push({ type: 'game_finished', winners: [claimantId] });
      effects.push(system(`${claimantId} 拍铃打出最后一张牌，获胜！`));
    } else {
      events.push({ type: 'turn_passed', playerId: claimantId });
      effects.push({
        type: 'schedule_timer',
        timerId: `turn-${claimantId}`,
        deadlineAt: ctx.now + state.config.turnSeconds * 1000,
        action: { type: 'turn_timeout', playerId: claimantId },
      });
    }
    events.push({ type: 'bell_resolved', claimantId, wonTurn: true });
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 回合超时兜底：自动摸一张并过牌
  if (action.type === 'turn_timeout') {
    if (action.playerId !== next.currentPlayerId) return idempotent(state);
    if (next.bellOpen) return idempotent(state);
    const drawn = drawOne(next, action.playerId);
    if (!drawn) {
      settleDeckEmpty(next, events, effects);
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }
    next.currentPlayerId = nextPlayer(next, action.playerId);
    events.push({ type: 'card_drawn', playerId: action.playerId }, { type: 'turn_passed', playerId: next.currentPlayerId });
    effects.push({
      type: 'schedule_timer',
      timerId: `turn-${next.currentPlayerId}`,
      deadlineAt: ctx.now + state.config.turnSeconds * 1000,
      action: { type: 'turn_timeout', playerId: next.currentPlayerId },
    });
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  return deny('动作无效');
}

export function assertBellClashInvariants(state: BellClashState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (
    (state.phase !== 'game_over' && (state.players.length < 2 || state.players.length > 7)) ||
    state.players.length < 1 ||
    new Set(state.players).size !== state.players.length
  ) {
    throw new Error('玩家列表无效');
  }
  for (const id of state.players) {
    if (!Array.isArray(state.hands[id])) throw new Error('手牌无效');
    for (const card of state.hands[id]!) {
      if (card.kind !== 'number' && card.kind !== 'phrase') throw new Error('卡牌类型无效');
      if (!COLORS.includes(card.color)) throw new Error('卡牌颜色无效');
      if (card.kind === 'phrase' && (!card.phrase || card.phrase.length < 1)) throw new Error('短语卡文案无效');
    }
  }
  if (state.phase !== 'game_over' && !state.players.includes(state.currentPlayerId)) throw new Error('当前出牌者不在本局');
  if (state.discardTop !== null) {
    if (state.discardTop.kind !== 'number' && state.discardTop.kind !== 'phrase') throw new Error('弃牌顶无效');
  }
  if (state.bellOpen) {
    if (!state.discardTop || state.discardTop.kind !== 'phrase') throw new Error('按铃窗口应挂在短语卡上');
  }
  if (state.bellClaimantId !== null && !state.players.includes(state.bellClaimantId)) {
    throw new Error('拍铃者不在本局');
  }
  if (state.phase === 'game_over' && state.winners.length === 0) throw new Error('终局应有胜者');
}
