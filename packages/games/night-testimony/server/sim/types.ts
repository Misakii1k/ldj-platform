/**
 * 囚徒之夜 桌面模拟模式 night_testimony_sim_v1。
 *
 * 不做票选/猜罪/记分：只提供随机罪行私密分配（含随机狱警标记与干扰罪行卡）
 * 与问题卡抽取道具，以及骰子/计时器/按铃等通用道具。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { CrimeId } from '../types.ts';
import type { QuestionCard } from '../questionDeck.ts';

export interface NightTestimonySimConfig {
  rulesetId?: 'night_testimony_sim_v1';
}

export interface ResolvedNightTestimonySimConfig {
  rulesetId?: 'night_testimony_sim_v1';
}

export interface NightTestimonySimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedNightTestimonySimConfig;
  /** 私密罪行（狱警无罪行） */
  crimes: Record<string, CrimeId>;
  /** 随机狱警（仅本人视图可见） */
  wardenId: string;
  /** 干扰罪行卡（公开展示） */
  extraCrime: CrimeId | null;
  /** 公开问题卡展示区 */
  questionArea: { card: QuestionCard; revealedBy: string } | null;
  /** 已抽问题卡 ID */
  usedQuestionIds: string[];
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type NightTestimonySimAction =
  | { type: 'begin' }
  | { type: 'sim:assign_crimes'; playerId: string }
  | { type: 'sim:draw_question'; playerId: string }
  | { type: 'sim:clear_question'; playerId: string }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type NightTestimonySimEvent =
  | { type: 'sim_question_drawn'; cardId: string }
  | { type: 'sim_bell_rung'; playerId: string; first: boolean }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] };

export interface NightTestimonySimPropsView {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface NightTestimonySimPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  extraCrime: CrimeId | null;
  questionArea: { card: QuestionCard; revealedBy: string } | null;
  usedQuestionCount: number;
  props: NightTestimonySimPropsView;
  activityLogs: SimLogEntry[];
}

export interface NightTestimonySimPlayerView extends NightTestimonySimPublicView {
  me: { playerId: string; isWarden: boolean; crime: CrimeId | null } | null;
}
