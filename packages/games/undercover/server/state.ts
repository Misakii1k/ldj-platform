/**
 * 谁是卧底：状态、配置与动作定义（SPEC §6.2 状态机 + §6.1 可配置项）。
 * 状态对象整体持久化为对局快照；返回的新状态必须通过 undercoverStateSchema 校验。
 */
import { z } from 'zod';

export const UNDERCOVER_STATE_SCHEMA_VERSION = 1;

// —— 配置（§6.1：发言 30/60/90 秒，投票 30/45/60 秒） ——

export const undercoverConfigSchema = z
  .object({
    speechSeconds: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(60),
    voteSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(45),
  })
  .strict();
export type UndercoverConfig = z.infer<typeof undercoverConfigSchema>;

// —— 动作（玩家动作 + 系统/计时动作） ——

const playerIdSchema = z.string().min(1).max(64);

export const undercoverActionSchema = z.discriminatedUnion('type', [
  // 玩家动作
  z.object({ type: z.literal('confirm_word') }).strict(),
  z.object({ type: z.literal('finish_speech') }).strict(),
  z.object({ type: z.literal('cast_vote'), targetPlayerId: playerIdSchema }).strict(),
  // 系统动作（actor.kind === 'system'）
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('reveal_timeout') }).strict(),
  z
    .object({
      type: z.literal('speech_timeout'),
      round: z.number().int().positive(),
      speakerIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('vote_timeout'),
      round: z.number().int().positive(),
      kind: z.enum(['normal', 'runoff']),
    })
    .strict(),
  z.object({ type: z.literal('vote_result_elapsed'), round: z.number().int().positive() }).strict(),
  // 平台在席位保留期结束的安全点排队（§6.7）；批量标记后统一判胜负
  z
    .object({ type: z.literal('player_forfeited'), playerIds: z.array(playerIdSchema).min(1).max(12) })
    .strict(),
  // 已无任何在线玩家等平台可见的终止条件（§6.7 ABORTED）
  z.object({ type: z.literal('abort_game') }).strict(),
]);
export type UndercoverAction = z.infer<typeof undercoverActionSchema>;

// —— 状态 ——

export const undercoverRoleSchema = z.enum(['civilian', 'undercover']);
export type UndercoverRole = z.infer<typeof undercoverRoleSchema>;

export const undercoverPhaseSchema = z.enum([
  'word_reveal',
  'speaking',
  'voting',
  'runoff_voting',
  'vote_result',
  'game_over',
]);
export type UndercoverPhase = z.infer<typeof undercoverPhaseSchema>;

const playerEntrySchema = z
  .object({
    seat: z.number().int().nonnegative(),
    role: undercoverRoleSchema,
    alive: z.boolean(),
    exitReason: z.enum(['voted_out', 'disconnect_timeout']).optional(),
  })
  .strict();

/** VOTE_RESULT 展示与后续走向（§6.5/§6.6 结算结论） */
const voteSummarySchema = z
  .object({
    round: z.number().int().positive(),
    kind: z.enum(['normal', 'runoff']),
    outcome: z.enum(['eliminated', 'tie', 'no_votes', 'runoff_tie']),
    eliminatedPlayerId: playerIdSchema.nullable(),
    eliminatedRole: undercoverRoleSchema.nullable(),
    /** 公开票数汇总（目标 → 票数）；不公开逐票去向 */
    tally: z.record(playerIdSchema, z.number().int().positive()),
  })
  .strict();
export type VoteSummary = z.infer<typeof voteSummarySchema>;

const pendingOutcomeSchema = z
  .object({
    next: z.enum(['runoff', 'next_round', 'game_over']),
    candidates: z.array(playerIdSchema),
    winner: z.union([z.enum(['civilian', 'undercover']), z.null()]),
  })
  .strict();
export type PendingOutcome = z.infer<typeof pendingOutcomeSchema>;

export const undercoverStateSchema = z
  .object({
    schemaVersion: z.literal(UNDERCOVER_STATE_SCHEMA_VERSION),
    phase: undercoverPhaseSchema,
    round: z.number().int().nonnegative(),
    players: z.record(playerIdSchema, playerEntrySchema),
    speakingOrder: z.array(playerIdSchema),
    currentSpeakerIndex: z.number().int().nonnegative(),
    votes: z.record(playerIdSchema, playerIdSchema),
    runoffCandidates: z.array(playerIdSchema),
    civilianWord: z.string().min(1),
    undercoverWord: z.string().min(1),
    deadlineAt: z.number().int().nullable(),
    winner: z.union([z.enum(['civilian', 'undercover']), z.null()]),
    // —— 以下为 MVP 补充字段（SPEC §6.2 “状态至少包含”） ——
    config: undercoverConfigSchema,
    wordBankVersion: z.number().int().positive(),
    /** WORD_REVEAL 已确认看词的玩家 */
    confirmedPlayerIds: z.array(playerIdSchema),
    /** 本轮首位发言者（下一轮从其后第一名存活玩家开始，§6.1） */
    roundFirstSpeaker: playerIdSchema.nullable(),
    /** VOTE_RESULT 展示信息；进入下一阶段后保留供 UI 回看 */
    lastVoteSummary: voteSummarySchema.nullable(),
    /** VOTE_RESULT 到期后的走向 */
    pendingOutcome: pendingOutcomeSchema.nullable(),
    /** 全员掉线等原因终止（平台 status=ABORTED 的模块侧标记） */
    aborted: z.boolean(),
  })
  .strict();
export type UndercoverState = z.infer<typeof undercoverStateSchema>;

// —— 事件与结果 ——

export type UndercoverEvent =
  | { type: 'phase_changed'; phase: UndercoverPhase; round: number }
  | {
      type: 'player_eliminated';
      playerId: string;
      role: UndercoverRole;
      reason: 'voted_out' | 'disconnect_timeout';
    }
  | { type: 'game_over'; winner: UndercoverRole | null };

export interface UndercoverResult {
  winner: UndercoverRole | null;
  aborted: boolean;
  rounds: number;
  roles: Record<string, UndercoverRole>;
  civilianWord: string;
  undercoverWord: string;
}
