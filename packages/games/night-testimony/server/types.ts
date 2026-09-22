import type { GameEffect } from '@ldj/shared';
import type { QuestionCard } from './questionDeck.ts';

export const CRIMES = [
  'arson',
  'theft',
  'forgery',
  'smuggling',
  'fraud',
  'kidnap',
  'littering',
  'public_urination',
  'noise_nuisance',
  'graffiti',
  'dine_and_dash',
  'line_cutting',
  'scalping',
  'public_smoking',
  'hacker',
  'wifi_leeching',
  'scalp_bot',
  'spoilers',
  'water_army',
  'office_theft',
  'pickpocket',
  'bike_theft',
  'counterfeiter',
  'blackmail',
  'prison_break',
  'poisoning',
  'grave_robbery',
  'transnational_crime',
  'money_laundering',
  'museum_heist',
  'arms_trafficking',
  'espionage',
  'poaching',
  'pyramid_scheme',
  'sea_pirate',
  'impersonation',
] as const;
export type CrimeId = (typeof CRIMES)[number];

export type NightTestimonyPhase = 'question' | 'deduction' | 'vote' | 'game_over';

export interface QuestionRecord {
  questionIndex: number;
  questionerId: string;
  cardId: string;
  question: string;
  answers: Record<string, 'yes' | 'no'>;
}

export interface NightTestimonyConfig {
  rulesetId?: 'night_testimony_v1';
  /** 每名玩家最多回答「是」的次数（达到即停止提问），默认 3 */
  maxYesPerPlayer?: number;
  /** 全局最多提问问题数（达到即停止提问），默认 5 */
  questionLimit?: number;
  /** 提问阶段超时秒数（出题者未选卡/有人未作答时自动推进），默认 90 */
  questionSeconds?: number;
  /** 投票阶段超时秒数（到点按现有票结算），默认 90 */
  voteSeconds?: number;
}

export interface ResolvedNightTestimonyConfig {
  rulesetId?: 'night_testimony_v1';
  maxYesPerPlayer: number;
  questionLimit: number;
  questionSeconds: number;
  voteSeconds: number;
}

export interface NightTestimonyState {
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  config: ResolvedNightTestimonyConfig;
  /** 狱警是谁（只有狱警本人在视图中能确认） */
  wardenId: string;
  /** 囚犯各自分配的互异罪行（狱警没有罪行） */
  crimes: Record<string, CrimeId>;
  /** 额外随机混入的一张干扰罪行卡（终局公开） */
  extraCrime: CrimeId | null;
  /** 顺时针提问轮次索引 */
  questionerIndex: number;
  currentQuestionerId: string;
  /** 系统为当前出题者派发的 3 张候选卡 */
  pendingCardChoices: QuestionCard[] | null;
  /** 已使用过的问题卡 ID 列表 */
  usedCardIds: string[];
  /** 当前正在全员回答的问题 */
  currentQuestion: {
    questionIndex: number;
    questionerId: string;
    cardId: string;
    text: string;
  } | null;
  /** 当前题目下各玩家已提交的 answers */
  currentQuestionAnswers: Record<string, 'yes' | 'no'>;
  /** 历史已完成的全员问答记录 */
  history: QuestionRecord[];
  /** 每名玩家累计回答「是」的次数 */
  playerYesCounts: Record<string, number>;
  /** 主动自告/自曝身份的玩家（真实罪行或狱警） */
  revealedIdentities: Record<string, CrimeId | 'warden'>;
  /** 投票结果：玩家 -> 投票目标 */
  votes: Record<string, string>;
  /** 投票票出的嫌疑人（得票最多者） */
  accusedId: string | null;
  /** 票出的是否是狱警 */
  wardenRevealed: boolean | null;
  /** 狱警猜罪是否进行中 */
  guessingInProgress: boolean;
  /** 狱警提交的猜罪结果 */
  wardenGuesses: Record<string, CrimeId> | null;
  /** 狱警是否全部猜对 */
  crimesAllGuessed: boolean | null;
  /** 胜者列表 */
  winners: string[];
  /**
   * 当前阶段的截止时刻（与 schedule_timer 的 deadlineAt 同值）。
   * 客户端据此渲染倒计时进度环；无计时阶段（选卡、终局）为 null。
   */
  deadlineAt: number | null;
}

