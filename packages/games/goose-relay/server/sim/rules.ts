/**
 * 以鹅传鹅 桌面模拟模式 —— 纯工具 reducer。
 * 候选鹅卡展示 + 随机头鹅 + 案情卡私密 + 通用道具；无接力/指认/投票/胜负。
 */
import {
  createSimTimer,
  pushSimLog,
  ringSimBell,
  rollSimDice,
  tickSimTimer,
  type RandomSource,
} from '@ldj/shared';
import { CHARACTERS, type CharacterId } from '../types.ts';
import type {
  GooseRelaySimAction,
  GooseRelaySimConfig,
  GooseRelaySimEvent,
  GooseRelaySimState,
  ResolvedGooseRelaySimConfig,
} from './types.ts';

const DEFAULT_CANDIDATE_COUNT = 9;

export function parseGooseRelaySimConfig(input: unknown): ResolvedGooseRelaySimConfig {
  const raw = (input ?? {}) as Partial<GooseRelaySimConfig>;
  const candidateCount =
    typeof raw.candidateCount === 'number' && Number.isInteger(raw.candidateCount) && raw.candidateCount >= 3 && raw.candidateCount <= 12
      ? raw.candidateCount
      : DEFAULT_CANDIDATE_COUNT;
  return { rulesetId: 'goose_relay_sim_v1', candidateCount };
}

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });
const idempotent = (state: GooseRelaySimState) => ({ ok: true as const, nextState: state, events: [], effects: [] });
function system(text: string) {
  return { type: 'system_message' as const, text };
}

export function buildSimTable(
  players: readonly string[],
  config: ResolvedGooseRelaySimConfig,
  random: RandomSource,
): Pick<GooseRelaySimState, 'candidateCards' | 'headPlayerId' | 'caseCard'> {
  const pool = [...CHARACTERS];
  const candidates: CharacterId[] = [];
  for (let i = 0; i < config.candidateCount && pool.length > 0; i += 1) {
    candidates.push(pool.splice(random.nextInt(0, pool.length), 1)[0]!);
  }
  const headIdx = random.nextInt(0, players.length);
  const headPlayerId = players[headIdx]!;
  const murderer = candidates[random.nextInt(0, candidates.length)]!;
  let victim = candidates[random.nextInt(0, candidates.length)]!;
  while (victim === murderer && candidates.length > 1) {
    victim = candidates[random.nextInt(0, candidates.length)]!;
  }
  return { candidateCards: candidates, headPlayerId, caseCard: { murderer, victim } };
}

export function createGooseRelaySimState(
  players: readonly string[],
  configInput: unknown,
  random: RandomSource,
): GooseRelaySimState {
  const config = parseGooseRelaySimConfig(configInput);
  const table = buildSimTable(players, config, random);
  return {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    candidateCards: table.candidateCards,
    headPlayerId: table.headPlayerId,
    caseCard: table.caseCard,
    props: {
      timer: null,
      dice: { diceCount: 1, sides: 6, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: pushSimLog([], `已随机指派头鹅（${table.headPlayerId}）并布置 9 张候选鹅卡`, 0),
  };
}

export function reduceGooseRelaySim(
  state: GooseRelaySimState,
  actionInput: unknown,
  ctx: { now: number; random: RandomSource },
): { ok: true; nextState: GooseRelaySimState; events: GooseRelaySimEvent[]; effects: ReturnType<typeof system>[] } | { ok: false; code: string; message: string } {
  const action = actionInput as GooseRelaySimAction;
  const now = ctx.now;
  const random = ctx.random;

  switch (action.type) {
    case 'begin':
      return idempotent(state);
    case 'sim:redeal': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const table = buildSimTable(state.players, state.config, random);
      const next: GooseRelaySimState = {
        ...state,
        candidateCards: table.candidateCards,
        headPlayerId: table.headPlayerId,
        caseCard: table.caseCard,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 重新布置鹅卡与头鹅`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_redealt' }], effects: [system(`已重抽候选鹅卡，头鹅为 ${table.headPlayerId}（案情仅头鹅可见）`)] };
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
      const next: GooseRelaySimState = {
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
      const next: GooseRelaySimState = {
        ...state,
        props: { ...state.props, timer: nextTimer },
        activityLogs: exploded ? pushSimLog(state.activityLogs, '到点！', now) : state.activityLogs,
      };
      return {
        ok: true,
        nextState: next,
        events: exploded ? [{ type: 'sim_timer_exploded' }] : [],
        effects: exploded ? [system('到点！')] : [],
      };
    }
    case 'sim:roll_dice': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const dice = state.props.dice;
      if (dice === null) return deny('桌上没有骰子');
      const rolled = rollSimDice(dice, random, action.playerId);
      const next: GooseRelaySimState = {
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
      const next: GooseRelaySimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `${action.playerId} 拍下第一声铃！` : `${action.playerId} 又拍了一下铃`)] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const nextPlayers = state.players.filter((p) => !forfeited.has(p));
      const next: GooseRelaySimState = {
        ...state,
        players: nextPlayers,
        // 头鹅退出则重新指派
        headPlayerId: forfeited.has(state.headPlayerId) && nextPlayers.length > 0 ? nextPlayers[0]! : state.headPlayerId,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default:
      return deny('未知的模拟操作');
  }
}

export function assertGooseRelaySimInvariants(state: GooseRelaySimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  if (state.players.length > 0 && !state.players.includes(state.headPlayerId)) throw new Error('头鹅必须在玩家列表中');
  if (state.caseCard !== null && !state.candidateCards.includes(state.caseCard.murderer)) throw new Error('凶手不在候选鹅卡中');
  if (state.caseCard !== null && !state.candidateCards.includes(state.caseCard.victim)) throw new Error('受害者不在候选鹅卡中');
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
