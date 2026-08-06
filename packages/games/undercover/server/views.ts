/**
 * 谁是卧底：三类视角构造（SPEC §6.9）。
 * 白名单式重建：从内部状态挑选可见字段，绝不序列化后"删字段"。
 * 任意玩家视角不得包含其他存活玩家的角色或词语（§6.10 不变量）。
 */
import { z } from 'zod';
import { canObserve, canObserveAll, type ObservationContext } from '@ldj/shared';
import {
  undercoverPhaseSchema,
  undercoverRoleSchema,
  type UndercoverPhase,
  type UndercoverRole,
  type UndercoverState,
  type VoteSummary,
} from './state.ts';

export interface PublicPlayerInfo {
  playerId: string;
  seat: number;
  alive: boolean;
  exitReason: 'voted_out' | 'disconnect_timeout' | null;
  /** 仅已公开淘汰者或游戏结束后可见 */
  revealedRole: UndercoverRole | null;
}

export interface UndercoverPublicView {
  phase: UndercoverPhase;
  round: number;
  players: PublicPlayerInfo[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  deadlineAt: number | null;
  /** 投票进度只公开数量，不公开谁投了谁（§6.5） */
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  confirmedPlayerIds: string[];
  lastVoteSummary: VoteSummary | null;
  winner: UndercoverRole | null;
  aborted: boolean;
  /** 游戏结束后全部公开（§6.1/§6.9） */
  reveal: {
    civilianWord: string;
    undercoverWord: string;
    roles: Record<string, UndercoverRole>;
  } | null;
}

export interface UndercoverPlayerView extends UndercoverPublicView {
  me: {
    playerId: string;
    /** 自己的词语；观战者与非本局成员为 null */
    word: string | null;
    /** 存活期间 UI 不直接显示阵营（§6.3）；淘汰后或游戏结束可见 */
    role: UndercoverRole | null;
    alive: boolean;
    confirmed: boolean;
    hasVoted: boolean;
    myVote: string | null;
  } | null;
}

export type UndercoverSpectatorView = UndercoverPublicView;

const playerIdSchema = z.string().min(1).max(64);
const publicPlayerInfoSchema = z.object({
  playerId: playerIdSchema,
  seat: z.number().int().nonnegative(),
  alive: z.boolean(),
  exitReason: z.enum(['voted_out', 'disconnect_timeout']).nullable(),
  revealedRole: undercoverRoleSchema.nullable(),
}).strict();
const voteSummaryViewSchema = z.object({
  round: z.number().int().positive(),
  kind: z.enum(['normal', 'runoff']),
  outcome: z.enum(['eliminated', 'tie', 'no_votes', 'runoff_tie']),
  eliminatedPlayerId: playerIdSchema.nullable(),
  eliminatedRole: undercoverRoleSchema.nullable(),
  tally: z.record(playerIdSchema, z.number().int().positive()),
}).strict();
const revealSchema = z.object({
  civilianWord: z.string().min(1),
  undercoverWord: z.string().min(1),
  roles: z.record(playerIdSchema, undercoverRoleSchema),
}).strict();
export const undercoverPublicViewSchema = z.object({
  phase: undercoverPhaseSchema,
  round: z.number().int().nonnegative(),
  players: z.array(publicPlayerInfoSchema),
  speakingOrder: z.array(playerIdSchema),
  currentSpeakerId: playerIdSchema.nullable(),
  deadlineAt: z.number().int().nullable(),
  votesSubmitted: z.number().int().nonnegative(),
  votesExpected: z.number().int().nonnegative(),
  runoffCandidates: z.array(playerIdSchema),
  confirmedPlayerIds: z.array(playerIdSchema),
  lastVoteSummary: voteSummaryViewSchema.nullable(),
  winner: undercoverRoleSchema.nullable(),
  aborted: z.boolean(),
  reveal: revealSchema.nullable(),
}).strict();
const selfViewSchema = z.object({
  playerId: playerIdSchema,
  word: z.string().min(1).nullable(),
  role: undercoverRoleSchema.nullable(),
  alive: z.boolean(),
  confirmed: z.boolean(),
  hasVoted: z.boolean(),
  myVote: playerIdSchema.nullable(),
}).strict();
export const undercoverPlayerViewSchema = undercoverPublicViewSchema.extend({
  me: selfViewSchema.nullable(),
}).strict();
export const undercoverSpectatorViewSchema = undercoverPublicViewSchema;

function isGameOver(state: UndercoverState): boolean {
  return state.phase === 'game_over';
}

function currentSpeakerId(state: UndercoverState): string | null {
  if (state.phase !== 'speaking') return null;
  return state.speakingOrder[state.currentSpeakerIndex] ?? null;
}

function inVotingPhase(state: UndercoverState): boolean {
  return state.phase === 'voting' || state.phase === 'runoff_voting';
}

function observationContext(
  role: ObservationContext['role'],
  revealed: boolean,
  playerId?: string,
): ObservationContext {
  return playerId === undefined ? { role, revealed } : { role, playerId, revealed };
}

function buildPublicViewFor(
  state: UndercoverState,
  recipient: ObservationContext,
): UndercoverPublicView {
  const over = isGameOver(state);
  const aliveIds = Object.entries(state.players)
    .filter(([, p]) => p.alive)
    .map(([id]) => id);

  const players: PublicPlayerInfo[] = Object.entries(state.players)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([playerId, p]) => ({
      playerId,
      seat: p.seat,
      alive: p.alive,
      exitReason: p.exitReason ?? null,
      revealedRole: canObserve(
        'after_reveal',
        { ...recipient, revealed: !p.alive || over },
        playerId,
      ) ? p.role : null,
    }));

