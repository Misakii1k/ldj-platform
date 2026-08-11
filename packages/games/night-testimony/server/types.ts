/**
 * 囚徒之夜（暗夜证词）night_testimony_v1 —— 原版规则基线类型。
 *
 * 原版《囚徒之夜》（台湾嘴嘴出版社，3–6 人）核心机制（2026-08-10 调研，A/B 级）：
 * - 一名狱警伪装成囚犯潜伏；囚犯各有罪行卡，凭"罪行卡"蛛丝马迹辨识狱警。
 * - 每人持有 3 个 YES + 1 个 NO 标记；问答阶段翻问题卡提问，囚犯按自己罪行如实回答，
 *   狱警可以撒谎；YES 留作公开轨迹，NO 回答完收回。
 * - 问答结束（某玩家 YES 用完或问满 N 问）→ 推理阶段：额外加入一张罪行卡混入公开辩论。
 * - 票选阶段：投票决定嫌疑人，被票选者公开身份。
 * - 胜负：最高票是囚犯 → 狱警胜利；最高票是狱警 → 狱警猜全部囚犯罪行，
 *   全对则狱警单独获胜，否则囚犯获胜。
 */
import type { GameEffect } from '@ldj/shared';

export const YES_COUNT = 3;
export const NO_COUNT = 1;

/** 罪行池（原创表达，不复制原版罪刑名称） */
export const CRIMES = ['arson', 'theft', 'forgery', 'smuggling', 'fraud', 'kidnap'] as const;
export type CrimeId = (typeof CRIMES)[number];

export type NightTestimonyPhase = 'question' | 'deduction' | 'vote' | 'game_over';

export interface NightTestimonyConfig {
  rulesetId?: 'night_testimony_v1';
  /** 问答阶段时长（秒），默认 120 */
  questionSeconds?: number;
  /** 推理讨论时长（秒），默认 60 */
  deductionSeconds?: number;
  /** 投票时长（秒），默认 30 */
  voteSeconds?: number;
  /** 问答上限（默认 = 玩家数） */
  questionLimit?: number;
}

export interface ResolvedNightTestimonyConfig {
  rulesetId?: 'night_testimony_v1';
  questionSeconds: number;
  deductionSeconds: number;
  voteSeconds: number;
  questionLimit: number;
}

export interface AnswerRecord {
  questionerId: string;
  responderId: string;
  question: string;
  /** YES 公开轨迹；NO 不公开（标记收回） */
  answer: 'yes' | 'no';
}

export interface NightTestimonyState {
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  config: ResolvedNightTestimonyConfig;
  /** 狱警玩家 ID */
  wardenId: string;
  /** 每名囚犯的罪行卡（狱警无罪行卡） */
  crimes: Record<string, CrimeId>;
  /** 玩家剩余 YES 标记 */
  yesLeft: Record<string, number>;
  /** 玩家剩余 NO 标记 */
  noLeft: Record<string, number>;
  /** 问答记录（含 YES 轨迹与 NO 消耗） */
  answers: AnswerRecord[];
  /** 推理阶段额外加入的罪行卡（公开混入） */
  extraCrime: CrimeId | null;
  /** 当前待回答的问题（提问者 → 问题文本）；null 表示无待答 */
  pendingQuestion: { questionerId: string; responderId: string; text: string } | null;
  /** 投票：投票者 → 目标 */
  votes: Record<string, string>;
  /** 被票选者（待揭示身份） */
  accusedId: string | null;
  /** 狱警是否被票出 */
  wardenRevealed: boolean | null;
  /** 狱警猜罪：囚犯 → 猜测罪行 */
  wardenGuesses: Record<string, CrimeId> | null;
  /** 猜罪全部正确 */
  crimesAllGuessed: boolean | null;
  winners: string[];
}

export type NightTestimonyAction =
  | { type: 'begin' }
  | { type: 'ask'; playerId: string; targetPlayerId: string; text: string }
  | { type: 'answer'; playerId: string; answer: 'yes' | 'no' }
  | { type: 'resolve_question' } // 问答计时器/上限兜底
  | { type: 'end_deduction' }
  | { type: 'cast_vote'; playerId: string; targetPlayerId: string }
  | { type: 'resolve_vote' }
  | { type: 'submit_guesses'; playerId: string; guesses: Record<string, CrimeId> }
  | { type: 'player_forfeited'; playerIds: string[] };

export type NightTestimonyEvent =
  | { type: 'question_started' }
  | { type: 'question_asked'; questionerId: string; responderId: string; text: string }
  | { type: 'answered'; questionerId: string; responderId: string; answer: 'yes' | 'no' }
  | { type: 'deduction_started'; extraCrime: CrimeId }
  | { type: 'vote_started' }
  | { type: 'vote_cast'; playerId: string }
  | { type: 'accused_revealed'; accusedId: string; isWarden: boolean }
  | { type: 'game_finished'; winners: string[] };

export type NightTestimonyReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: NightTestimonyState; events: NightTestimonyEvent[]; effects: GameEffect[] };

/** 终局披露 */
export interface NightTestimonyReveal {
  wardenId: string;
  crimes: Record<string, CrimeId>;
  answers: AnswerRecord[];
  extraCrime: CrimeId | null;
  accusedId: string | null;
  wardenRevealed: boolean;
  wardenGuesses: Record<string, CrimeId> | null;
  crimesAllGuessed: boolean;
}

export interface NightTestimonyPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_v1';
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  /** YES 公开轨迹（question 阶段起公开） */
  yesTrack: AnswerRecord[];
  /** 已问问题数 */
  askedCount: number;
  questionLimit: number;
  /** 推理阶段公开的额外罪行卡 */
  extraCrime: CrimeId | null;
  /** 是否有待回答的问题 */
  hasPendingQuestion: boolean;
  /** 票选已揭示的身份 */
  accusedId: string | null;
  wardenRevealed: boolean | null;
  /** 是否已进入猜罪环节 */
  guessingInProgress: boolean;
  winners: string[];
  reveal: NightTestimonyReveal | null;
}

export interface NightTestimonyPlayerView extends NightTestimonyPublicView {
  me: {
    playerId: string;
    isWarden: boolean;
    /** 我的罪行卡（狱警为 null） */
    crime: CrimeId | null;
    yesLeft: number;
    noLeft: number;
    /** 轮到我回答的问题（若有） */
    pendingQuestion: { questionerId: string; text: string } | null;
  } | null;
}

export interface NightTestimonyResult {
  winners: string[];
  wardenRevealed: boolean;
  crimesAllGuessed: boolean;
}
