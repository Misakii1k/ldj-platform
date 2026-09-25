import { werewolfAnnouncementSchema } from '@ldj/shared';
/** werewolf_platform_open_kill_v1 — strict zod schemas（config/action/state/views）。 */
import { z } from 'zod';
import { werewolfTimelineSchema, WEREWOLF_TIMELINE_ROLES } from '@ldj/shared';

export const V2_STATE_SCHEMA_VERSION = 2;
const pid = z.string().min(1).max(64);
export const v2RoleSchema = z.enum(['wolf', 'villager', 'seer', 'witch', 'guard', 'hunter', 'idiot']);
const team = z.enum(['wolves', 'village']);
const phase = z.enum(['role_reveal', 'night', 'hunter_shot', 'day_announcement', 'discussion', 'free_discussion', 'voting', 'runoff_voting', 'vote_result', 'last_words', 'game_over']);
const timed = phase.exclude(['game_over']);
const exitReason = z.enum(['night_kill', 'poisoned', 'voted_out', 'hunter_shot', 'disconnect_timeout']);
const seerResult = z.object({ night: z.number().int().nonnegative(), playerId: pid, team }).strict();

const rolePool = z.object({ guard: z.boolean().default(false), hunter: z.boolean().default(false), idiot: z.boolean().default(false) }).strict();
export const v2ConfigSchema = z.preprocess((raw: unknown) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (('guard' in obj || 'hunter' in obj || 'idiot' in obj) && !('roles' in obj)) {
    obj.roles = {
      guard: Boolean(obj.guard),
      hunter: Boolean(obj.hunter),
      idiot: Boolean(obj.idiot),
    };
    delete obj.guard;
    delete obj.hunter;
    delete obj.idiot;
  }
  return obj;
}, z.object({
  rulesetId: z.literal('werewolf_platform_open_kill_v1').default('werewolf_platform_open_kill_v1'),
  preset: z.enum(['classic', 'advanced']).default('classic'),
  pace: z.enum(['fast', 'standard', 'relaxed']).default('standard'),
  witchSelfSave: z.enum(['first_night', 'never', 'always']).default('first_night'),
  winCondition: z.enum(['numbers', 'roles']).default('numbers'),
  wolfKillScope: z.literal('any').default('any'),
  roles: rolePool.default({ guard: false, hunter: false, idiot: false }),
  freeDiscussion: z.boolean().default(true),
  wolfDelta: z.number().int().min(-1).max(1).default(0),
}).strict());

const night = z.object({
  wolfVotes: z.record(pid, pid),
  killTargetId: pid.nullable(),
  seerChecked: z.boolean(),
  seerResult: seerResult.nullable(),
  witchSaveDecision: z.boolean().nullable(),
  witchPoisonDecided: z.boolean(),
  witchPoisonTargetId: pid.nullable(),
  guardDecided: z.boolean(),
  guardTargetId: pid.nullable(),
}).strict();

const player = z.object({
  role: v2RoleSchema,
  alive: z.boolean(),
  seat: z.number().int().nonnegative(),
  forfeited: z.boolean(),
  exitReason: exitReason.nullable(),
  idiotRevealed: z.boolean(),
}).strict();

const voteSummary = z.object({
  day: z.number().int().nonnegative(),
  kind: z.enum(['normal', 'runoff']),
  outcome: z.enum(['eliminated', 'idiot_saved', 'tie', 'no_votes', 'runoff_tie']),
  tally: z.record(pid, z.number().int().nonnegative()),
  abstained: z.number().int().nonnegative(),
  eliminatedPlayerId: pid.nullable(),
}).strict();
const voteRecord = voteSummary.extend({ votes: z.record(pid, pid.nullable()) });
const pending = z.object({ next: z.enum(['runoff', 'last_words', 'next_night']), candidates: z.array(pid), winner: team.nullable() }).strict();

export const v2TimelineStateSchema = z
  .object({
    version: z.literal(1),
    stepIndex: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    pausedRemainingMs: z.number().int().nonnegative().nullable(),
    activeTimerToken: z.string().nullable(),
    initialRolePlan: z.array(z.enum(WEREWOLF_TIMELINE_ROLES)),
    current: werewolfTimelineSchema,
  })
  .strict();

