/**
 * 伪人测试 桌面模拟模式 —— 视图构建与严格解析。
 * 触发词只进本人视图的 me.triggerWord。
 */
import { z } from 'zod';
import type {
  EchoJudgeSimPlayerView,
  EchoJudgeSimPublicView,
  EchoJudgeSimState,
} from './types.ts';

const topicCardSchema = z.object({
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
  gameId: z.literal('echo-judge'),
  rulesetId: z.literal('echo_judge_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  topicArea: z.object({ card: topicCardSchema, revealedBy: z.string() }).nullable(),
  usedTopicCount: z.number(),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z.object({ playerId: z.string(), triggerWord: z.string().nullable() }).nullable(),
});

export function buildEchoJudgeSimPublicView(state: EchoJudgeSimState): EchoJudgeSimPublicView {
  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    topicArea: state.topicArea ? { card: { ...state.topicArea.card }, revealedBy: state.topicArea.revealedBy } : null,
    usedTopicCount: state.usedTopicIds.length,
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildEchoJudgeSimPlayerView(state: EchoJudgeSimState, playerId: string): EchoJudgeSimPlayerView {
  const base = buildEchoJudgeSimPublicView(state);
  return {
    ...base,
    me: state.players.includes(playerId) ? { playerId, triggerWord: state.triggerWords[playerId] ?? null } : null,
  };
}

export function parseEchoJudgeSimPlayerView(input: unknown): EchoJudgeSimPlayerView {
  return playerViewSchema.parse(input) as EchoJudgeSimPlayerView;
}

export function parseEchoJudgeSimPublicView(input: unknown): EchoJudgeSimPublicView {
  return publicViewSchema.parse(input) as EchoJudgeSimPublicView;
}
