/**
 * 伪人测试 桌面模拟模式 —— 纯工具 reducer。
 * 词条私密分配 + 题卡抽取 + 通用道具；无伪人判定、无记分。
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
import { TOPIC_DECK, type TopicCard } from '../questionDeck.ts';
import { TRIGGER_WORDS } from '../rules.ts';
import type {
  EchoJudgeSimAction,
  EchoJudgeSimConfig,
  EchoJudgeSimEvent,
  EchoJudgeSimState,
  ResolvedEchoJudgeSimConfig,
} from './types.ts';

export function parseEchoJudgeSimConfig(input: unknown): ResolvedEchoJudgeSimConfig {
  return { rulesetId: 'echo_judge_sim_v1' };
}

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });
const idempotent = (state: EchoJudgeSimState) => ({ ok: true as const, nextState: state, events: [], effects: [] });
function system(text: string) {
  return { type: 'system_message' as const, text };
}

export function createEchoJudgeSimState(
  players: readonly string[],
  configInput: unknown,
  random: RandomSource,
): EchoJudgeSimState {
  const config = parseEchoJudgeSimConfig(configInput);
  const triggerWords = assignTriggerWords(players, random);
  return {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    triggerWords,
    topicArea: null,
    usedTopicIds: [],
    props: {
      timer: null,
      dice: { diceCount: 1, sides: 6, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: pushSimLog([], `已为每位玩家私密分配触发词`, 0),
  };
}

function assignTriggerWords(players: readonly string[], random: RandomSource): Record<string, string> {
  const pool = shuffleSimCards(TRIGGER_WORDS, random);
  const words: Record<string, string> = {};
  players.forEach((pid, i) => {
    words[pid] = pool[i % pool.length]!;
  });
  return words;
}

function drawTopic(state: EchoJudgeSimState, random: RandomSource, revealedBy: string): { card: TopicCard; next: EchoJudgeSimState } | null {
  const available = TOPIC_DECK.filter((c) => !state.usedTopicIds.includes(c.id));
  if (available.length === 0) return null;
  const card = shuffleSimCards(available, random)[0]!;
  const next: EchoJudgeSimState = {
    ...state,
    topicArea: { card, revealedBy },
    usedTopicIds: [...state.usedTopicIds, card.id],
    activityLogs: pushSimLog(state.activityLogs, `${revealedBy} 抽到题卡「${card.text.slice(0, 16)}…」`, 0),
  };
  return { card, next };
}

export function reduceEchoJudgeSim(
  state: EchoJudgeSimState,
  actionInput: unknown,
  ctx: { now: number; random: RandomSource },
): { ok: true; nextState: EchoJudgeSimState; events: EchoJudgeSimEvent[]; effects: ReturnType<typeof system>[] } | { ok: false; code: string; message: string } {
  const action = actionInput as EchoJudgeSimAction;
  const now = ctx.now;
  const random = ctx.random;

  switch (action.type) {
    case 'begin':
      return idempotent(state);
    case 'sim:assign_words': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const triggerWords = assignTriggerWords(state.players, random);
      const next: EchoJudgeSimState = {
        ...state,
        triggerWords,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 重新分配触发词`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [system('已为全员重新分配触发词（仅本人可见）')] };
    }
    case 'sim:draw_topic': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const result = drawTopic(state, random, action.playerId);
      if (result === null) return deny('题卡已全部抽完');
      return {
        ok: true,
        nextState: result.next,
        events: [{ type: 'sim_topic_drawn', cardId: result.card.id }],
        effects: [],
      };
    }
    case 'sim:clear_topic': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const next: EchoJudgeSimState = {
        ...state,
        topicArea: null,
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 收起题卡`, now),
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
      const next: EchoJudgeSimState = {
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
      const next: EchoJudgeSimState = {
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
      const next: EchoJudgeSimState = {
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
      const next: EchoJudgeSimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `${action.playerId} 拍下第一声铃！` : `${action.playerId} 又拍了一下铃`)] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const next: EchoJudgeSimState = {
        ...state,
        players: state.players.filter((p) => !forfeited.has(p)),
        triggerWords: Object.fromEntries(Object.entries(state.triggerWords).filter(([p]) => !forfeited.has(p))),
        activityLogs: pushSimLog(state.activityLogs, `${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default:
      return deny('未知的模拟操作');
  }
}

export function assertEchoJudgeSimInvariants(state: EchoJudgeSimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  for (const pid of state.players) {
    if (typeof state.triggerWords[pid] !== 'string') throw new Error(`玩家 ${pid} 缺少触发词`);
  }
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
