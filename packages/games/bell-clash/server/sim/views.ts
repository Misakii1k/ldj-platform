/**
 * 铃铛对决（Ding）桌面模拟模式 —— 视图构建与严格解析。
 * 私密内容（本人手牌）只进玩家视图的 me.hand；公开/观战视图不含手牌内容。
 */
import { z } from 'zod';
import type { BellClashCard } from '../types.ts';
import type {
  BellClashSimPlayerView,
  BellClashSimPublicView,
  BellClashSimState,
} from './types.ts';

const cardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), color: z.enum(['red', 'yellow', 'green', 'blue']), number: z.number().int().min(1).max(6) }),
  z.object({ kind: z.literal('phrase'), color: z.enum(['red', 'yellow', 'green', 'blue']), phrase: z.string() }),
]);

const logEntrySchema = z.object({ text: z.string(), at: z.number() });

const timerSchema = z.object({
  durationSeconds: z.number(),
  remainingSeconds: z.number(),
  isRunning: z.boolean(),
  isExploded: z.boolean(),
});

const diceSchema = z.object({
  diceCount: z.number(),
  sides: z.number(),
  values: z.array(z.number()),
  lastRollBy: z.string().nullable(),
});

const bellSchema = z.object({
  rungBy: z.string().nullable(),
  ringCount: z.number(),
  lastRingAt: z.number(),
});

const propsSchema = z.object({
  timer: timerSchema.nullable(),
  dice: diceSchema.nullable(),
  bell: bellSchema.nullable(),
});

const tableCardSchema = z.object({ card: cardSchema, playedBy: z.string() });

const publicViewSchema = z.object({
  gameId: z.literal('bell-clash'),
  rulesetId: z.literal('bell_clash_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  handCounts: z.record(z.string(), z.number()),
  drawCount: z.number(),
  discardTop: cardSchema.nullable(),
  tableCards: z.array(tableCardSchema),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z
    .object({
      playerId: z.string(),
      hand: z.array(cardSchema),
    })
    .nullable(),
});

export function buildBellClashSimPublicView(state: BellClashSimState): BellClashSimPublicView {
  const handCounts: Record<string, number> = {};
  for (const pid of state.players) {
    handCounts[pid] = (state.hands[pid] ?? []).length;
  }
  return {
    gameId: 'bell-clash',
    rulesetId: 'bell_clash_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    handCounts,
    drawCount: state.drawPile.length,
    discardTop: state.discardTop,
    tableCards: state.tableCards.map((t) => ({ card: t.card, playedBy: t.playedBy })),
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildBellClashSimPlayerView(state: BellClashSimState, playerId: string): BellClashSimPlayerView {
  const base = buildBellClashSimPublicView(state);
  return {
    ...base,
    me: state.players.includes(playerId) ? { playerId, hand: [...(state.hands[playerId] ?? [])] } : null,
  };
}

export function parseBellClashSimPlayerView(input: unknown): BellClashSimPlayerView {
  return playerViewSchema.parse(input) as BellClashSimPlayerView;
}

export function parseBellClashSimPublicView(input: unknown): BellClashSimPublicView {
  return publicViewSchema.parse(input) as BellClashSimPublicView;
}
