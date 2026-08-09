import { z } from 'zod';
import { DURIAN_FRUITS } from './types.ts';
import type {
  BellWindow,
  DurianPlayerView,
  DurianPublicView,
  DurianState,
  OrderCard,
} from './types.ts';

const pid = z.string().min(1).max(64);
const fruit = z.enum(DURIAN_FRUITS);
const staffEvent = z.enum(['double_check', 'extra_basket', 'mixed_crate']);

const inventoryCardSchema = z.object({ id: pid, fruit }).strict();
const demandChangeSchema = z.object({ fruit, quantity: z.number().int().nonnegative() }).strict();
const orderOptionSchema = z.object({ fruit, quantity: z.union([z.literal(1), z.literal(2)]) }).strict();
const orderCardSchema = z.object({ id: pid, options: z.tuple([orderOptionSchema, orderOptionSchema]), staffEvent }).strict();
const orderRecordSchema = z.object({
  orderId: pid,
  playerId: pid,
  optionIndex: z.union([z.literal(0), z.literal(1)]),
  staffEvent,
  changes: z.array(demandChangeSchema),
}).strict();
const bellSchema = z.union([
  z.object({ windowId: pid, status: z.literal('open'), claimantId: z.null() }).strict(),
  z.object({ windowId: pid, status: z.literal('locked'), claimantId: pid }).strict(),
]);

const durianPublicViewSchema = z.object({
  gameId: z.literal('durian'),
  rulesetId: z.literal('durian_orchard_v1'),
  schemaVersion: z.literal(1),
  phase: z.enum(['ordering', 'buzzer', 'game_over']),
  players: z.array(pid),
  demand: z.record(fruit, z.number().int().nonnegative()),
  currentOrder: orderCardSchema.nullable(),
  history: z.array(orderRecordSchema),
  currentPlayerId: pid.nullable(),
  bell: bellSchema.nullable(),
  angerLevel: z.number().int().min(1).max(7),
  penalties: z.record(pid, z.number().int().nonnegative()),
  winners: z.array(pid),
}).strict();

const durianPlayerViewSchema = durianPublicViewSchema.extend({
  me: z.object({
    playerId: pid,
    ownInventoryHidden: z.literal(true),
    visibleInventory: z.array(z.object({ playerId: pid, card: inventoryCardSchema }).strict()),
  }).strict().nullable(),
});

function parseOrThrow<T>(schema: z.ZodType<unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

function copyOrder(order: OrderCard | null): OrderCard | null {
  return order ? structuredClone(order) : null;
}

function buildPublicView(state: DurianState): DurianPublicView {
  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    demand: { ...state.demand },
    currentOrder: copyOrder(state.currentOrder),
    history: structuredClone(state.history),
    currentPlayerId: state.currentPlayerId,
    bell: state.bell ? { ...state.bell } as BellWindow : null,
    angerLevel: state.angerLevel,
    penalties: { ...state.penalties },
    winners: [...state.winners],
  };
}

export function buildDurianPlayerView(state: DurianState, playerId: string): DurianPlayerView {
  return {
    ...buildPublicView(state),
    me: state.players.includes(playerId)
      ? {
          playerId,
          ownInventoryHidden: true,
          visibleInventory: state.players
            .filter((id) => id !== playerId)
            .map((id) => ({ playerId: id, card: { ...state.playerInventory[id]! } })),
        }
      : null,
  };
}

export function buildDurianSpectatorView(state: DurianState): DurianPublicView {
  return buildPublicView(state);
}

export function parseDurianSpectatorView(input: unknown): DurianPublicView {
  return parseOrThrow<DurianPublicView>(durianPublicViewSchema, input, 'Durian 视图');
}

export function parseDurianPlayerView(input: unknown): DurianPlayerView {
  return parseOrThrow<DurianPlayerView>(durianPlayerViewSchema, input, 'Durian 玩家视图');
}
