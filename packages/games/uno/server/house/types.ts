/**
 * uno_platform_house_v1 — 类型基础（只读纯类型 + 计时器 id 纯函数）。
 *
 * 与 legacy UNO（server/module.ts）完全隔离：本文件只声明类型与极小的纯字符串
 * 辅助函数，不包含任何规则逻辑，也不引入 legacy 类型。rulesetId 由平台层注入，
 * 不在 config 中声明。
 */

export type UnoHouseColor = 'red' | 'yellow' | 'green' | 'blue';

export type UnoHouseCardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

/** 每张牌的 id 在整局内唯一：`r<round>:g<generation>:<baseId>`，例如 `r1:g0:red-5-1`。 */
export type UnoHouseCard =
  | { readonly id: string; readonly kind: 'number'; readonly color: UnoHouseColor; readonly value: number }
  | { readonly id: string; readonly kind: 'skip' | 'reverse' | 'draw2'; readonly color: UnoHouseColor }
  | { readonly id: string; readonly kind: 'wild' | 'wild4' };

export type UnoHouseMode = 'individual' | 'team';

export type UnoHouseRoundCount = 1 | 3 | 5 | 7;

export interface UnoHouseConfig {
  readonly mode: UnoHouseMode;
  readonly roundCount: UnoHouseRoundCount;
}

export type UnoHousePhase = 'round_playing' | 'round_over' | 'match_over';
export type UnoHouseDirection = 1 | -1;

export interface UnoHouseMatchRankingEntry {
  readonly playerId: string;
  readonly total: number;
  readonly rank: number;
}

/** 跨回合 match 账本（mode、回合数、各回合得分、累计分、最终排名）。 */
export interface UnoHouseMatchState {
  readonly mode: UnoHouseMode;
  readonly roundCount: UnoHouseRoundCount;
  readonly currentRound: number;
  readonly roundLimit: UnoHouseRoundCount;
  /** team 模式下 playerId -> teamId；individual 模式为 null。 */
  readonly teamPlayerIds: Readonly<Record<string, string>> | null;
  /** 每回合的每人剩余手牌分（roundScores[roundIndex][playerIndex]）。 */
  readonly roundScores: readonly (readonly number[])[];
  /** 已结算回合的结果（供最终 result 组装）。 */
  readonly roundResults: readonly UnoHouseRoundResult[];
  /** 每人累计分（index 与 players 对齐）。 */
  readonly cumulativeScores: readonly number[];
  /** 仅在 match 结束时生成。 */
  readonly matchRanking: readonly UnoHouseMatchRankingEntry[] | null;
  /** 首回合随机先手；后续回合由上一回合清空手牌的玩家先手。 */
  readonly starterPlayerId: string | null;
  /** 上一回合清空手牌的玩家（下一回合先手来源）。 */
  readonly lastFinisherPlayerId: string | null;
}

export interface UnoHouseChallengeEvidence {
  /** 挑战判定用：该 +4 打出前，源玩家是否握有与顶牌匹配的牌。 */
  readonly heldMatchingBeforePlay: boolean;
  /** 质疑成功时颜色作废：还原为该 +4 出牌前的当前颜色。 */
  readonly colorBeforePlay: UnoHouseColor;
}

export interface UnoHousePendingPenalty {
  readonly total: number;
  readonly kind: 'draw2' | 'draw4';
  readonly responderId: string;
  /** 打出本罚牌的玩家（质疑成功时由他摸罚牌；+4 源玩家）。 */
  readonly sourcePlayerId: string;
  readonly challengeable: boolean;
  readonly challengeEvidence: UnoHouseChallengeEvidence | null;
  readonly windowToken: string;
}

export interface UnoHouseUnoRaceWindow {
  readonly targetPlayerId: string;
  readonly windowToken: string;
  readonly openedAtSequence: number;
  /** 下一个有效出牌/摸牌即提前关闭本窗口。 */
  readonly closesEarlyOnNextEffective: true;
}

