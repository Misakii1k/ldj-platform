/**
 * 一智千金桌面模拟模式 —— 纯工具 reducer。
 * 无记分、无结算、无胜负判定：只改题目/猜测/版图/筹码/钞票/道具/日志。
 */
import {
  createSimTimer,
  pushSimLog,
  ringSimBell,
  rollSimDice,
  tickSimTimer,
  type RandomSource,
} from '@ldj/shared';
import { buildBoard, type ChipId, type TargetId } from '../board.ts';
import { ALL_QUESTIONS } from '../questions.ts';
import { MAX_GUESS, MIN_GUESS } from '../schemas.ts';
import type { Question } from '../types.ts';
import type {
  ResolvedWitsWagersSimConfig,
  SimChipPair,
  WitsWagersSimAction,
  WitsWagersSimConfig,
  WitsWagersSimEvent,
  WitsWagersSimState,
} from './types.ts';

const DEFAULT_STARTING_MONEY = 2;
/** 钞票上限只是防手滑，线下玩到这个数也早该散场了 */
const MAX_MONEY = 9_999;
const CHIP_IDS: readonly ChipId[] = ['A', 'B'];

export function parseWitsWagersSimConfig(input: unknown): ResolvedWitsWagersSimConfig {
  const raw = (input ?? {}) as Partial<WitsWagersSimConfig>;
  const startingMoney =
    typeof raw.startingMoney === 'number' && Number.isInteger(raw.startingMoney) && raw.startingMoney >= 0 && raw.startingMoney <= MAX_MONEY
      ? raw.startingMoney
      : DEFAULT_STARTING_MONEY;
  return { rulesetId: 'wits_wagers_sim_v1', startingMoney };
}

export type SimRandom = RandomSource;

type SimEffect = { type: 'system_message'; text: string };

const deny = (message: string) => ({ ok: false as const, code: 'ACTION_NOT_ALLOWED', message });

const idempotent = (state: WitsWagersSimState) => ({ ok: true as const, nextState: state, events: [] as WitsWagersSimEvent[], effects: [] as SimEffect[] });

function system(text: string): SimEffect {
  return { type: 'system_message', text };
}

function emptyChips(): SimChipPair {
  return [
    { chipId: 'A', targetId: null },
    { chipId: 'B', targetId: null },
  ];
}

/** 从题库里抽一道本局没出过的题；题库耗尽时允许回头重抽 */
function drawQuestion(state: WitsWagersSimState, random: SimRandom, pool: readonly Question[] = ALL_QUESTIONS): Question {
  const used = new Set(state.questionHistory.map((q) => q.id));
  const fresh = pool.filter((q) => q.reviewed && !used.has(q.id));
  const candidates = fresh.length > 0 ? fresh : pool.filter((q) => q.reviewed);
  if (candidates.length === 0) throw new Error('题库为空，无法出题');
  return candidates[random.nextInt(0, candidates.length)]!;
}

/** 清掉一轮的猜测/版图/筹码/答案翻面，题目与钞票保留 */
function clearRound(state: WitsWagersSimState): WitsWagersSimState {
  const guesses: Record<string, number | null> = {};
  const chips: Record<string, SimChipPair> = {};
  for (const pid of state.players) {
    guesses[pid] = null;
    chips[pid] = emptyChips();
  }
  return { ...state, guesses, revealed: false, board: [], chips, answerRevealed: false };
}

function startQuestion(state: WitsWagersSimState, random: SimRandom, now: number, pool?: readonly Question[]): WitsWagersSimState {
  const question = drawQuestion(state, random, pool);
  const cleared = clearRound(state);
  return {
    ...cleared,
    questionHistory: [...state.questionHistory, question],
    activityLogs: pushSimLog(cleared.activityLogs, `第 ${state.questionHistory.length + 1} 题：${question.prompt}`, now),
  };
}

