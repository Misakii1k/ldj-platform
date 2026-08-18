/**
 * undercover_blank_v1 — 白板规则集类型基础（纯类型 + 计时器 id 纯函数）。
 *
 * 与 classic（server/module.ts）完全隔离：本文件只声明类型与极小的纯字符串
 * 辅助函数，不包含任何规则逻辑。rulesetId 由平台层注入，不在 config 中声明。
 * 类型字段为可写（reducer 在 structuredClone 草稿上原地变更，与 classic 一致）。
 */

export type BlankRole = 'blank' | 'civilian';
export type BlankWinner = 'blank' | 'civilian';
export type BlankRevealMode = 'immediate' | 'delayed';
export type BlankExitReason = 'voted_out' | 'disconnect_timeout' | 'guess_wrong';

export type BlankPhase =
  | 'word_reveal'
  | 'speaking'
  | 'voting'
  | 'runoff_voting'
  | 'vote_result'
  | 'final_guess'
  | 'game_over';

export interface BlankConfig {
  rulesetId?: 'undercover_blank_v1';
  speechSeconds: 30 | 45 | 60 | 90;
  voteSeconds: 30 | 45 | 60;
  /** GOV-002：身份公开时机，开局写入快照整局锁定。 */
  revealMode: BlankRevealMode;
}

export interface BlankPlayerEntry {
  seat: number;
  /** 恰好一名 blank（卧底方，无词）；其余全部 civilian 共享同词。 */
  role: BlankRole;
  alive: boolean;
  exitReason: BlankExitReason | null;
}

export interface BlankVoteSummary {
  round: number;
  kind: 'normal' | 'runoff';
  outcome: 'eliminated' | 'tie' | 'no_votes' | 'runoff_tie';
  eliminatedPlayerId: string | null;
  eliminatedRole: BlankRole | null;
  /** 公开票数汇总（目标 → 票数）；不公开逐票去向。 */
  tally: Record<string, number>;
}

export interface BlankPendingOutcome {
  next: 'runoff' | 'next_round' | 'game_over';
  candidates: string[];
  winner: BlankWinner | null;
}

export interface BlankDeferredOutcome {
  /** 普通流程在待定猜词期间产生的暂存胜负。 */
  winner: BlankWinner;
  /** 关联的猜词 taskId（结果到达时据此撤销/确认暂存）。 */
  taskId: string;
}

export interface BlankGuessRecord {
  taskId: string;
  playerId: string;
  /** 模块内部单调提交序号（平台经 submittedAtSeq/expectedSequence 回灌）。 */
  submittedAtSeq: number;
  /** active = 主动猜词；final = 终局猜词。 */
  phase: 'active' | 'final';
  status: 'pending' | 'resolved_equivalent' | 'resolved_not_equivalent';
  /** 归一化后的猜词明文（仅 pending 需要；结果应用后擦除）。 */
  normalizedGuess: string | null;
  /** 提交时的归一化标准词（仅 pending 需要；结果应用后擦除）。 */
  normalizedStandardAnswer: string | null;
  /** 结果应用后的受限审计元数据。 */
  resolvedClassification: string | null;
  resolvedSource: string | null;
}

export interface BlankState {
  schemaVersion: 1;
  phase: BlankPhase;
  round: number;
  players: Record<string, BlankPlayerEntry>;
  speakingOrder: string[];
  currentSpeakerIndex: number;
  votes: Record<string, string>;
  runoffCandidates: string[];
  /** 全体平民共享的同一平民词；blank 无词（显式 no-word 变体）。 */
  civilianWord: string;
  deadlineAt: number | null;
  winner: BlankWinner | null;
  /** GOV-002：身份公开时机，快照锁定，运行中不可改。 */
  config: BlankConfig;
  confirmedPlayerIds: string[];
  roundFirstSpeaker: string | null;
  lastVoteSummary: BlankVoteSummary | null;
  pendingOutcome: BlankPendingOutcome | null;
  /** 待定猜词期间普通流程产生的暂存胜负。 */
  deferredOutcome: BlankDeferredOutcome | null;
  /** 全部玩家中唯一的 blank 玩家 id。 */
  blankPlayerId: string | null;
  /** 猜词提交记录（至多一条；主动提交后机会永久消耗）。 */
  guess: BlankGuessRecord | null;
  /** 外部裁判任务提交序号计数器（模块内部单调，≥1）。 */
  taskSeq: number;
  /** 会话身份传输字段（平台侧校验 effect.sessionId 归属）。 */
  sessionId: string;
  aborted: boolean;
}

