/**
 * 囚徒之夜 桌面模拟模式 —— 纯工具 reducer。
 * 罪行私密分配（狱警随机、干扰卡公开）+ 问题卡抽取 + 通用道具；无票选/猜罪/记分。
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
import { QUESTION_DECK } from '../questionDeck.ts';
import { CRIMES, type CrimeId } from '../types.ts';
import type {
  NightTestimonySimAction,
  NightTestimonySimConfig,
  NightTestimonySimEvent,
  NightTestimonySimState,
  ResolvedNightTestimonySimConfig,
} from './types.ts';

export function parseNightTestimonySimConfig(input: unknown): ResolvedNightTestimonySimConfig {
  return { rulesetId: 'night_testimony_sim_v1' };
}

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });
const idempotent = (state: NightTestimonySimState) => ({ ok: true as const, nextState: state, events: [], effects: [] });
function system(text: string) {
  return { type: 'system_message' as const, text };
}

export function assignCrimes(
  players: readonly string[],
  random: RandomSource,
): { wardenId: string; crimes: Record<string, CrimeId>; extraCrime: CrimeId } {
  const shuffledPlayers = random.shuffle([...players]);
  const wardenId = shuffledPlayers[0]!;
  const inmates = shuffledPlayers.slice(1);
  const shuffledCrimes = random.shuffle([...CRIMES]);
  const crimes: Record<string, CrimeId> = {};
  inmates.forEach((inmateId, index) => {
    crimes[inmateId] = shuffledCrimes[index]!;
  });
  const extraCrime = shuffledCrimes[inmates.length]!;
  return { wardenId, crimes, extraCrime };
}

export function createNightTestimonySimState(
  players: readonly string[],
  configInput: unknown,
  random: RandomSource,
): NightTestimonySimState {
  const config = parseNightTestimonySimConfig(configInput);
  const { wardenId, crimes, extraCrime } = assignCrimes(players, random);
  return {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    crimes,
    wardenId,
    extraCrime,
    questionArea: null,
    usedQuestionIds: [],
    props: {
      timer: null,
      dice: { diceCount: 1, sides: 6, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: pushSimLog([], '🕵️ 已随机指派狱警并为囚犯私密分配罪行', 0),
  };
}

export function reduceNightTestimonySim(
  state: NightTestimonySimState,
  actionInput: unknown,
  ctx: { now: number; random: RandomSource },
): { ok: true; nextState: NightTestimonySimState; events: NightTestimonySimEvent[]; effects: ReturnType<typeof system>[] } | { ok: false; code: string; message: string } {
  const action = actionInput as NightTestimonySimAction;
  const now = ctx.now;
  const random = ctx.random;

  switch (action.type) {
    case 'begin':
      return idempotent(state);
    case 'sim:assign_crimes': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const { wardenId, crimes, extraCrime } = assignCrimes(state.players, random);
      const next: NightTestimonySimState = {
        ...state,
        wardenId,
        crimes,
        extraCrime,
        activityLogs: pushSimLog(state.activityLogs, `🔀 ${action.playerId} 重新分配罪行与狱警`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [system('🔀 已重新随机指派狱警并为囚犯私密分配罪行')] };
    }
    case 'sim:draw_question': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const available = QUESTION_DECK.filter((c) => !state.usedQuestionIds.includes(c.id));
      if (available.length === 0) return deny('问题卡已全部抽完');
      const card = shuffleSimCards(available, random)[0]!;
      const next: NightTestimonySimState = {
        ...state,
        questionArea: { card, revealedBy: action.playerId },
        usedQuestionIds: [...state.usedQuestionIds, card.id],
        activityLogs: pushSimLog(state.activityLogs, `📜 ${action.playerId} 抽到审讯卡「${card.text.slice(0, 14)}…」`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_question_drawn', cardId: card.id }], effects: [] };
    }
    case 'sim:clear_question': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const next: NightTestimonySimState = {
        ...state,
        questionArea: null,
        activityLogs: pushSimLog(state.activityLogs, `🗑️ ${action.playerId} 收起审讯卡`, now),
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
      const next: NightTestimonySimState = {
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
      const next: NightTestimonySimState = {
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
      const next: NightTestimonySimState = {
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
      const next: NightTestimonySimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `🔔 ${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `🔔 ${action.playerId} 拍下第一声铃！` : `🔔 ${action.playerId} 又拍了一下铃`)] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const next: NightTestimonySimState = {
        ...state,
        players: state.players.filter((p) => !forfeited.has(p)),
        crimes: Object.fromEntries(Object.entries(state.crimes).filter(([p]) => !forfeited.has(p))),
        activityLogs: pushSimLog(state.activityLogs, `🚪 ${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default:
      return deny('未知的模拟操作');
  }
}

export function assertNightTestimonySimInvariants(state: NightTestimonySimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  if (!state.players.includes(state.wardenId)) throw new Error('狱警必须在玩家列表中');
  if (state.crimes[state.wardenId] !== undefined) throw new Error('狱警不能有罪行');
  for (const pid of state.players) {
    if (pid !== state.wardenId && state.crimes[pid] === undefined) throw new Error(`囚犯 ${pid} 缺少罪行`);
  }
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
