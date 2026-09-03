/**
 * 铃铛对决（Ding）桌面模拟模式 —— 纯工具 reducer。
 * 无记分、无回合、无胜负判定：所有操作只改变牌堆/道具/日志。
 */
import {
  createSimTimer,
  pushSimLog,
  ringSimBell,
  rollSimDice,
  shuffleSimCards,
  tickSimTimer,
  type RandomSource,
} from '@ldj/shared';
import { buildDeck, type BellRandom } from '../rules.ts';
import type { BellClashCard } from '../types.ts';
import type {
  BellClashSimAction,
  BellClashSimConfig,
  BellClashSimEvent,
  BellClashSimState,
  ResolvedBellClashSimConfig,
} from './types.ts';

const DEFAULT_HAND_SIZE = 8;

export function parseBellClashSimConfig(input: unknown): ResolvedBellClashSimConfig {
  const raw = (input ?? {}) as Partial<BellClashSimConfig>;
  const handSize =
    typeof raw.handSize === 'number' && Number.isInteger(raw.handSize) && raw.handSize >= 1 && raw.handSize <= 20
      ? raw.handSize
      : DEFAULT_HAND_SIZE;
  return { rulesetId: 'bell_clash_sim_v1', handSize };
}

export interface SimRandom extends RandomSource {}

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });

const idempotent = (state: BellClashSimState) => ({ ok: true as const, nextState: state, events: [], effects: [] });

function system(text: string) {
  return { type: 'system_message' as const, text };
}

function buildShuffledDeck(random: SimRandom): BellClashCard[] {
  const deck = buildDeck(random as BellRandom);
  return shuffleSimCards(deck, random);
}

function dealInitial(state: BellClashSimState, random: SimRandom): BellClashSimState {
  const deck = buildShuffledDeck(random);
  const hands: Record<string, BellClashCard[]> = {};
  const rest = [...deck];
  for (const pid of state.players) {
    const { drawn, rest: remaining } = splitTop(rest, state.config.handSize);
    hands[pid] = drawn;
    rest.length = 0;
    rest.push(...remaining);
  }
  // 翻一张数字卡作为桌面起始展示（保证不是短语卡，避免开局即"按铃"歧义）
  const topIdx = rest.findIndex((c) => c.kind === 'number');
  const discardTop = topIdx >= 0 ? rest.splice(topIdx, 1)[0]! : (rest.pop() ?? null);
  return { ...state, hands, drawPile: rest, discardTop, tableCards: [], activityLogs: [] };
}

function splitTop(pile: BellClashCard[], count: number): { drawn: BellClashCard[]; rest: BellClashCard[] } {
  const n = Math.min(count, pile.length);
  return { drawn: pile.slice(0, n), rest: pile.slice(n) };
}

