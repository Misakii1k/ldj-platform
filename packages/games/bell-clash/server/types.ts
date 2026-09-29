/**
 * 铃铛对决（Ding）bell_clash_v1 —— 原版规则基线类型。
 *
 * 原版《Ding! 眼急脑快》（HUCH 原版 + 一刻馆，2–7 人）核心机制（2026-09-26 用户确认，C 级）：
 * - UNO 式出牌：打出同颜色或同数字的牌；打不出就摸一张。
 * - 每人 8 张手牌，先打完者获胜。
 * - 行动短语卡：牌上印一句话；任何人、任何时候只要有人做/说了牌上写的事，即可拍铃亮出短语卡抢夺回合。
 * - 质疑投票机制：亮卡后其他在局玩家有约 3 秒质疑投票（点「没做过」），严格过半质疑则判拍错罚摸并放回手牌，否则成功接管回合出牌。
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

/** 行动短语卡：印一句话；任何人看到有人做动作时可随时拍铃亮出抢回合 */
export interface PhraseCard {
  kind: 'phrase';
  color: CardColor;
  phrase: string;
}

export type BellClashCard = NumberCard | PhraseCard;

export type BellClashPhase = 'playing' | 'game_over';

export interface BellClashChallenge {
  /** 拍铃者 */
  claimantId: string;
  /** 亮出的短语卡（已从手里移出，暂存在这里） */
  card: PhraseCard;
  /** 原来在手里的位置（拍错时放回原位） */
  handIndex: number;
  /** 可投票的人 = 除拍铃者外所有在局玩家 */
  voters: string[];
  /** 已点「没做过」的人 */
  doubts: string[];
  /** 已点「有」的人（可选投票，只影响提前结算） */
  confirms: string[];
  /** 拍铃那一刻原本轮到的人 */
  interruptedPlayerId: string;
}

export interface BellClashConfig {
  rulesetId?: 'bell_clash_v1';
  /** 每名玩家手牌数，默认 8 */
  handSize?: number;
  /** 出牌阶段时长（秒），默认 30 */
  turnSeconds?: number;
  /** 质疑投票时长（秒），默认 3，范围 1–30 */
  challengeSeconds?: number;
  /** 旧版配置键兼容（忽略不报错） */
  bellSeconds?: number;
}

export interface ResolvedBellClashConfig {
  rulesetId?: 'bell_clash_v1';
  handSize: number;
  turnSeconds: number;
  challengeSeconds: number;
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
  /** 正在进行的拍铃判定；null 表示没有 */
  challenge: BellClashChallenge | null;
  /** 错误拍铃罚摸数 */
  penaltyPulls: Record<string, number>;
  winners: string[];
  /**
   * 当前计时的截止时刻（与 schedule_timer 的 deadlineAt 同值）。
   * 客户端据此渲染倒计时进度环；终局为 null。
   */
  deadlineAt: number | null;
  /**
   * 这个截止时刻属于哪类计时：回合还是质疑判定。
   * 客户端用它做倒计时环的 phaseKey。
   */
  deadlineKind: 'turn' | 'challenge' | null;
}

export type BellClashAction =
  | { type: 'begin' }
  | { type: 'play_card'; playerId: string; cardIndex: number }
  | { type: 'draw_card'; playerId: string }
  | { type: 'ring_bell'; playerId: string; cardIndex: number }
  | { type: 'challenge_vote'; playerId: string; doubt: boolean }
  | { type: 'challenge_timeout' }
  | { type: 'turn_timeout'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type BellClashEvent =
  | { type: 'game_started' }
  | { type: 'card_played'; playerId: string; card: BellClashCard }
  | { type: 'card_drawn'; playerId: string }
  | { type: 'bell_rung'; claimantId: string; card: PhraseCard }
  | { type: 'bell_resolved'; claimantId: string; success: boolean; doubts: string[] }
  | { type: 'turn_passed'; playerId: string }
  | { type: 'game_finished'; winners: string[] };

export type BellClashReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: BellClashState; events: BellClashEvent[]; effects: GameEffect[] };

export interface BellClashPublicChallenge {
  claimantId: string;
  card: { kind: 'phrase'; color: CardColor; phrase: string };
  voterIds: string[];
  doubtIds: string[];
  confirmIds: string[];
}

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
  /** 拍铃质疑判定状态 */
  challenge: BellClashPublicChallenge | null;
  /** 抽牌堆剩余 */
  drawCount: number;
  winners: string[];
  /** 当前计时截止时刻；终局为 null */
  deadlineAt: number | null;
  /** 截止时刻类别：回合 or 质疑判定 */
  deadlineKind: 'turn' | 'challenge' | null;
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