export function createWitsWagersSimState(
  players: readonly string[],
  configInput: unknown,
  random: SimRandom,
  questionPool?: readonly Question[],
): WitsWagersSimState {
  const config = parseWitsWagersSimConfig(configInput);
  const money: Record<string, number> = {};
  for (const pid of players) money[pid] = config.startingMoney;
  const base: WitsWagersSimState = {
    schemaVersion: 1,
    phase: 'sim',
    players: [...players],
    config,
    questionHistory: [],
    answerRevealed: false,
    guesses: {},
    revealed: false,
    board: [],
    chips: {},
    money,
    props: {
      timer: null,
      dice: { diceCount: 1, sides: 6, values: [], lastRollBy: null },
      bell: { rungBy: null, ringCount: 0, lastRingAt: 0 },
    },
    activityLogs: [],
  };
  return startQuestion(base, random, 0, questionPool);
}

export function currentQuestion(state: WitsWagersSimState): Question | null {
  return state.questionHistory[state.questionHistory.length - 1] ?? null;
}

export function reduceWitsWagersSim(
  state: WitsWagersSimState,
  actionInput: unknown,
  ctx: { now: number; random: SimRandom; questionPool?: readonly Question[] },
): { ok: true; nextState: WitsWagersSimState; events: WitsWagersSimEvent[]; effects: SimEffect[] } | { ok: false; code: string; message: string } {
  const action = actionInput as WitsWagersSimAction;
  const { now, random } = ctx;

  switch (action.type) {
    case 'begin': {
      return idempotent(state);
    }
    case 'sim:next_question': {
      const next = startQuestion(state, random, now, ctx.questionPool);
      return { ok: true, nextState: next, events: [], effects: [system('换下一题，猜测与筹码已清空')] };
    }
    case 'sim:submit_guess': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      if (state.revealed) return deny('已经亮牌，本题不能再改猜测');
      const value = action.value;
      if (!Number.isSafeInteger(value) || value < MIN_GUESS || value > MAX_GUESS) return deny('猜测必须是 1..999,999,999,999 的整数');
      const first = state.guesses[action.playerId] === null || state.guesses[action.playerId] === undefined;
      const next: WitsWagersSimState = {
        ...state,
        guesses: { ...state.guesses, [action.playerId]: value },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} ${first ? '交了猜测' : '改了猜测'}`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:reveal_guesses': {
      if (state.revealed) return idempotent(state);
      const submitted = state.players
        .filter((pid) => typeof state.guesses[pid] === 'number')
        .map((pid) => ({ playerId: pid, value: state.guesses[pid] as number }));
      if (submitted.length === 0) return deny('还没有人交猜测');
      const board = buildBoard(submitted);
      const next: WitsWagersSimState = {
        ...state,
        revealed: true,
        board,
        activityLogs: pushSimLog(state.activityLogs, `亮牌：${submitted.length} 个猜测排上版图`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_guesses_revealed', board }], effects: [system('猜测已亮牌，版图与赔率已排好')] };
    }
    case 'sim:reveal_answer': {
      const question = currentQuestion(state);
      if (!question) return deny('当前没有题目');
      const answerRevealed = !state.answerRevealed;
      const next: WitsWagersSimState = {
        ...state,
        answerRevealed,
        activityLogs: pushSimLog(state.activityLogs, answerRevealed ? `公布答案：${question.answer} ${question.unit}` : '答案已盖回', now),
      };
      const events: WitsWagersSimEvent[] = answerRevealed ? [{ type: 'sim_answer_revealed', answer: question.answer }] : [];
      return { ok: true, nextState: next, events, effects: answerRevealed ? [system(`标准答案：${question.answer} ${question.unit}`)] : [] };
    }
    case 'sim:place_chip': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      if (!CHIP_IDS.includes(action.chipId)) return deny('筹码编号无效');
      if (action.targetId !== null && !state.board.some((t) => t.id === action.targetId)) return deny('目标槽位不在版图上');
      const pair = state.chips[action.playerId] ?? emptyChips();
      const nextPair = pair.map((c) => (c.chipId === action.chipId ? { chipId: c.chipId, targetId: action.targetId } : c)) as SimChipPair;
      const label = action.targetId === null ? '收回' : `押在 ${describeTarget(state, action.targetId)}`;
      const next: WitsWagersSimState = {
        ...state,
        chips: { ...state.chips, [action.playerId]: nextPair },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 把筹码 ${action.chipId} ${label}`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:adjust_money': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      if (!Number.isSafeInteger(action.delta) || action.delta === 0) return deny('金额变化必须是非零整数');
      const current = state.money[action.playerId] ?? 0;
      const after = current + action.delta;
      if (after < 0) return deny('钞票不能为负');
      if (after > MAX_MONEY) return deny('钞票超过上限');
      const next: WitsWagersSimState = {
        ...state,
        money: { ...state.money, [action.playerId]: after },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} ${action.delta > 0 ? '收入' : '支出'} ${Math.abs(action.delta)} 分（现 ${after}）`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    case 'sim:reset_round': {
      const next = { ...clearRound(state), activityLogs: pushSimLog(state.activityLogs, '本题重来：猜测、版图与筹码已清空', now) };
      return { ok: true, nextState: next, events: [], effects: [system('本题重来')] };
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
      const next: WitsWagersSimState = {
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
      const next: WitsWagersSimState = {
        ...state,
        props: { ...state.props, timer: nextTimer },
        activityLogs: exploded ? pushSimLog(state.activityLogs, '到点！', now) : state.activityLogs,
      };
      const events: WitsWagersSimEvent[] = exploded ? [{ type: 'sim_timer_exploded' }] : [];
      return { ok: true, nextState: next, events, effects: exploded ? [system('到点！')] : [] };
    }
    case 'sim:roll_dice': {
      if (!state.players.includes(action.playerId)) return deny('玩家不在本局');
      const dice = state.props.dice;
      if (dice === null) return deny('桌上没有骰子');
      const rolled = rollSimDice(dice, random, action.playerId);
      const next: WitsWagersSimState = {
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
      const next: WitsWagersSimState = {
        ...state,
        props: { ...state.props, bell: nextBell },
        activityLogs: pushSimLog(state.activityLogs, `${action.playerId} 拍铃${first ? '（首响）' : ''}`, now),
      };
      return { ok: true, nextState: next, events: [{ type: 'sim_bell_rung', playerId: action.playerId, first }], effects: [system(first ? `${action.playerId} 拍下第一声铃！` : `${action.playerId} 又拍了一下铃`)] };
    }
    case 'player_forfeited': {
      const forfeited = new Set(action.playerIds);
      const keep = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([p]) => !forfeited.has(p))) as Record<string, T>;
      const next: WitsWagersSimState = {
        ...state,
        players: state.players.filter((p) => !forfeited.has(p)),
        guesses: keep(state.guesses),
        chips: keep(state.chips),
        money: keep(state.money),
        activityLogs: pushSimLog(state.activityLogs, `${action.playerIds.join('、')} 退出对局`, now),
      };
      return { ok: true, nextState: next, events: [], effects: [] };
    }
    default: {
      return deny('未知的模拟操作');
    }
  }
}

function describeTarget(state: WitsWagersSimState, id: TargetId): string {
  const target = state.board.find((t) => t.id === id);
  if (!target) return id;
  return target.id === 'lower' ? '「更低」' : `${target.value}（×${target.odds}）`;
}

export function assertWitsWagersSimInvariants(state: WitsWagersSimState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.phase !== 'sim') throw new Error('阶段必须是 sim');
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复 ID');
  if (state.questionHistory.length === 0) throw new Error('模拟模式开局必须已抽题');
  for (const pid of state.players) {
    if (typeof state.money[pid] !== 'number' || state.money[pid]! < 0) throw new Error(`玩家 ${pid} 钞票无效`);
    const pair = state.chips[pid];
    if (!pair || pair.length !== 2 || pair[0].chipId !== 'A' || pair[1].chipId !== 'B') throw new Error(`玩家 ${pid} 筹码对无效`);
    for (const chip of pair) {
      if (chip.targetId !== null && !state.board.some((t) => t.id === chip.targetId)) throw new Error(`玩家 ${pid} 的筹码指向不存在的槽位`);
    }
  }
  if (!state.revealed && state.board.length !== 0) throw new Error('亮牌前版图必须为空');
  if (state.board.length > 0) {
    if (state.board[0]?.id !== 'lower') throw new Error('版图必须以 lower 开头');
    if (state.board.some((t) => (t.id as string) === 'higher')) throw new Error('版图不得含已删除的 higher');
  }
  if (!Array.isArray(state.activityLogs)) throw new Error('活动日志必须是数组');
}
