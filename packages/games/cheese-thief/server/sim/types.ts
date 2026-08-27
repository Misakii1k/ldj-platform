/**
 * 奶酪大盗 桌面模拟模式 cheese_thief_sim_v1。
 *
 * 不做夜间偷奶酪/投票/胜负：只提供私密苏醒时辰掷骰、私密身份角色牌分配
 * 与骰子/计时器/按铃等通用道具。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { RoleCard } from '../types.ts';

export interface CheeseThiefSimConfig {
  rulesetId?: 'cheese_thief_sim_v1';
  /** 是否启用身份角色牌（猫/狗/白鼠），默认关 */
  roleCards?: boolean;
}

export interface ResolvedCheeseThiefSimConfig {
  rulesetId?: 'cheese_thief_sim_v1';
  roleCards: boolean;
}

export interface CheeseThiefSimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedCheeseThiefSimConfig;
  /** 私密苏醒时辰（每人 1–6） */
  wakeHours: Record<string, number>;
  /** 私密身份角色牌（可选） */
  roleCards: Record<string, RoleCard>;
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type CheeseThiefSimAction =
  | { type: 'begin' }
  | { type: 'sim:assign_wake'; playerId: string }
  | { type: 'sim:assign_roles'; playerId: string }
  | { type: 'sim:clear_roles'; playerId: string }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type CheeseThiefSimEvent =
  | { type: 'sim_wake_rolled' }
  | { type: 'sim_roles_assigned' }
  | { type: 'sim_bell_rung'; playerId: string; first: boolean }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] };

export interface CheeseThiefSimPropsView {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface CheeseThiefSimPublicView {
  gameId: 'cheese-thief';
  rulesetId: 'cheese_thief_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  roleCardsEnabled: boolean;
  props: CheeseThiefSimPropsView;
  activityLogs: SimLogEntry[];
}

export interface CheeseThiefSimPlayerView extends CheeseThiefSimPublicView {
  me: { playerId: string; wakeHour: number | null; roleCard: RoleCard | null } | null;
}