export function createBellClashSimState(players: readonly string[], configInput: unknown, random: SimRandom): BellClashSimState {
  const config = parseBellClashSimConfig(configInput);
  const base: BellClashSimState = {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    hands: {},
    drawPile: [],
    discardTop: null,
    tableCards: [],
    props: {
      timer: null,
      dice: { diceCount: 1, sides: 6, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: [],
  };
  return dealInitial(base, random);
}

export function reduceBellClashSim(
  state: BellClashSimState,
  actionInput: unknown,
  ctx: { now: number; random: SimRandom },
): { ok: true; nextState: BellClashSimState; events: BellClashSimEvent[]; effects: ReturnType<typeof system>[] } | { ok: false; code: string; message: string } {
  const action = actionInput as BellClashSimAction;
  const now = ctx.now;
  const random = ctx.random;

  switch (action.type) {
    case 'begin': {
      return idempotent(state);
    }
    case 'sim:redeal': {
      const next = dealInitial({ ...state, players: [...state.players] }, random);
      const events: BellClashSimEvent[] = [];
      return {
        ok: true,
        nextState: { ...next, activityLogs: pushSimLog(next.activityLogs, '重新发牌', now) },
        events,
        effects: [system('已按当前人数重新洗牌发牌')],
      };
    }
    case 'sim:draw': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      if (state.drawPile.length === 0) return deny('抽牌堆已空');
      const { drawn, rest } = splitTop(state.drawPile, 1);
      const next: BellClashSimState = {
        ...state,
        hands: { ...state.hands, [action.playerId]: [...(state.hands[action.playerId] ?? []), ...drawn] },
        drawPile: rest,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 摸了一张牌`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:deal_all': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const next = { ...state, hands: { ...state.hands } };
      for (const pid of state.players) {
        const { drawn, rest } = splitTop(next.drawPile, 1);
        if (drawn.length === 0) break;
        next.drawPile = rest;
        next.hands[pid] = [...(next.hands[pid] ?? []), ...drawn];
      }
      next.activityLogs = pushSimLog(next.activityLogs, '每人发了一张牌', now);
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:play_table': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const hand = state.hands[action.playerId] ?? [];
      if (action.cardIndex < 0 || action.cardIndex >= hand.length) return deny('手牌索引越界');
      const card = hand[action.cardIndex]!;
      const next: BellClashSimState = {
        ...state,
        hands: { ...state.hands, [action.playerId]: hand.filter((_, i) => i !== action.cardIndex) },
        discardTop: card,
        tableCards: [...state.tableCards, { card, playedBy: action.playerId }],
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 打出【${describeCard(card)}】`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_card_played', playerId: action.playerId, card }], effects: [] };
    }
    case 'sim:flip_top': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      if (state.drawPile.length === 0) return deny('抽牌堆已空');
      const { drawn, rest } = splitTop(state.drawPile, 1);
      const card = drawn[0]!;
      const next: BellClashSimState = {
        ...state,
        drawPile: rest,
        discardTop: card,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 翻牌：【${describeCard(card)}】`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:operate_timer': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const current = state.props.timer ?? createSimTimer(60);
      let timer = current;
      if (action.op === 'start') timer = { ...timer, isRunning: true, isExploded: false };
      else if (action.op === 'pause') timer = { ...timer, isRunning: false };
      else if (action.op === 'reset') timer = createSimTimer(current.durationSeconds);
      else if (action.op === 'set' && typeof action.durationSeconds === 'number' && action.durationSeconds > 0) {
        timer = createSimTimer(Math.min(3600, Math.floor(action.durationSeconds)));
      }
      const next: BellClashSimState = {
        ...state,
        props: { ...state.props, timer },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 操作计时器（${action.op}）`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:tick_timer': {
      const timer = state.props.timer;
      if (timer === null || !timer.isRunning) return idempotent(state);
      const { timer: nextTimer, exploded } = tickSimTimer(timer, 1);
      const next: BellClashSimState = {
        ...state,
        props: { ...state.props, timer: nextTimer },
        activityLogs: exploded ? pushSimLog(state.activityLogs, '到点！', now) : state.activityLogs,
      };
      const events: BellClashSimEvent[] = exploded ? [{ type: 'sim_timer_exploded' }] : [];
      const effects: ReturnType<typeof system>[] = exploded ? [system('到点！')] : [];
      return { ok: true, nextState: next, events, effects };
    }
    case 'sim:roll_dice': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const dice = state.props.dice;
      if (dice === null) return deny('桌上没有骰子');
      const rolled = rollSimDice(dice, random, action.playerId);
      const next: BellClashSimState = {
        ...state,
        props: { ...state.props, dice: rolled },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 掷骰：${rolled.values.join('、')}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_dice_rolled', playerId: action.playerId, values: rolled.values }], effects: [] };
    }
    case 'sim:ring_bell': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const bell = state.props.bell;
      if (bell === null) return deny('桌上没有按铃');
      const { bell: nextBell, first } = ringSimBell(bell, action.playerId, now);
      const next: BellClashSimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `${action.playerId} 拍下第一声铃！` : `${action.playerId} 又拍了一下铃`) ] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const next: BellClashSimState = {
        ...state,
        players: state.players.filter((p) => !forfeited.has(p)),
        hands: Object.fromEntries(Object.entries(state.hands).filter(([p]) => !forfeited.has(p))),
        activityLogs: pushSimLog(state.activityLogs, `${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default: {
      return deny('未知的模拟操作');
    }
  }
}

function describeCard(card: BellClashCard): string {
  return card.kind === 'number' ? `${card.number} ${card.color}` : `短语·${card.color}`;
}

export function assertBellClashSimInvariants(state: BellClashSimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  for (const pid of state.players) {
    if (!Array.isArray(state.hands[pid])) throw new Error(`玩家 ${pid} 缺少手牌列表`);
  }
  if (!Array.isArray(state.drawPile)) throw new Error('抽牌堆必须是数组');
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
