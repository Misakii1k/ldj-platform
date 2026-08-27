/**
 * 奶酪大盗 桌面模拟模式 —— 纯工具 reducer。
 * 苏醒时辰/身份角色牌私密分配 + 通用道具；无偷奶酪/投票/胜负。
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
import { DIE_SIDES, type RoleCard } from '../types.ts';
import type {
  CheeseThiefSimAction,
  CheeseThiefSimConfig,
  CheeseThiefSimEvent,
  CheeseThiefSimState,
  ResolvedCheeseThiefSimConfig,
} from './types.ts';

const ROLE_CARD_POOL: readonly RoleCard[] = ['cat', 'dog', 'whiteMouse'];

export function parseCheeseThiefSimConfig(input: unknown): ResolvedCheeseThiefSimConfig {
  const raw = (input ?? {}) as Partial<CheeseThiefSimConfig>;
  return { rulesetId: 'cheese_thief_sim_v1', roleCards: raw.roleCards === true };
}

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });
const idempotent = (state: CheeseThiefSimState) => ({ ok: true as const, nextState: state, events: [], effects: [] });
function system(text: string) {
  return { type: 'system_message' as const, text };
}

function rollWakeHours(players: readonly string[], random: RandomSource): Record<string, number> {
  const hours: Record<string, number> = {};
  for (const pid of players) {
    hours[pid] = random.nextInt(1, DIE_SIDES + 1);
  }
  return hours;
}

function assignRoleCards(players: readonly string[], random: RandomSource): Record<string, RoleCard> {
  const pool = shuffleSimCards(ROLE_CARD_POOL, random);
  const cards: Record<string, RoleCard> = {};
  players.forEach((pid, i) => {
    cards[pid] = pool[i % pool.length]!;
  });
  return cards;
}

export function createCheeseThiefSimState(
  players: readonly string[],
  configInput: unknown,
  random: RandomSource,
): CheeseThiefSimState {
  const config = parseCheeseThiefSimConfig(configInput);
  return {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    wakeHours: rollWakeHours(players, random),
    roleCards: config.roleCards ? assignRoleCards(players, random) : {},
    props: {
      timer: null,
      dice: { diceCount: 2, sides: DIE_SIDES, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: pushSimLog([], '🌙 已为每位玩家私密掷出苏醒时辰', 0),
  };
}

export function reduceCheeseThiefSim(
  state: CheeseThiefSimState,
  actionInput: unknown,
  ctx: { now: number; random: RandomSource },
): { ok: true; nextState: CheeseThiefSimState; events: CheeseThiefSimEvent[]; effects: ReturnType<typeof system>[] } | { ok: false; code: string; message: string } {
  const action = actionInput as CheeseThiefSimAction;
  const now = ctx.now;
  const random = ctx.random;

  switch (action.type) {
    case 'begin':
      return idempotent(state);
    case 'sim:assign_wake': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const wakeHours = rollWakeHours(state.players, random);
      const next: CheeseThiefSimState = {
        ...state,
        wakeHours,
        activityLogs: pushSimLog(state.activityLogs, `🌙 ${action.playerId} 重新私密掷苏醒时辰`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_wake_rolled' }], effects: [system('🌙 已重新私密掷出苏醒时辰（仅本人可见）')] };
    }
    case 'sim:assign_roles': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const roleCards = assignRoleCards(state.players, random);
      const next: CheeseThiefSimState = {
        ...state,
        roleCards,
        activityLogs: pushSimLog(state.activityLogs, `🎭 ${action.playerId} 重新私密分配身份角色牌`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_roles_assigned' }], effects: [system('🎭 已重新私密分配身份角色牌（仅本人可见）')] };
    }
    case 'sim:clear_roles': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const next: CheeseThiefSimState = {
        ...state,
        roleCards: {},
        activityLogs: pushSimLog(state.activityLogs, `🗑️ ${action.playerId} 收起身份角色牌`, now),
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
      const next: CheeseThiefSimState = {
        ...state,
        props: { ...state.props, timer },
        activityLogs: pushSimLog(state.activityLogs, `⏱️ ${action.playerId} 操作计时器（${action.op}）`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:tick_timer': {
      const timer = state.props.timer;
      if (timer === null || !timer.isRunning) return idempotent(state);
      const { timer: nextTimer, exploded } = tickSimTimer(timer, 1);
      const next: CheeseThiefSimState = {
        ...state,
        props: { ...state.props, timer: nextTimer },
        activityLogs: exploded ? pushSimLog(state.activityLogs, '💥 计时器到点！', now) : state.activityLogs,
      };
      return {
        ok: true,
        nextState: next,
        events: exploded ? [{ type: 'sim_timer_exploded' }] : [],
        effects: exploded ? [system('💥 计时器到点！')] : [],
      };
    }
    case 'sim:roll_dice': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const dice = state.props.dice;
      if (dice === null) return deny('桌上没有骰子');
      const rolled = rollSimDice(dice, random, action.playerId);
      const next: CheeseThiefSimState = {
        ...state,
        props: { ...state.props, dice: rolled },
        activityLogs: pushSimLog(state.activityLogs, `🎲 ${action.playerId} 掷骰：${rolled.values.join('、')}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_dice_rolled', playerId: action.playerId, values: rolled.values }], effects: [] };
    }
    case 'sim:ring_bell': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const bell = state.props.bell;
      if (bell === null) return deny('桌上没有按铃');
      const { bell: nextBell, first } = ringSimBell(bell, action.playerId, now);
      const next: CheeseThiefSimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `🔔 ${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `🔔 ${action.playerId} 拍下第一声铃！` : `🔔 ${action.playerId} 又拍了一下铃`)] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const next: CheeseThiefSimState = {
        ...state,
        players: state.players.filter((p) => !forfeited.has(p)),
        wakeHours: Object.fromEntries(Object.entries(state.wakeHours).filter(([p]) => !forfeited.has(p))),
        roleCards: Object.fromEntries(Object.entries(state.roleCards).filter(([p]) => !forfeited.has(p))),
        activityLogs: pushSimLog(state.activityLogs, `🚪 ${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default:
      return deny('未知的模拟操作');
  }
}

export function assertCheeseThiefSimInvariants(state: CheeseThiefSimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  for (const pid of state.players) {
    const hour = state.wakeHours[pid];
    if (typeof hour !== 'number' || hour < 1 || hour > DIE_SIDES) throw new Error(`玩家 ${pid} 苏醒时辰无效`);
  }
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