  return {
    phase: state.phase,
    round: state.round,
    players,
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: currentSpeakerId(state),
    deadlineAt: state.deadlineAt,
    votesSubmitted: inVotingPhase(state) ? Object.keys(state.votes).length : 0,
    votesExpected: inVotingPhase(state) ? aliveIds.length : 0,
    runoffCandidates: [...state.runoffCandidates],
    confirmedPlayerIds: [...state.confirmedPlayerIds],
    lastVoteSummary: state.lastVoteSummary ? { ...state.lastVoteSummary, tally: { ...state.lastVoteSummary.tally } } : null,
    winner: state.winner,
    aborted: state.aborted,
    reveal: canObserve('after_reveal', { ...recipient, revealed: over })
      ? {
          civilianWord: state.civilianWord,
          undercoverWord: state.undercoverWord,
          roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])),
        }
      : null,
  };
}

export function buildPublicView(state: UndercoverState): UndercoverPublicView {
  return buildPublicViewFor(
    state,
    observationContext('spectator', isGameOver(state)),
  );
}

export function buildPlayerView(state: UndercoverState, playerId: string): UndercoverPlayerView {
  const recipient = observationContext('participant', isGameOver(state), playerId);
  const base = buildPublicViewFor(state, recipient);
  const entry = state.players[playerId];
  if (!entry || !canObserve('owner_only', recipient, playerId)) return { ...base, me: null };

  const over = isGameOver(state);
  const myWord = entry.role === 'undercover' ? state.undercoverWord : state.civilianWord;
  return {
    ...base,
    me: {
      playerId,
      word: myWord,
      role: canObserveAll(
        ['owner_only', 'after_reveal'],
        { ...recipient, revealed: !entry.alive || over },
        playerId,
      ) ? entry.role : null,
      alive: entry.alive,
      confirmed: state.confirmedPlayerIds.includes(playerId),
      hasVoted: playerId in state.votes,
      myVote: state.votes[playerId] ?? null,
    },
  };
}

export function buildSpectatorView(state: UndercoverState): UndercoverSpectatorView {
  return buildPublicViewFor(
    state,
    observationContext('spectator', isGameOver(state)),
  );
}
