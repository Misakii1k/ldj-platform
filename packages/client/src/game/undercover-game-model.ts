import { z } from 'zod';

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

export const browserPlayerIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !forbiddenKeys.has(value), 'player id is not safe');

export const UndercoverPhaseSchema = z.enum([
  'word_reveal',
  'speaking',
  'voting',
  'runoff_voting',
  'vote_result',
  'game_over',
]);

const roleSchema = z.enum(['civilian', 'undercover']);
const publicPlayerSchema = z
  .object({
    seat: z.number().int().min(0).max(11),
    alive: z.boolean(),
    online: z.boolean(),
    exitReason: z.enum(['voted_out', 'disconnect_timeout']).optional(),
    revealedRole: roleSchema.optional(),
  })
  .strict();
const playerIdsSchema = z.array(browserPlayerIdSchema).max(12);
const voteResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('eliminated'),
      eliminatedPlayerId: browserPlayerIdSchema,
      eliminatedRole: roleSchema.optional(),
      runoffCandidates: z.array(browserPlayerIdSchema).max(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal('runoff'),
      runoffCandidates: playerIdsSchema.min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal('no_elimination'),
      runoffCandidates: z.array(browserPlayerIdSchema).max(0),
    })
    .strict(),
]);
const resultSchema = z
  .object({
    outcome: z.enum(['civilian', 'undercover', 'aborted']),
    civilianWord: z.string().min(1).max(64),
    undercoverWord: z.string().min(1).max(64),
    roles: z.record(browserPlayerIdSchema, roleSchema),
  })
  .strict();

const commonView = {
  schemaVersion: z.literal(1),
  phase: UndercoverPhaseSchema,
  round: z.number().int().min(1),
  players: z.record(browserPlayerIdSchema, publicPlayerSchema),
  speakingOrder: playerIdsSchema,
  currentSpeakerId: browserPlayerIdSchema.nullable(),
  runoffCandidates: playerIdsSchema,
  deadlineAt: z.number().int().nonnegative().safe().nullable(),
  voteProgress: z
    .object({ locked: z.number().int().nonnegative(), eligible: z.number().int().nonnegative() })
    .strict(),
  voteResult: voteResultSchema.nullable(),
  result: resultSchema.nullable(),
} as const;

export const UndercoverGameViewSchema = z.discriminatedUnion('viewerKind', [
  z
    .object({
      ...commonView,
      viewerKind: z.literal('player'),
      self: z
        .object({
          playerId: browserPlayerIdSchema,
          word: z.string().min(1).max(64),
          revealedRole: roleSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ ...commonView, viewerKind: z.literal('spectator') }).strict(),
]);

export type UndercoverGameView = z.infer<typeof UndercoverGameViewSchema>;
export type UndercoverPhase = z.infer<typeof UndercoverPhaseSchema>;
export type UndercoverRole = z.infer<typeof roleSchema>;

export type UndercoverConnectionState =
  | 'connected'
  | 'connecting'
  | 'recovering'
  | 'disconnected'
  | 'replaced';

export interface UndercoverInteractionState {
  readonly wordConfirmed?: boolean;
  readonly voteLocked?: boolean;
}

export interface UndercoverActionGate {
  readonly connection: UndercoverConnectionState;
  readonly synchronized: boolean;
  readonly requestPending: boolean;
}

export interface UndercoverActionPermissions {
  readonly confirmWord: boolean;
  readonly finishSpeech: boolean;
  readonly lockVote: boolean;
  readonly selectableTargetIds: readonly string[];
  readonly blockedReason?: string;
}

export function parseUndercoverGameView(input: unknown): UndercoverGameView {
  return UndercoverGameViewSchema.parse(input);
}

export function reduceSecretVisibility(
  visible: boolean,
  event: 'hold_started' | 'hold_ended' | 'environment_changed',
): boolean {
  if (event === 'hold_started') return true;
  return false;
}

export function getUndercoverActionPermissions(
  view: UndercoverGameView,
  gate: UndercoverActionGate,
  interaction: UndercoverInteractionState = {},
): UndercoverActionPermissions {
  if (gate.connection !== 'connected') {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: gate.connection === 'recovering' ? '正在恢复连接，请稍候' : '连接不可用，请稍候',
    };
  }
  if (!gate.synchronized) {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: '正在同步最新对局状态',
    };
  }
  if (gate.requestPending) {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: '动作正在提交',
    };
  }
  if (view.viewerKind === 'spectator') {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: '观战席只查看公开进度',
    };
  }

  const self = view.players[view.self.playerId];
  if (self?.alive !== true) {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: '你已离场，可以继续观战',
    };
  }
  if (!self.online) {
    return {
      confirmWord: false,
      finishSpeech: false,
      lockVote: false,
      selectableTargetIds: [],
      blockedReason: '席位处于离线状态',
    };
  }

  const isVoting = view.phase === 'voting' || view.phase === 'runoff_voting';
  const runoffSet = new Set(view.runoffCandidates);
  const selectableTargetIds = isVoting
    ? Object.entries(view.players)
        .filter(
          ([playerId, player]) =>
            playerId !== view.self.playerId &&
            player.alive &&
            (view.phase !== 'runoff_voting' || runoffSet.has(playerId)),
        )
        .sort(([, left], [, right]) => left.seat - right.seat)
        .map(([playerId]) => playerId)
    : [];

  return {
    confirmWord: view.phase === 'word_reveal' && interaction.wordConfirmed !== true,
    finishSpeech:
      view.phase === 'speaking' && view.currentSpeakerId === view.self.playerId,
    lockVote: isVoting && interaction.voteLocked !== true && selectableTargetIds.length > 0,
    selectableTargetIds,
  };
}

export type UndercoverViewportProfile = 'portrait' | 'landscape-compact';

export function getUndercoverViewportProfile(
  width: number,
  height: number,
): UndercoverViewportProfile {
  return width > height && height <= 560 ? 'landscape-compact' : 'portrait';
}
