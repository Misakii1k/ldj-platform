/**
 * 伪人测试（判官模式）echo_judge_v1 —— 原版规则与自由选阵营/多选指认升级类型。
 *
 * 核心机制：
 * - 选定判官抽 3 选 1 题目出题；
 * - 非判官玩家可自由选择当【正常人类】或【异常伪人】；选择伪人者获得秘密触发词；
 * - 非判官玩家依次口头发言：人类可说谎，伪人必须自然地把触发词藏进话里；
 * - 全部答完 → 判官多选指认嫌疑人；
 * - 复合计分：
 *   - 抓对伪人：每抓对 1 名伪人，判官 +1、被抓伪人 -1；
 *   - 误抓人类：每误抓 1 名人类，判官扣分（默认 -1）；
 *   - 潜伏成功：场上未被抓出的伪人，每人 +2；
 *   - 全场无伪人且空指认：判官 +1；
 * - 结束：所有玩家轮流担任过判官后结束，累计最高分获胜。
 */
import type { GameEffect } from '@ldj/shared';
import type { TopicCard } from './questionDeck.ts';

export type EchoJudgePhase =
  | 'judge_setup' // 判官出题 + 玩家自由选择身份
  | 'answering' // 玩家依次口头作答
  | 'judgment' // 判官多选指认
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
  /** 当前题目卡 ID（若通过抽卡出题） */
  topicCardId: string | null;
  /** 判官出题阶段待挑选的 3 张题目卡 */
  pendingTopicChoices: TopicCard[] | null;
  /** 已使用的题目卡 ID */
  usedTopicCardIds: string[];
  /** 本轮身份：玩家 → 人类/伪人（判官不知伪人是谁） */
  roles: Record<string, EchoJudgeRole>;
  /** 伪人触发词（仅伪人本人可见） */
  triggerWords: Record<string, string>;
  /** 回答顺序（从判官下一位起）与已提交回答 */
  answerOrder: string[];
  answers: Record<string, string>;
  /** 当前正在口头发言的玩家 ID */
  currentSpeakerId: string | null;
  /** 判官指认的嫌疑人列表 */
  accusations: string[];
  /** 判官抓对的伪人列表 */
  caughtImpostors: string[];
  /** 判官误抓的人类列表 */
  wrongAccusations: string[];
  /** 潜伏成功逃脱的伪人列表 */
  escapedImpostors: string[];
  /** 累计分数 */
  scores: Record<string, number>;
  winners: string[];
  /**
   * 当前阶段的截止时刻（与 schedule_timer 的 deadlineAt 同值）。
   * 客户端据此渲染倒计时进度环；出题阶段与终局为 null。
   */
  deadlineAt: number | null;
  /** 上轮判决快照（T0）；开局前与老存档为 null */
  lastVerdict: EchoJudgeLastVerdict | null;
}

export type EchoJudgeAction =
  | { type: 'begin' }
  | { type: 'choose_role'; playerId: string; role: EchoJudgeRole }
  | { type: 'pick_topic_card'; playerId: string; cardId: string }
  | { type: 'start_round'; playerId: string; question: string }
  | { type: 'finish_speaking'; playerId: string }
  | { type: 'submit_answer'; playerId: string; text: string }
  | { type: 'accuse'; playerId: string; targetPlayerIds: string[] }
  | { type: 'resolve_round'; playerId: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export type EchoJudgeEvent =
  | { type: 'round_started'; round: number; judgeId: string }
  | { type: 'topic_cards_offered'; judgeId: string; cards: TopicCard[] }
  | { type: 'topic_card_picked'; judgeId: string; cardId: string; text: string }
  | { type: 'role_chosen'; playerId: string; role: EchoJudgeRole }
  | { type: 'speaker_advanced'; speakerId: string }
  | { type: 'answer_submitted'; playerId: string }
  | { type: 'judgment_started' }
  | { type: 'accused'; playerId: string; targetPlayerIds: string[]; caughtCount: number; wrongCount: number }
  | { type: 'round_resolved'; scores: Record<string, number> }
  | { type: 'game_finished'; winners: string[] };

export type EchoJudgeReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: EchoJudgeState; events: EchoJudgeEvent[]; effects: GameEffect[] };

/**
 * 一轮宣判的结果快照（T0 新增）。
 * 宣判后一直保留到下一次 settleRound 覆盖——中途轮次 accuse 后阶段立刻进入
 * 下一轮 judge_setup，accusations/caught/escaped 在公开视图里被隐藏，
 * 客户端的中途宣判演出只能从这里取数据。
 * 只含「谁被指认/谁被抓/谁被冤枉/谁逃脱/分差」，不含身份与触发词。
 */
export interface EchoJudgeLastVerdict {
  round: number;
  judgeId: string;
  accusations: string[];
  caught: string[];
  wrong: string[];
  escaped: string[];
  scoreDelta: Record<string, number>;
}

export interface EchoJudgeReveal {
  round: number;
  judgeId: string;
  question: string;
  roles: Record<string, EchoJudgeRole>;
  triggerWords: Record<string, string>;
  answers: Record<string, string>;
  accusations: string[];
  caughtImpostors: string[];
  wrongAccusations: string[];
  escapedImpostors: string[];
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
  topicCardId: string | null;
  currentSpeakerId: string | null;
  /** 回答是否已全部提交/发言完毕 */
  allAnswered: boolean;
  /** 已完成发言/提交回答的玩家数 */
  answeredCount: number;
  /** 判官指认结果（judgment / game_over 时展示） */
  accusations: string[] | null;
  caughtImpostors: string[] | null;
  escapedImpostors: string[] | null;
  scores: Record<string, number>;
  winners: string[];
  /** 当前阶段截止时刻；出题阶段与终局为 null */
  deadlineAt: number | null;
  reveal: EchoJudgeReveal | null;
  /** 上轮判决快照（中途宣判的唯一数据源；不含身份与触发词） */
  lastVerdict: EchoJudgeLastVerdict | null;
}

export interface EchoJudgePlayerView extends EchoJudgePublicView {
  me: {
    playerId: string;
    isJudge: boolean;
    /** 我的身份（判官视角为 null——判官不知伪人是谁） */
    role: EchoJudgeRole | null;
    /** 我的触发词（仅伪人可见） */
    triggerWord: string | null;
    /** 判官出题阶段待挑选的 3 张卡牌（非判官为 null） */
    pendingTopicChoices: TopicCard[] | null;
    /** 轮到我发言/回答 */
    myTurn: boolean;
    /** 我当前是否正在发言 */
    isCurrentSpeaker: boolean;
  } | null;
}

export interface EchoJudgeResult {
  winners: string[];
}
