/**
 * 伪人测试（判官模式）echo_judge_v1 —— 原版规则基线类型。
 *
 * 原版《伪人测试》（摩点「易溶Studio」2025 众筹，3–12 人）判官模式核心机制（2026-08-10 调研，B/C 级）：
 * - 选定判官出题，秘密分配身份（人类/伪人）；伪人获得秘密"触发词"卡。
 * - 非判官玩家依次回答：人类可以说谎，伪人必须自然地把触发词藏进话里。
 * - 全部答完 → 判官指认一名伪人。
 * - 计分（B/C 级）：判官抓对 +1、被抓伪人 −1、隐藏成功 +2；
 *   判官抓错扣分（原版细则缺失 → 平台裁定 −1）。
 * - 伪人数量：3–4 人 1、5–8 人 2、9–12 人 3（平台裁定，原版比例未确认）。
 * - 结束：每人当一次判官后结束（平台裁定），累计最高分获胜。
 */
import type { GameEffect } from '@ldj/shared';

export type EchoJudgePhase =
  | 'judge_setup' // 判官出题 + 身份分配
  | 'answering' // 玩家依次回答
  | 'judgment' // 判官指认
  | 'game_over';

export type EchoJudgeRole = 'human' | 'impostor';

export interface EchoJudgeConfig {
  rulesetId?: 'echo_judge_v1';
  /** 每人回答时长（秒），默认 30 */
  answerSeconds?: number;
  /** 判官指认时长（秒），默认 30 */
  judgmentSeconds?: number;
  /** 判官抓错扣分，默认 -1（平台裁定） */
  judgeWrongPenalty?: number;
}

export interface ResolvedEchoJudgeConfig {
  rulesetId?: 'echo_judge_v1';
  answerSeconds: number;
  judgmentSeconds: number;
  judgeWrongPenalty: number;
}

export interface EchoJudgeState {
  schemaVersion: 1;
  phase: EchoJudgePhase;
  players: string[];
  config: ResolvedEchoJudgeConfig;
  /** 判官轮换：当前第几轮（1 起） */
  round: number;
  /** 当前判官 */
  judgeId: string;
  /** 本轮题目（判官出题） */
  question: string;
  /** 本轮身份：玩家 → 人类/伪人（判官不知伪人是谁） */
  roles: Record<string, EchoJudgeRole>;
  /** 伪人触发词（仅伪人本人可见） */
  triggerWords: Record<string, string>;
  /** 回答顺序（从判官下一位起）与已提交回答 */
  answerOrder: string[];
  answers: Record<string, string>;
  /** 判官指认的伪人 */
  accusation: string | null;
  /** 判官抓对 */
  caughtImpostor: boolean | null;
  /** 累计分数 */
  scores: Record<string, number>;
  winners: string[];
}

export type EchoJudgeAction =
  | { type: 'begin' }
  | { type: 'start_round'; playerId: string; question: string }
  | { type: 'submit_answer'; playerId: string; text: string }
  | { type: 'accuse'; playerId: string; targetPlayerId: string }
  | { type: 'resolve_round'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type EchoJudgeEvent =
  | { type: 'round_started'; round: number; judgeId: string }
  | { type: 'roles_assigned' }
  | { type: 'answer_submitted'; playerId: string }
  | { type: 'judgment_started' }
  | { type: 'accused'; playerId: string; caughtImpostor: boolean }
  | { type: 'round_resolved'; scores: Record<string, number> }
  | { type: 'game_finished'; winners: string[] };

export type EchoJudgeReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: EchoJudgeState; events: EchoJudgeEvent[]; effects: GameEffect[] };

export interface EchoJudgeReveal {
  round: number;
  judgeId: string;
  question: string;
  roles: Record<string, EchoJudgeRole>;
  triggerWords: Record<string, string>;
  answers: Record<string, string>;
  accusation: string | null;
  caughtImpostor: boolean | null;
  scores: Record<string, number>;
}

export interface EchoJudgePublicView {
  gameId: 'echo-judge';
  rulesetId: 'echo_judge_v1';
  schemaVersion: 1;
  phase: EchoJudgePhase;
  players: string[];
  round: number;
  judgeId: string;
  question: string;
  /** 回答是否已全部提交 */
  allAnswered: boolean;
  /** 已提交回答的玩家数 */
  answeredCount: number;
  /** 判官指认结果（judgment 后） */
  caughtImpostor: boolean | null;
  scores: Record<string, number>;
  winners: string[];
  reveal: EchoJudgeReveal | null;
}

export interface EchoJudgePlayerView extends EchoJudgePublicView {
  me: {
    playerId: string;
    isJudge: boolean;
    /** 我的身份（判官视角为 null——判官不知伪人是谁） */
    role: EchoJudgeRole | null;
    /** 我的触发词（仅伪人可见） */
    triggerWord: string | null;
    /** 轮到我回答 */
    myTurn: boolean;
  } | null;
}

export interface EchoJudgeResult {
  winners: string[];
}
