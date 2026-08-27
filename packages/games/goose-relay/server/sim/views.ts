/**
 * 以鹅传鹅 桌面模拟模式 —— 视图构建与严格解析。
 * 案情卡只进头鹅本人的 me.caseCard。
 */
import { z } from 'zod';
import type {
  GooseRelaySimPlayerView,
  GooseRelaySimPublicView,
  GooseRelaySimState,
} from './types.ts';

const logEntrySchema = z.object({ text: z.string(), at: z.number() });
const timerSchema = z.object({ durationSeconds: z.number(), remainingSeconds: z.number(), isRunning: z.boolean(), isExploded: z.boolean() });
const diceSchema = z.object({ diceCount: z.number(), sides: z.number(), values: z.array(z.number()), lastRollBy: z.string().nullable() });
const bellSchema = z.object({ rungBy: z.string().nullable(), ringCount: z.number(), lastRingAt: z.number() });
const propsSchema = z.object({ timer: timerSchema.nullable(), dice: diceSchema.nullable(), bell: bellSchema.nullable() });
const caseSchema = z.object({ murderer: z.string(), victim: z.string() });

const publicViewSchema = z.object({
  gameId: z.literal('goose-relay'),
  rulesetId: z.literal('goose_relay_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  candidateCards: z.array(z.string()),
  headPlayerId: z.string(),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z.object({ playerId: z.string(), isHead: z.boolean(), caseCard: caseSchema.nullable() }).nullable(),
});

export function buildGooseRelaySimPublicView(state: GooseRelaySimState): GooseRelaySimPublicView {
  return {
    gameId: 'goose-relay',
    rulesetId: 'goose_relay_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    candidateCards: [...state.candidateCards],
    headPlayerId: state.headPlayerId,
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildGooseRelaySimPlayerView(state: GooseRelaySimState, playerId: string): GooseRelaySimPlayerView {
  const base = buildGooseRelaySimPublicView(state);
  const isHead = playerId === state.headPlayerId;
  return {
    ...base,
    me: state.players.includes(playerId)
      ? { playerId, isHead, caseCard: isHead && state.caseCard ? { ...state.caseCard } : null }
      : null,
  };
}

export function parseGooseRelaySimPlayerView(input: unknown): GooseRelaySimPlayerView {
  return playerViewSchema.parse(input) as GooseRelaySimPlayerView;
}

export function parseGooseRelaySimPublicView(input: unknown): GooseRelaySimPublicView {
  return publicViewSchema.parse(input) as GooseRelaySimPublicView;
}
