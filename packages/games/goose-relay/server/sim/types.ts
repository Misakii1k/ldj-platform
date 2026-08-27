/**
 * 以鹅传鹅 桌面模拟模式 goose_relay_sim_v1。
 *
 * 不做接力/指认/投票/胜负：只提供随机候选鹅卡展示、随机头鹅指派
 * 与仅头鹅私密可见的案情卡，以及骰子/计时器/按铃等通用道具。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { CharacterId } from '../types.ts';

export interface GooseRelaySimConfig {
  rulesetId?: 'goose_relay_sim_v1';
  /** 候选鹅卡数量，默认 9 */
  candidateCount?: number;
}

export interface ResolvedGooseRelaySimConfig {
  rulesetId?: 'goose_relay_sim_v1';
  candidateCount: number;
}

export interface GooseRelaySimCase {
  murderer: CharacterId;
  victim: CharacterId;
}

export interface GooseRelaySimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedGooseRelaySimConfig;
  /** 公开展示的候选鹅卡 */
  candidateCards: CharacterId[];
  /** 随机指派头鹅（公开） */
  headPlayerId: string;
  /** 案情卡（仅头鹅视图可见） */
  caseCard: GooseRelaySimCase | null;
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type GooseRelaySimAction =
  | { type: 'begin' }
  | { type: 'sim:redeal'; playerId: string }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type GooseRelaySimEvent =
  | { type: 'sim_redealt' }
  | { type: 'sim_bell_rung'; playerId: string; first: boolean }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] };

export interface GooseRelaySimPropsView {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface GooseRelaySimPublicView {
  gameId: 'goose-relay';
  rulesetId: 'goose_relay_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  candidateCards: CharacterId[];
  headPlayerId: string;
  props: GooseRelaySimPropsView;
  activityLogs: SimLogEntry[];
}

export interface GooseRelaySimPlayerView extends GooseRelaySimPublicView {
  me: { playerId: string; isHead: boolean; caseCard: GooseRelaySimCase | null } | null;
}