export type BlankAction =
  // 玩家动作
  | { type: 'confirm_word' }
  | { type: 'finish_speech' }
  | { type: 'cast_vote'; targetPlayerId: string }
  | { type: 'submit_guess'; guess: string; sessionId?: string }
  | { type: 'submit_final_guess'; guess: string; sessionId?: string }
  | { type: 'skip_final_guess' }
  // 系统动作
  | { type: 'begin' }
  | { type: 'reveal_timeout' }
  | { type: 'speech_timeout'; round: number; speakerIndex: number }
  | { type: 'vote_timeout'; round: number; kind: 'normal' | 'runoff' }
  | { type: 'vote_result_elapsed'; round: number }
  | { type: 'final_guess_timeout'; round: number }
  | { type: 'player_forfeited'; playerIds: string[] }
  | { type: 'abort_game' }
  | { type: 'external_task_result'; taskId: string; expectedSequence: number; result: unknown };

export interface BlankPublicPlayerInfo {
  playerId: string;
  seat: number;
  alive: boolean;
  exitReason: BlankExitReason | null;
  /** 仅在公开时机可见（见 rules.ts buildBlankPublicView）。 */
  revealedRole: BlankRole | null;
}

export interface BlankPublicView {
  gameId: 'undercover';
  rulesetId: 'undercover_blank_v1';
  phase: BlankPhase;
  round: number;
  players: BlankPublicPlayerInfo[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  deadlineAt: number | null;
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  confirmedPlayerIds: string[];
  lastVoteSummary: BlankVoteSummary | null;
  winner: BlankWinner | null;
  aborted: boolean;
  /** 是否有外部裁判在途（UI「等待裁判层」）；猜词明文永不进入任何视角。 */
  guessPending: boolean;
  revealMode: BlankRevealMode;
  reveal: {
    civilianWord: string;
    roles: Record<string, BlankRole>;
  } | null;
}

export interface BlankPlayerMeView {
  playerId: string;
  /** 平民见共享词；blank 显式无词（null，不是空字符串）。 */
  word: string | null;
  role: BlankRole | null;
  alive: boolean;
  confirmed: boolean;
  hasVoted: boolean;
  myVote: string | null;
  isBlank: boolean;
  /** 是否可在当前阶段提交主动猜词（blank 存活且机会未用）。 */
  canGuess: boolean;
  /** 是否可提交终局猜词（final_guess 阶段、blank、机会未用）。 */
  canSubmitFinalGuess: boolean;
  /** 猜词机会是否已消耗。 */
  guessUsed: boolean;
  /** 自己的猜词是否在途。 */
  guessPending: boolean;
}

export interface BlankPlayerView extends BlankPublicView {
  me: BlankPlayerMeView | null;
}

export type BlankSpectatorView = BlankPublicView;

export type BlankEvent =
  | { type: 'phase_changed'; phase: BlankPhase; round: number }
  | {
      type: 'player_eliminated';
      playerId: string;
      /** delayed 模式下白板淘汰时不公开身份（null）。 */
      role: BlankRole | null;
      reason: BlankExitReason;
    }
  | { type: 'guess_submitted'; playerId: string; taskId: string }
  | { type: 'guess_skipped'; playerId: string }
  | { type: 'game_over'; winner: BlankWinner | null };

export interface BlankResult {
  winner: BlankWinner | null;
  /** blank 计入卧底方（ROLE-002）：side 为该阵营名。 */
  side: BlankWinner;
  aborted: boolean;
  rounds: number;
  roles: Record<string, BlankRole>;
  civilianWord: string;
  /** blank 显式无词（null，不是空字符串）。 */
  blankWord: null;
}

/** 计时器 id：以 blank. 前缀作用域化，保证与 classic/其他模块不冲突。 */
export function blankRevealTimerId(): string {
  return 'blank.reveal';
}

export function blankSpeechTimerId(round: number, index: number): string {
  return `blank.speech:${round}:${index}`;
}

export function blankVoteTimerId(round: number, kind: 'normal' | 'runoff'): string {
  return `blank.vote:${round}:${kind}`;
}

export function blankResultTimerId(round: number, kind: 'normal' | 'runoff'): string {
  return `blank.result:${round}:${kind}`;
}

export function blankFinalGuessTimerId(round: number): string {
  return `blank.final:${round}`;
}