/** 单回合内可变状态。 */
export interface UnoHouseRoundState {
  readonly roundNumber: number;
  readonly phase: UnoHousePhase;
  readonly players: readonly string[];
  readonly hands: Readonly<Record<string, readonly UnoHouseCard[]>>;
  readonly deck: readonly UnoHouseCard[];
  readonly discardPile: readonly UnoHouseCard[];
  readonly topDiscard: UnoHouseCard;
  readonly currentColor: UnoHouseColor;
  readonly direction: UnoHouseDirection;
  readonly currentPlayerId: string;
  readonly hasDrawnThisTurn: boolean;
  readonly pendingPenalty: UnoHousePendingPenalty | null;
  readonly unoRaceWindow: UnoHouseUnoRaceWindow | null;
  /** 每回合的预喊 UNO 标记（playerId -> 是否本回合已预喊）。 */
  readonly preCallPlayerIds: Readonly<Record<string, boolean>>;
  /** 本回合已使用的 generation 数量（初始 1：r<round>:g0）。 */
  readonly deckGenerationCount: number;
  /** 每回合唯一的令牌；turn_timeout 用它匹配回合，turnTimerId 用它作用域化。 */
  readonly turnToken: string;
  /** 回合序号（每回合单调递增，用于派生唯一 turnToken）。 */
  readonly turnIndex: number;
  /** 回合内单调递增的有效动作序号；unoRaceWindow.openedAtSequence 引用它。 */
  readonly sequence: number;
  /** 普通回合超时（15s）的截止时间；null 表示当前无回合计时器（如 penalty 窗口期）。 */
  readonly turnDeadlineAt: number | null;
  /** 当前窗口（race/penalty/challenge）截止时间；null 表示无窗口。 */
  readonly windowDeadlineAt: number | null;
}

export interface UnoHouseState {
  readonly match: UnoHouseMatchState;
  readonly round: UnoHouseRoundState;
}

export type UnoHouseAction =
  | { readonly type: 'begin' }
  | {
      readonly type: 'play_card';
      readonly cardId: string;
      readonly declaredColor?: UnoHouseColor;
      readonly preCallUno?: boolean;
    }
  | { readonly type: 'draw_card' }
  | { readonly type: 'pass_after_draw' }
  | { readonly type: 'call_uno' }
  | { readonly type: 'catch_missed_uno'; readonly targetPlayerId: string; readonly windowToken: string }
  | { readonly type: 'stack_penalty'; readonly cardId: string; readonly declaredColor?: UnoHouseColor }
  | { readonly type: 'accept_penalty'; readonly windowToken: string }
  | { readonly type: 'challenge_penalty'; readonly windowToken: string }
  | { readonly type: 'turn_timeout'; readonly round: number; readonly turnToken: string }
  | { readonly type: 'penalty_timeout'; readonly round: number; readonly windowToken: string }
  | { readonly type: 'challenge_timeout'; readonly round: number; readonly windowToken: string }
  | { readonly type: 'uno_race_timeout'; readonly round: number; readonly windowToken: string }
  | { readonly type: 'round_transition' };

export interface UnoHousePlayerSummary {
  readonly playerId: string;
  readonly handCount: number;
  readonly unoCalled: boolean;
  readonly isCurrentPlayer: boolean;
  readonly teamId: string | null;
}

/** 罚牌窗口的公开视图（隐藏 challengeEvidence）。 */
export interface UnoHousePendingPenaltyPublic {
  readonly total: number;
  readonly kind: 'draw2' | 'draw4';
  readonly responderId: string;
  readonly challengeable: boolean;
  readonly windowToken: string;
}

export interface UnoHouseClockInfo {
  readonly turnDeadlineAt: number | null;
  readonly windowDeadlineAt: number | null;
}

