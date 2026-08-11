/**
 * 铃铛对决（Ding）bell_clash_v1 —— 原版规则基线类型。
 *
 * 原版《Ding! 眼急脑快》（HUCH 原版 + 一刻馆，2–7 人）核心机制（2026-08-10 调研，C 级）：
 * - UNO 式出牌：打出同颜色或同数字的牌；打不出就摸一张。
 * - 每人 8 张手牌，先打完者获胜。
 * - 行动短语卡：牌上印一句话；若有人说了/做了牌上写的事，可"拍铃"直接轮到自己的回合并打出这张牌。
 * 牌库为平台原创设计（不复制原版牌表），机制忠实原版。
 */
import type { GameEffect } from '@ldj/shared';

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type CardColor = (typeof COLORS)[number];

export interface NumberCard {
  kind: 'number';
  color: CardColor;
  number: number;
}

/** 行动短语卡：印一句话；有人说出该短语时可被按铃抢回合 */
export interface PhraseCard {
  kind: 'phrase';
  color: CardColor;
  phrase: string;
}

export type BellClashCard = NumberCard | PhraseCard;

export type BellClashPhase = 'playing' | 'game_over';

export interface BellClashConfig {
  rulesetId?: 'bell_clash_v1';
  /** 每名玩家手牌数，默认 8 */
  handSize?: number;
  /** 出牌阶段时长（秒），默认 30 */
  turnSeconds?: number;
  /** 按铃窗口时长（秒），默认 10 */
  bellSeconds?: number;
}

export interface ResolvedBellClashConfig {
  rulesetId?: 'bell_clash_v1';
  handSize: number;
  turnSeconds: number;
  bellSeconds: number;
}

export interface BellClashState {
  schemaVersion: 1;
  phase: BellClashPhase;
  players: string[];
  config: ResolvedBellClashConfig;
  /** 每人手牌 */
  hands: Record<string, BellClashCard[]>;
  /** 抽牌堆 */
  drawPile: BellClashCard[];
  /** 弃牌堆顶（当前可接的牌）；null 表示开局 */
  discardTop: BellClashCard | null;
  /** 当前出牌者 */
  currentPlayerId: string;
  /** 是否处于按铃窗口（顶牌为短语卡且尚未被拍） */
  bellOpen: boolean;
  /** 本轮拍铃者（窗口关闭后结算） */
  bellClaimantId: string | null;
  /** 错误拍铃罚摸数 */
  penaltyPulls: Record<string, number>;
  winners: string[];
}

export type BellClashAction =
  | { type: 'begin' }
  | { type: 'play_card'; playerId: string; cardIndex: number }
  | { type: 'draw_card'; playerId: string }
  | { type: 'ring_bell'; playerId: string }
  | { type: 'resolve_bell'; claimantId: string } // 空字符串 = 无人拍铃
  | { type: 'turn_timeout'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type BellClashEvent =
  | { type: 'game_started' }
  | { type: 'card_played'; playerId: string; card: BellClashCard }
  | { type: 'card_drawn'; playerId: string }
  | { type: 'bell_opened' }
  | { type: 'bell_rung'; claimantId: string }
  | { type: 'bell_resolved'; claimantId: string; wonTurn: boolean }
  | { type: 'turn_passed'; playerId: string }
  | { type: 'game_finished'; winners: string[] };

export type BellClashReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: BellClashState; events: BellClashEvent[]; effects: GameEffect[] };

export interface BellClashPublicView {
  gameId: 'bell-clash';
  rulesetId: 'bell_clash_v1';
  schemaVersion: 1;
  phase: BellClashPhase;
  players: string[];
  /** 手牌张数（他人） */
  handCounts: Record<string, number>;
  /** 当前出牌者 */
  currentPlayerId: string;
  /** 弃牌堆顶 */
  discardTop: BellClashCard | null;
  /** 按铃窗口状态 */
  bellOpen: boolean;
  bellClaimantId: string | null;
  /** 抽牌堆剩余 */
  drawCount: number;
  winners: string[];
}

export interface BellClashPlayerView extends BellClashPublicView {
  me: {
    playerId: string;
    hand: BellClashCard[];
  } | null;
}

export interface BellClashResult {
  winners: string[];
}
