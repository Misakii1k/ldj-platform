/**
 * 铃铛对决（Ding）桌面模拟模式 bell_clash_sim_v1。
 *
 * 不做系统规则/记分/胜负判定：只提供主题牌库（颜色/数字/短语卡）的
 * 随机发牌、翻牌、桌面出牌，以及按铃/骰子/计时器道具与活动日志。
 * 私密内容仅本人可见（手牌）；resultCandidate 恒为 null。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { BellClashCard } from '../types.ts';

export interface BellClashSimConfig {
  rulesetId?: 'bell_clash_sim_v1';
  /** 每名玩家初始手牌数，默认 8 */
  handSize?: number;
}

export interface ResolvedBellClashSimConfig {
  rulesetId?: 'bell_clash_sim_v1';
  handSize: number;
}

export interface SimTableCard {
  card: BellClashCard;
  playedBy: string;
}

export interface BellClashSimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedBellClashSimConfig;
  /** 私密手牌（仅本人视图可见） */
  hands: Record<string, BellClashCard[]>;
  /** 抽牌堆 */
  drawPile: BellClashCard[];
  /** 桌面当前展示牌（最近一张打出/翻出的牌） */
  discardTop: BellClashCard | null;
  /** 桌面公开出牌区 */
  tableCards: SimTableCard[];
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type BellClashSimAction =
  | { type: 'begin' }
  | { type: 'sim:redeal' }
  | { type: 'sim:draw'; playerId: string }
  | { type: 'sim:deal_all'; playerId: string }
  | { type: 'sim:play_table'; playerId: string; cardIndex: number }
  | { type: 'sim:flip_top'; playerId: string }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type BellClashSimEvent =
  | { type: 'sim_bell_rung'; playerId: string; first: boolean }
  | { type: 'sim_card_played'; playerId: string; card: BellClashCard }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] };

export interface BellClashSimPropsView {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface BellClashSimPublicView {
  gameId: 'bell-clash';
  rulesetId: 'bell_clash_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  discardTop: BellClashCard | null;
  tableCards: SimTableCard[];
  props: BellClashSimPropsView;
  activityLogs: SimLogEntry[];
}

export interface BellClashSimPlayerView extends BellClashSimPublicView {
  me: { playerId: string; hand: BellClashCard[] } | null;
}