export const v2StateSchema = z.object({
  schemaVersion: z.literal(V2_STATE_SCHEMA_VERSION), phase, day: z.number().int().nonnegative(), players: z.record(pid, player), config: v2ConfigSchema,
  confirmedRolePlayerIds: z.array(pid), announcementConfirmedPlayerIds: z.array(pid), night, seerHistory: z.array(seerResult),
  lastNightDeaths: z.array(pid), speakingOrder: z.array(pid), currentSpeakerIndex: z.number().int().nonnegative(), freeDiscussionReadyPlayerIds: z.array(pid).default([]), votes: z.record(pid, pid.nullable()),
  runoffCandidates: z.array(pid), lastVoteSummary: voteSummary.nullable(), voteHistory: z.array(voteRecord), pendingOutcome: pending.nullable(),
  lastWordsPlayerId: pid.nullable(), lastWordsQueue: z.array(pid).nullable().default(null), witchSaveUsed: z.boolean(), witchPoisonUsed: z.boolean(), lastGuardTargetId: pid.nullable(),
  pendingShoot: pid.nullable(), deadlineAt: z.number().int().nullable(), phaseToken: z.string().max(128).nullable(), winner: team.nullable(), aborted: z.boolean(),
  timelineState: v2TimelineStateSchema.nullable().default(null),
  announcement: werewolfAnnouncementSchema.nullable().optional(),
}).strict();

export const v2ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('confirm_role'), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('night_kill'), targetPlayerId: pid, timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('seer_check'), targetPlayerId: pid, timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('witch_save'), save: z.boolean(), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('witch_poison'), targetPlayerId: pid.nullable(), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('guard_guard'), targetPlayerId: pid.nullable(), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('hunter_shoot'), targetPlayerId: pid.nullable(), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('confirm_announcement'), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('finish_speech'), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('ready_vote'), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('day_vote'), targetPlayerId: pid.nullable(), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('finish_last_words'), timelineId: z.string().optional() }).strict(),
  z.object({ type: z.literal('phase_timeout'), phase: timed, day: z.number().int().nonnegative(), token: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal('timeline_timeout'), timelineId: z.string().min(1), token: z.string().min(1) }).strict(),
  z.object({ type: z.literal('player_forfeited'), playerIds: z.array(pid).min(1).max(12) }).strict(),
]);

const pubPlayer = z.object({ playerId: pid, alive: z.boolean(), seat: z.number().int().nonnegative(), forfeited: z.boolean(), exitReason: exitReason.nullable(), revealedRole: v2RoleSchema.nullable(), idiotRevealed: z.boolean() }).strict();
const reveal = z.object({ roles: z.record(pid, v2RoleSchema), voteHistory: z.array(voteRecord) }).strict();
export const v2NightStageSchema = z.enum(['wolf', 'witch', 'seer', 'guard', 'done']);

const pubBase = z.object({
  gameId: z.literal('werewolf'), rulesetId: z.literal('werewolf_platform_open_kill_v1'), schemaVersion: z.union([z.literal(1), z.literal(2)]).default(2), phase, day: z.number().int().nonnegative(), players: z.array(pubPlayer),
  config: v2ConfigSchema, confirmedRolePlayerIds: z.array(pid), announcementConfirmedPlayerIds: z.array(pid), nightStage: v2NightStageSchema, lastNightDeaths: z.array(pid), speakingOrder: z.array(pid),
  currentSpeakerId: pid.nullable(), freeDiscussionReadyPlayerIds: z.array(pid).default([]), lastWordsPlayerId: pid.nullable(), deadlineAt: z.number().int().nullable(), votesSubmitted: z.number().int().nonnegative(), votesExpected: z.number().int().nonnegative(),
  runoffCandidates: z.array(pid), lastVoteSummary: voteSummary.nullable(), pendingShooterId: pid.nullable(), winner: team.nullable(), aborted: z.boolean(), reveal: reveal.nullable(),
  timeline: werewolfTimelineSchema.nullable().optional(),
  announcement: werewolfAnnouncementSchema.nullable().optional(),
}).strict();

const me = z.object({
  playerId: pid, role: v2RoleSchema, alive: z.boolean(), forfeited: z.boolean(), confirmedRole: z.boolean(), confirmedAnnouncement: z.boolean(), canAct: z.boolean(), hasVoted: z.boolean(), hasReadiedVote: z.boolean().default(false), myVote: pid.nullable(),
  lastWordsPending: z.boolean(), wolfTeammateIds: z.array(pid), wolfVotes: z.record(pid, pid), hasNightVoted: z.boolean(), seerResults: z.array(seerResult), seerCheckedThisNight: z.boolean(),
  nightVictimId: pid.nullable(), witchSaveUsed: z.boolean(), witchPoisonUsed: z.boolean(), witchSaveDecision: z.boolean().nullable(), witchPoisonDecided: z.boolean(), witchCanSelfSave: z.boolean(),
  guardTargetId: pid.nullable(), guardDecided: z.boolean(), lastGuardTargetId: pid.nullable(), pendingShoot: z.boolean(), idiotRevealed: z.boolean(),
}).strict();

export const v2PublicViewSchema = pubBase;
export const v2PlayerViewSchema = pubBase.extend({ me: me.nullable() });
export const v2SpectatorViewSchema = pubBase;