export type NightTestimonyAction =
  | { type: 'begin' }
  | { type: 'pick_question_card'; playerId: string; cardId: string }
  | { type: 'answer_question'; playerId: string; answer: 'yes' | 'no' }
  | { type: 'self_expose'; playerId: string }
  | { type: 'cast_vote'; playerId: string; targetPlayerId: string }
  | { type: 'submit_guesses'; playerId: string; guesses: Record<string, CrimeId> }
  | { type: 'player_forfeited'; playerIds: string[] }
  | { type: 'question_timeout' }
  | { type: 'vote_timeout' };

export type NightTestimonyEvent =
  | { type: 'round_started' }
  | { type: 'question_card_offered'; questionerId: string; cards: QuestionCard[] }
  | { type: 'question_asked'; questionIndex: number; questionerId: string; cardId: string; text: string }
  | { type: 'question_answered'; questionIndex: number; playerId: string; answer: 'yes' | 'no' }
  | { type: 'question_completed'; questionIndex: number; answers: Record<string, 'yes' | 'no'> }
  | { type: 'identity_exposed'; playerId: string; identity: CrimeId | 'warden' }
  | { type: 'vote_started' }
  | { type: 'vote_cast'; playerId: string; targetPlayerId: string }
  | { type: 'vote_resolved'; accusedId: string; isWarden: boolean }
  | { type: 'guessing_started'; availableCrimes: CrimeId[] }
  | { type: 'guesses_resolved'; allCorrect: boolean }
  | { type: 'game_finished'; winners: string[] };

export type NightTestimonyReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: NightTestimonyState; events: NightTestimonyEvent[]; effects: GameEffect[] };

export interface NightTestimonyReveal {
  wardenId: string;
  crimes: Record<string, CrimeId>;
  history: QuestionRecord[];
  extraCrime: CrimeId | null;
  accusedId: string | null;
  wardenRevealed: boolean;
  wardenGuesses: Record<string, CrimeId> | null;
  crimesAllGuessed: boolean;
}

export interface QuestionCardView {
  id: string;
  text: string;
  category: 'motive' | 'method' | 'time' | 'scene' | 'property' | 'personnel';
  categoryLabel: string;
}

export interface NightTestimonyPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_v1';
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  currentQuestionerId: string;
  questionIndex: number;
  questionLimit: number;
  maxYesPerPlayer: number;
  history: QuestionRecord[];
  playerYesCounts: Record<string, number>;
  currentQuestion: {
    questionIndex: number;
    questionerId: string;
    cardId: string;
    text: string;
    answers: Record<string, 'yes' | 'no'>;
  } | null;
  revealedIdentities: Record<string, CrimeId | 'warden'>;
  extraCrime: CrimeId | null;
  /** 终局猜罪可选的罪行集合（bot 决策与客户端展示用；非猜罪阶段为 null） */
  availableGuessCrimes: CrimeId[] | null;
  votedPlayerIds: string[];
  accusedId: string | null;
  wardenRevealed: boolean | null;
  guessingInProgress: boolean;
  winners: string[];
  /** 当前阶段截止时刻；无计时阶段为 null */
  deadlineAt: number | null;
  reveal: NightTestimonyReveal | null;
}

export interface NightTestimonyPlayerView extends NightTestimonyPublicView {
  me: {
    playerId: string;
    isWarden: boolean;
    crime: CrimeId | null;
    myYesCount: number;
    hasAnsweredCurrent: boolean;
    hasVoted: boolean;
    pendingCardChoices: QuestionCardView[] | null;
  } | null;
}

export interface NightTestimonyResult {
  winners: string[];
}