export interface UnoHousePublicView {
  readonly gameId: 'uno';
  readonly rulesetId: 'uno_platform_house_v1';
  readonly phase: UnoHousePhase;
  readonly round: number;
  readonly roundLimit: UnoHouseRoundCount;
  readonly mode: UnoHouseMode;
  readonly players: readonly UnoHousePlayerSummary[];
  readonly topDiscard: UnoHouseCard;
  readonly currentColor: UnoHouseColor;
  readonly currentPlayerId: string;
  readonly direction: UnoHouseDirection;
  readonly pendingPenalty: UnoHousePendingPenaltyPublic | null;
  readonly unoRaceWindow: UnoHouseUnoRaceWindow | null;
  readonly deckCount: number;
  readonly discardCount: number;
  readonly roundScores: readonly (readonly number[])[];
  readonly cumulativeScores: readonly number[];
  readonly matchRanking: readonly UnoHouseMatchRankingEntry[] | null;
  readonly clockInfo: UnoHouseClockInfo;
}

export interface UnoHousePlayerMeView {
  readonly playerId: string;
  readonly hand: readonly UnoHouseCard[];
  readonly playableCardIds: readonly string[];
  readonly capabilities: readonly string[];
  readonly hasDrawnThisTurn: boolean;
  readonly isCurrentPlayer: boolean;
  readonly activeWindow: string | null;
}

export interface UnoHousePlayerView extends UnoHousePublicView {
  readonly me: UnoHousePlayerMeView | null;
}

export interface UnoHouseRoundResult {
  readonly roundNumber: number;
  readonly finisherPlayerId: string;
  /** 每人剩余手牌分（清空者 0）。 */
  readonly perPlayerTotals: readonly number[];
  /** team 模式下每队总分；individual 模式为 null。 */
  readonly teamTotals: readonly number[] | null;
  /** individual 低分者（可并列）。 */
  readonly winnerPlayerIds: readonly string[];
  /** team 模式获胜队伍；平局可并列；individual 模式为 null。 */
  readonly teamWinnerIds: readonly string[] | null;
}

export interface UnoHouseResult {
  readonly mode: UnoHouseMode;
  /** individual 模式按累计分低者排出的最终胜者（可并列）。 */
  readonly winnerPlayerIds: readonly string[];
  readonly teamWinnerIds?: readonly string[] | null;
  readonly rounds: readonly UnoHouseRoundResult[];
  readonly ranking: readonly UnoHouseMatchRankingEntry[];
  readonly aborted?: boolean;
}

export type UnoHouseEvent =
  | { readonly type: 'card_played'; readonly playerId: string; readonly card: UnoHouseCard }
  | { readonly type: 'card_drawn'; readonly playerId: string; readonly count: number }
  | { readonly type: 'uno_called'; readonly playerId: string }
  | {
      readonly type: 'missed_uno_caught';
      readonly targetPlayerId: string;
      readonly catcherPlayerId: string;
      readonly windowToken: string;
    }
  | { readonly type: 'penalty_stacked'; readonly playerId: string; readonly card: UnoHouseCard; readonly total: number }
  | { readonly type: 'penalty_accepted'; readonly playerId: string; readonly total: number; readonly windowToken: string }
  | {
      readonly type: 'challenge_resolved';
      readonly challengerPlayerId: string;
      readonly targetPlayerId: string;
      readonly success: boolean;
      readonly windowToken: string;
    }
  | { readonly type: 'round_finished'; readonly roundNumber: number; readonly roundResult: UnoHouseRoundResult }
  | { readonly type: 'match_finished'; readonly roundNumber: number; readonly result: UnoHouseResult }
  | { readonly type: 'phase_changed'; readonly phase: UnoHousePhase; readonly round: number };

/** 计时器 id：以回合号和令牌作用域化，保证全局唯一且相互隔离。 */
export function turnTimerId(round: number, turnToken: string): string {
  return `uno.house.r${round}.turn.${turnToken}`;
}

export function raceTimerId(round: number, windowToken: string): string {
  return `uno.house.r${round}.race.${windowToken}`;
}

export function penaltyTimerId(round: number, windowToken: string): string {
  return `uno.house.r${round}.penalty.${windowToken}`;
}

export function challengeTimerId(round: number, windowToken: string): string {
  return `uno.house.r${round}.challenge.${windowToken}`;
}
