import { z } from 'zod';
import type {
  UnoAction,
  UnoEvent,
  UnoPlayerView,
  UnoPublicView,
  UnoResult,
  UnoState,
} from './module.ts';

export const unoColorSchema = z.enum(['red', 'yellow', 'green', 'blue']);
const coloredActionKindSchema = z.enum(['skip', 'reverse', 'draw2']);
export const unoCardSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1), kind: z.literal('number'), color: unoColorSchema, value: z.number().int().min(0).max(9) }).strict(),
  z.object({ id: z.string().min(1), kind: coloredActionKindSchema, color: unoColorSchema }).strict(),
  z.object({ id: z.string().min(1), kind: z.enum(['wild', 'wild4']) }).strict(),
]);

export const unoConfigSchema = z.object({
  rulesetId: z.literal('uno_legacy_platform_v1').optional(),
  variant: z.literal('standard').default('standard'),
}).strict();

export const unoActionSchema: z.ZodType<UnoAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('draw_card') }).strict(),
  z.object({ type: z.literal('call_uno') }).strict(),
  z.object({ type: z.literal('pass_after_draw') }).strict(),
  z.object({
    type: z.literal('play_card'),
    cardId: z.string().min(1),
    declaredColor: unoColorSchema.optional(),
  }).strict(),
]);

const lastPlayedSchema = z.object({
  playerId: z.string().min(1),
  card: unoCardSchema,
  declaredColor: unoColorSchema.nullable(),
  resultingColor: unoColorSchema,
}).strict();
const playerStateSchema = z.object({ unoCalled: z.boolean() }).strict();

export const unoStateSchema: z.ZodType<UnoState> = z.object({
  schemaVersion: z.literal(1),
  phase: z.enum(['playing', 'game_over']),
  players: z.array(z.string().min(1)),
  deck: z.array(unoCardSchema),
  discardPile: z.array(unoCardSchema),
  hands: z.record(z.string().min(1), z.array(unoCardSchema)),
  playerState: z.record(z.string().min(1), playerStateSchema),
  currentPlayerId: z.string().min(1),
  direction: z.union([z.literal(1), z.literal(-1)]),
  currentColor: unoColorSchema,
  pendingDraw: z.number().int().nonnegative(),
  hasDrawnThisTurn: z.boolean(),
  winnerId: z.string().min(1).nullable(),
  lastPlayed: lastPlayedSchema.nullable(),
}).strict();

const playerSummarySchema = z.object({
  playerId: z.string().min(1),
  handCount: z.number().int().nonnegative(),
  unoCalled: z.boolean(),
  isCurrentPlayer: z.boolean(),
}).strict();
const unoPublicViewObjectSchema = z.object({
  gameId: z.literal('uno'),
  phase: z.enum(['playing', 'game_over']),
  players: z.array(playerSummarySchema),
  topDiscard: unoCardSchema,
  currentColor: unoColorSchema,
  currentPlayerId: z.string().min(1),
  currentPlayerIndex: z.number().int().nonnegative(),
  nextPlayerId: z.string().min(1),
  direction: z.union([z.literal(1), z.literal(-1)]),
  pendingDraw: z.number().int().nonnegative(),
  winnerId: z.string().min(1).nullable(),
  deckCount: z.number().int().nonnegative(),
  discardCount: z.number().int().positive(),
  lastPlayed: lastPlayedSchema.nullable(),
  lastPlayedCard: unoCardSchema.nullable(),
  lastPlayedBy: z.string().min(1).nullable(),
}).strict();
export const unoPublicViewSchema: z.ZodType<UnoPublicView> = unoPublicViewObjectSchema;
export const unoPlayerViewSchema: z.ZodType<UnoPlayerView> = unoPublicViewObjectSchema.extend({
  me: z.object({
    playerId: z.string().min(1),
    hand: z.array(unoCardSchema),
    hasDrawnThisTurn: z.boolean(),
    isCurrentPlayer: z.boolean(),
    playableCardIds: z.array(z.string().min(1)),
  }).strict().nullable(),
}).strict();

export const unoEventSchema: z.ZodType<UnoEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card_played'), playerId: z.string().min(1), card: unoCardSchema }).strict(),
  z.object({ type: z.literal('card_drawn'), playerId: z.string().min(1), count: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('uno_called'), playerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('game_finished'), winnerId: z.string().min(1) }).strict(),
]);
export const unoResultSchema: z.ZodType<UnoResult> = z.object({ winnerId: z.string().min(1) }).strict();

/** 历史 schema 1 在 lastPlayed 出现前写过 raw snapshot；只在显式兼容边界调用。 */
export function migrateLegacyUnoState(snapshot: unknown): UnoState {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    throw new Error('UNO 历史快照必须是对象');
  }
  const record = snapshot as Record<string, unknown>;
  return unoStateSchema.parse(
    Object.hasOwn(record, 'lastPlayed') ? snapshot : { ...record, lastPlayed: null },
  );
}
