/**
 * 奶酪大盗 桌面模拟模式 —— 视图构建与严格解析。
 * 苏醒时辰/身份角色牌只进本人视图。
 */
import { z } from 'zod';
import type {
  CheeseThiefSimPlayerView,
  CheeseThiefSimPublicView,
  CheeseThiefSimState,
} from './types.ts';

const logEntrySchema = z.object({ text: z.string(), at: z.number() });
const timerSchema = z.object({ durationSeconds: z.number(), remainingSeconds: z.number(), isRunning: z.boolean(), isExploded: z.boolean() });
const diceSchema = z.object({ diceCount: z.number(), sides: z.number(), values: z.array(z.number()), lastRollBy: z.string().nullable() });
const bellSchema = z.object({ rungBy: z.string().nullable(), ringCount: z.number(), lastRingAt: z.number() });
const propsSchema = z.object({ timer: timerSchema.nullable(), dice: diceSchema.nullable(), bell: bellSchema.nullable() });

const publicViewSchema = z.object({
  gameId: z.literal('cheese-thief'),
  rulesetId: z.literal('cheese_thief_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  roleCardsEnabled: z.boolean(),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z
    .object({
      playerId: z.string(),
      wakeHour: z.number().nullable(),
      roleCard: z.enum(['cat', 'dog', 'whiteMouse']).nullable(),
    })
    .nullable(),
});

export function buildCheeseThiefSimPublicView(state: CheeseThiefSimState): CheeseThiefSimPublicView {
  return {
    gameId: 'cheese-thief',
    rulesetId: 'cheese_thief_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    roleCardsEnabled: state.config.roleCards,
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildCheeseThiefSimPlayerView(state: CheeseThiefSimState, playerId: string): CheeseThiefSimPlayerView {
  const base = buildCheeseThiefSimPublicView(state);
  return {
    ...base,
    me: state.players.includes(playerId)
      ? { playerId, wakeHour: state.wakeHours[playerId] ?? null, roleCard: state.roleCards[playerId] ?? null }
      : null,
  };
}

export function parseCheeseThiefSimPlayerView(input: unknown): CheeseThiefSimPlayerView {
  return playerViewSchema.parse(input) as CheeseThiefSimPlayerView;
}

export function parseCheeseThiefSimPublicView(input: unknown): CheeseThiefSimPublicView {
  return publicViewSchema.parse(input) as CheeseThiefSimPublicView;
}
