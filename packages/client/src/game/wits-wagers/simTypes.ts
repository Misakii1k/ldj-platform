/**
 * wits_wagers_sim_v1 客户端视角类型与解析器（与服务端 sim/views.ts 形状一一对应）。
 *
 * 契约 C01：客户端不从游戏包导入任何东西，这里是 sim 视角在客户端侧的唯一事实源。
 * 私密内容（亮牌前的猜测、翻面前的答案）服务端根本不会发；这里再加一道形状校验，
 * 任何未登记的键或不合法的槽位都失败关闭返回 null。
 */
import type { BoardTargetView, ChipId, Slot, EdgeSlot, TargetId } from './types.ts';

export interface SimTimerState {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isExploded: boolean;
}

export interface SimDiceState {
  diceCount: number;
  sides: number;
  values: number[];
  lastRollBy: string | null;
}

export interface SimBellState {
  rungBy: string | null;
  ringCount: number;
  lastRingAt: number;
}

export interface SimProps {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface SimLogEntry {
  text: string;
  at: number;
}

export interface SimChip {
  chipId: ChipId;
  targetId: TargetId | null;
}

export type SimChipPair = [SimChip, SimChip];

export interface SimQuestionView {
  id: string;
  prompt: string;
  unit: string;
  answer?: number;
}

export interface WitsWagersSimPublicView {
  gameId: 'wits-wagers';
  rulesetId: 'wits_wagers_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  questionNumber: number;
  question: SimQuestionView | null;
  answerRevealed: boolean;
  revealed: boolean;
  submittedIds: string[];
  guesses: Record<string, number> | null;
  board: BoardTargetView[];
  chips: Record<string, SimChipPair>;
  money: Record<string, number>;
  props: SimProps;
  activityLogs: SimLogEntry[];
}

export interface WitsWagersSimPlayerView extends WitsWagersSimPublicView {
  me: { playerId: string; myGuess: number | null } | null;
}

const SLOTS: readonly (Slot | EdgeSlot)[] = ['L3', 'L2', 'L1', 'C', 'R1', 'R2', 'R3', 'LOWER'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isTargetId(v: unknown): v is TargetId {
  if (v === 'lower') return true;
  return typeof v === 'string' && /^g:[1-9]\d*$/.test(v);
}

function parseBoardTarget(input: unknown): BoardTargetView | null {
  if (!isObject(input)) return null;
  if (!isTargetId(input.id)) return null;
  if (typeof input.slot !== 'string' || !SLOTS.includes(input.slot as Slot | EdgeSlot)) return null;
  if (typeof input.odds !== 'number') return null;
  if (!isStringArray(input.authors)) return null;
  if (input.id === 'lower') {
    if (input.value !== null || input.slot !== 'LOWER') return null;
  } else {
    if (typeof input.value !== 'number' || input.slot === 'LOWER') return null;
  }
  return {
    id: input.id,
    value: input.value as number | null,
    slot: input.slot as Slot | EdgeSlot,
    odds: input.odds,
    authors: input.authors,
  };
}

function parseChipPair(input: unknown): SimChipPair | null {
  if (!Array.isArray(input) || input.length !== 2) return null;
  const out: SimChip[] = [];
  for (const [idx, raw] of input.entries()) {
    if (!isObject(raw)) return null;
    const expected: ChipId = idx === 0 ? 'A' : 'B';
    if (raw.chipId !== expected) return null;
    if (raw.targetId !== null && !isTargetId(raw.targetId)) return null;
    out.push({ chipId: expected, targetId: raw.targetId as TargetId | null });
  }
  return [out[0]!, out[1]!];
}

function parseNumberRecord(input: unknown): Record<string, number> | null {
  if (!isObject(input)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v !== 'number') return null;
    out[k] = v;
  }
  return out;
}

function parseQuestion(input: unknown): SimQuestionView | null {
  if (!isObject(input)) return null;
  if (typeof input.id !== 'string' || typeof input.prompt !== 'string' || typeof input.unit !== 'string') return null;
  const q: SimQuestionView = { id: input.id, prompt: input.prompt, unit: input.unit };
  if (input.answer !== undefined) {
    if (typeof input.answer !== 'number') return null;
    q.answer = input.answer;
  }
  return q;
}

function parseLogs(input: unknown): SimLogEntry[] | null {
  if (!Array.isArray(input)) return null;
  const logs: SimLogEntry[] = [];
  for (const item of input) {
    if (!isObject(item) || typeof item.text !== 'string' || typeof item.at !== 'number') return null;
    logs.push({ text: item.text, at: item.at });
  }
  return logs;
}

function parseProps(input: unknown): SimProps | null {
  if (!isObject(input)) return null;
  const timerRaw = input.timer;
  const timer = timerRaw === null ? null : isObject(timerRaw) && typeof timerRaw.durationSeconds === 'number' && typeof timerRaw.remainingSeconds === 'number' && typeof timerRaw.isRunning === 'boolean' && typeof timerRaw.isExploded === 'boolean'
    ? { durationSeconds: timerRaw.durationSeconds, remainingSeconds: timerRaw.remainingSeconds, isRunning: timerRaw.isRunning, isExploded: timerRaw.isExploded }
    : null;
  if (input.timer !== null && timer === null) return null;
  const diceRaw = input.dice;
  const dice = diceRaw === null ? null : isObject(diceRaw) && Array.isArray(diceRaw.values) && typeof diceRaw.diceCount === 'number' && typeof diceRaw.sides === 'number'
    ? { diceCount: diceRaw.diceCount, sides: diceRaw.sides, values: diceRaw.values as number[], lastRollBy: typeof diceRaw.lastRollBy === 'string' ? diceRaw.lastRollBy : null }
    : null;
  if (input.dice !== null && dice === null) return null;
  const bellRaw = input.bell;
  const bell = bellRaw === null ? null : isObject(bellRaw) && typeof bellRaw.ringCount === 'number'
    ? { rungBy: typeof bellRaw.rungBy === 'string' ? bellRaw.rungBy : null, ringCount: bellRaw.ringCount, lastRingAt: typeof bellRaw.lastRingAt === 'number' ? bellRaw.lastRingAt : 0 }
    : null;
  if (input.bell !== null && bell === null) return null;
  return { timer, dice, bell };
}

export function parseWitsWagersSimView(input: unknown): WitsWagersSimPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'wits-wagers' || input.rulesetId !== 'wits_wagers_sim_v1' || input.schemaVersion !== 1) return null;
  if (input.phase !== 'sim') return null;
  if (!isStringArray(input.players)) return null;
  if (typeof input.questionNumber !== 'number') return null;
  const question = input.question === null ? null : parseQuestion(input.question);
  if (input.question !== null && question === null) return null;
  if (typeof input.answerRevealed !== 'boolean' || typeof input.revealed !== 'boolean') return null;
  if (!isStringArray(input.submittedIds)) return null;
  const guesses = input.guesses === null ? null : parseNumberRecord(input.guesses);
  if (input.guesses !== null && guesses === null) return null;

  if (!Array.isArray(input.board)) return null;
  const board: BoardTargetView[] = [];
  for (const raw of input.board) {
    const t = parseBoardTarget(raw);
    if (t === null) return null;
    board.push(t);
  }

  if (!isObject(input.chips)) return null;
  const chips: Record<string, SimChipPair> = {};
  for (const [pid, raw] of Object.entries(input.chips)) {
    const pair = parseChipPair(raw);
    if (pair === null) return null;
    chips[pid] = pair;
  }

  const money = parseNumberRecord(input.money);
  if (money === null) return null;
  const props = parseProps(input.props);
  if (props === null) return null;
  const activityLogs = parseLogs(input.activityLogs);
  if (activityLogs === null) return null;

  const base: WitsWagersSimPublicView = {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: input.players,
    questionNumber: input.questionNumber,
    question,
    answerRevealed: input.answerRevealed,
    revealed: input.revealed,
    submittedIds: input.submittedIds,
    guesses,
    board,
    chips,
    money,
    props,
    activityLogs,
  };

  if (input.me === null || input.me === undefined) {
    return { ...base, me: null };
  }
  if (!isObject(input.me) || typeof input.me.playerId !== 'string') return null;
  if (input.me.myGuess !== null && typeof input.me.myGuess !== 'number') return null;
  return { ...base, me: { playerId: input.me.playerId, myGuess: input.me.myGuess as number | null } };
}
