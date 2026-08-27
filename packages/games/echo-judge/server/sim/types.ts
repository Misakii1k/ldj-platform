/**
 * 伪人测试 桌面模拟模式 echo_judge_sim_v1。
 *
 * 不做伪人判定/记分：只提供随机词条私密分配与题卡抽取道具，
 * 以及骰子/计时器/按铃等通用道具。私密内容仅本人可见。
 */
import type { SimBellState, SimDiceState, SimLogEntry, SimTimerState } from '@ldj/shared';
import type { TopicCard } from '../questionDeck.ts';

export interface EchoJudgeSimConfig {
  rulesetId?: 'echo_judge_sim_v1';
}

export interface ResolvedEchoJudgeSimConfig {
  rulesetId?: 'echo_judge_sim_v1';
}

export interface EchoJudgeSimState {
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  config: ResolvedEchoJudgeSimConfig;
  /** 私密触发词（每人 1 个，仅本人视图可见） */
  triggerWords: Record<string, string>;
  /** 公开题卡展示区 */
  topicArea: { card: TopicCard; revealedBy: string } | null;
  /** 已抽过的题卡 ID（重抽时避开） */
  usedTopicIds: string[];
  props: {
    timer: SimTimerState | null;
    dice: SimDiceState | null;
    bell: SimBellState | null;
  };
  activityLogs: SimLogEntry[];
}

export type EchoJudgeSimAction =
  | { type: 'begin' }
  | { type: 'sim:assign_words'; playerId: string }
  | { type: 'sim:draw_topic'; playerId: string }
  | { type: 'sim:clear_topic'; playerId: string }
  | { type: 'sim:operate_timer'; playerId: string; op: 'start' | 'pause' | 'reset' | 'set'; durationSeconds?: number }
  | { type: 'sim:tick_timer' }
  | { type: 'sim:roll_dice'; playerId: string }
  | { type: 'sim:ring_bell'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type EchoJudgeSimEvent =
  | { type: 'sim_topic_drawn'; cardId: string }
  | { type: 'sim_bell_rung'; playerId: string; first: boolean }
  | { type: 'sim_timer_exploded' }
  | { type: 'sim_dice_rolled'; playerId: string; values: number[] };

export interface EchoJudgeSimPropsView {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface EchoJudgeSimPublicView {
  gameId: 'echo-judge';
  rulesetId: 'echo_judge_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  topicArea: { card: TopicCard; revealedBy: string } | null;
  usedTopicCount: number;
  props: EchoJudgeSimPropsView;
  activityLogs: SimLogEntry[];
}

export interface EchoJudgeSimPlayerView extends EchoJudgeSimPublicView {
  me: { playerId: string; triggerWord: string | null } | null;
}
