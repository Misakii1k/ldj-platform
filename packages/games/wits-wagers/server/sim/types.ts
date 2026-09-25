/**
 * 一智千金桌面模拟模式 wits_wagers_sim_v1。
 *
 * 把 App 降格成线下桌游的电子道具：服务端只管抽题、收秘密猜测、亮牌后排版图算赔率、
 * 翻面公开标准答案；筹码摆放与钞票加减是自由道具，不校验余额、不结算、不判胜负。
 * 私密内容只有两样：亮牌前的猜测数值、翻面前的标准答案。resultCandidate 恒为 null。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { BoardTarget, ChipId, TargetId } from '../board.ts';
import type { Question } from '../types.ts';

export interface WitsWagersSimConfig {
  rulesetId?: 'wits_wagers_sim_v1';
  /** 每人起始钞票（分），默认与正式模式一致为 2 */
  startingMoney?: number;
}

export interface ResolvedWitsWagersSimConfig {
  rulesetId: 'wits_wagers_sim_v1';
  startingMoney: number;
}

export interface SimChip {
  chipId: ChipId;
  targetId: TargetId | null;
}

export type SimChipPair = [SimChip, SimChip];

export interface WitsWagersSimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedWitsWagersSimConfig;
  /** 本局已抽过的题，按顺序；当前题永远是最后一道 */
  questionHistory: Question[];
  /** 标准答案是否已翻面公开 */
  answerRevealed: boolean;
  /** 私密猜测：亮牌前只进本人视图 */
  guesses: Record<string, number | null>;
  /** 猜测是否已集体亮牌 */
  revealed: boolean;
  /** 亮牌后由 buildBoard 排出的版图；亮牌前为空 */
  board: BoardTarget[];
  chips: Record<string, SimChipPair>;
  money: Record<string, number>;
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type WitsWagersSimAction =
  | { type: 'begin' }
  | { type: 'sim:next_question' }
  | { type: 'sim:submit_guess'; playerId: string; value: number }
  | { type: 'sim:reveal_guesses' }
  | { type: 'sim:reveal_answer' }
  | { type: 'sim:place_chip'; playerId: string; chipId: ChipId; targetId: TargetId | null }
  | { type: 'sim:adjust_money'; playerId: string; delta: number }
  | { type: 'sim:reset_round' }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type WitsWagersSimEvent =
  | { type: 'sim_guesses_revealed'; board: BoardTarget[] }
  | { type: 'sim_answer_revealed'; answer: number }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] }
  | { type: 'sim_bell_rung'; playerId: string; first: boolean };

/** 题面在任何视图里都公开；answer 只在翻面后出现 */
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
  /** 谁已交了猜测（亮牌前只有这个，没有数值） */
  submittedIds: string[];
  /** 亮牌后才有数值 */
  guesses: Record<string, number> | null;
  board: BoardTarget[];
  chips: Record<string, SimChipPair>;
  money: Record<string, number>;
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export interface WitsWagersSimPlayerView extends WitsWagersSimPublicView {
  me: { playerId: string; myGuess: number | null } | null;
}
