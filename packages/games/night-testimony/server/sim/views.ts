/**
 * 囚徒之夜 桌面模拟模式 —— 视图构建与严格解析。
 * 狱警身份与罪行只进本人视图；公开视图仅暴露干扰罪行卡与问题卡。
 */
import { z } from 'zod';
import type {
  NightTestimonySimPlayerView,
  NightTestimonySimPublicView,
  NightTestimonySimState,
} from './types.ts';

const questionCardSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string(),
  categoryLabel: z.string(),
});

const logEntrySchema = z.object({ text: z.string(), at: z.number() });
const timerSchema = z.object({ durationSeconds: z.number(), remainingSeconds: z.number(), isRunning: z.boolean(), isExploded: z.boolean() });
const diceSchema = z.object({ diceCount: z.number(), sides: z.number(), values: z.array(z.number()), lastRollBy: z.string().nullable() });
const bellSchema = z.object({ rungBy: z.string().nullable(), ringCount: z.number(), lastRingAt: z.number() });
const propsSchema = z.object({ timer: timerSchema.nullable(), dice: diceSchema.nullable(), bell: bellSchema.nullable() });

const publicViewSchema = z.object({
  gameId: z.literal('night-testimony'),
  rulesetId: z.literal('night_testimony_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  extraCrime: z.string().nullable(),
  questionArea: z.object({ card: questionCardSchema, revealedBy: z.string() }).nullable(),
  usedQuestionCount: z.number(),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z.object({ playerId: z.string(), isWarden: z.boolean(), crime: z.string().nullable() }).nullable(),
});

export function buildNightTestimonySimPublicView(state: NightTestimonySimState): NightTestimonySimPublicView {
  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    extraCrime: state.extraCrime,
    questionArea: state.questionArea ? { card: { ...state.questionArea.card }, revealedBy: state.questionArea.revealedBy } : null,
    usedQuestionCount: state.usedQuestionIds.length,
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildNightTestimonySimPlayerView(state: NightTestimonySimState, playerId: string): NightTestimonySimPlayerView {
  const base = buildNightTestimonySimPublicView(state);
  return {
    ...base,
    me: state.players.includes(playerId)
      ? {
          playerId,
          isWarden: playerId === state.wardenId,
          crime: state.crimes[playerId] ?? null,
        }
      : null,
  };
}

export function parseNightTestimonySimPlayerView(input: unknown): NightTestimonySimPlayerView {
  return playerViewSchema.parse(input) as NightTestimonySimPlayerView;
}

export function parseNightTestimonySimPublicView(input: unknown): NightTestimonySimPublicView {
  return publicViewSchema.parse(input) as NightTestimonySimPublicView;
}
