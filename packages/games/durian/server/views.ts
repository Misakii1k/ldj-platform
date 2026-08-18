import { z } from 'zod';
import { DURIAN_FRUITS } from './types.ts';
import { computeActiveTableTotals } from './rules.ts';
import type {
  ChallengeDetails,
  DurianCard,
  DurianPlayerView,
  DurianPublicView,
  DurianState,
  TablePlacement,
} from './types.ts';

const pid = z.string().min(1).max(64);
const fruit = z.enum(DURIAN_FRUITS);
const monkeySpecial = z.enum(['flip', 'do_nothing', 'three_void', 'banana_void']);

const fruitHalfSchema = z.object({
  fruit,
  quantity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict();

const fruitCardSchema = z.object({
  id: pid,
  kind: z.literal('fruit'),
  left: fruitHalfSchema,
  right: fruitHalfSchema,
}).strict();

const monkeyCardSchema = z.object({
  id: pid,
  kind: z.literal('monkey'),
  special: monkeySpecial,
}).strict();

const durianCardSchema = z.discriminatedUnion('kind', [fruitCardSchema, monkeyCardSchema]);

const tableFruitPlacementSchema = z.object({
  placementId: pid,
  card: fruitCardSchema,
  checkHalf: z.enum(['left', 'right']),
  placedBy: pid,
}).strict();

const tableMonkeyPlacementSchema = z.object({
  placementId: pid,
  card: monkeyCardSchema,
  placedBy: pid,
  targetPlacementId: pid.optional(),
}).strict();

const tablePlacementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fruit'), data: tableFruitPlacementSchema }).strict(),
  z.object({ kind: z.literal('monkey'), data: tableMonkeyPlacementSchema }).strict(),
]);

const challengeDetailsSchema = z.object({
  challengerId: pid,
  accusedId: pid,
  success: z.boolean(),
  loserId: pid,
  penaltyPoints: z.number().int().nonnegative(),
  tableTotals: z.record(fruit, z.number().int().nonnegative()),
  stockTotals: z.record(fruit, z.number().int().nonnegative()),
  oversoldFruits: z.array(fruit),
}).strict();

const durianPublicViewSchema = z.object({
  gameId: z.literal('durian'),
  rulesetId: z.literal('durian_orchard_v1'),
  schemaVersion: z.literal(1),
  phase: z.enum(['turn_action', 'choose_placement', 'choose_flip', 'challenge_result', 'game_over']),
  players: z.array(pid),
  round: z.number().int().positive(),
  maxRounds: z.number().int().positive(),
  mode: z.enum(['standard', 'simulator']),
  deckCount: z.number().int().nonnegative(),
  tablePlacements: z.array(tablePlacementSchema),
  currentPlayerId: pid.nullable(),
  previousPlayerId: pid.nullable(),
  lastChallenge: challengeDetailsSchema.nullable(),
  penalties: z.record(pid, z.number().int().nonnegative()),
  eliminatedPlayers: z.array(pid),
  winners: z.array(pid),
  activeTableTotals: z.record(fruit, z.number().int().nonnegative()),
  voidThreeActive: z.boolean(),
  voidBananaActive: z.boolean(),
}).strict();

const durianPlayerViewSchema = durianPublicViewSchema.extend({
  me: z.object({
    playerId: pid,
    ownForeheadHidden: z.boolean(),
    drawnCard: durianCardSchema.nullable(),
    visibleForeheadCards: z.array(z.object({ playerId: pid, card: durianCardSchema }).strict()),
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

function buildPublicView(state: DurianState): DurianPublicView {
  const { totals: activeTableTotals, voidThreeActive, voidBananaActive } = computeActiveTableTotals(state.tablePlacements);

  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    round: state.round,
    maxRounds: state.maxRounds,
    mode: state.mode,
    deckCount: state.deck.length,
    tablePlacements: structuredClone(state.tablePlacements) as TablePlacement[],
    currentPlayerId: state.currentPlayerId,
    previousPlayerId: state.previousPlayerId,
    lastChallenge: state.lastChallenge ? structuredClone(state.lastChallenge) as ChallengeDetails : null,
    penalties: { ...state.penalties },
    eliminatedPlayers: [...state.eliminatedPlayers],
    winners: [...state.winners],
    activeTableTotals,
    voidThreeActive,
    voidBananaActive,
  };
}

export function buildDurianPlayerView(state: DurianState, playerId: string): DurianPlayerView {
  const publicView = buildPublicView(state);
  const isParticipant = state.players.includes(playerId);

  if (!isParticipant) {
    return {
      ...publicView,
      me: null,
    };
  }

  // 印度扑克机制：标准线上模式下平时只能看到其他人的头顶牌，质疑结算时揭示自己暗牌；
  // 纯模拟模式下设备作为实体手牌展示板（面向其他玩家立于面前），因此设备端需要渲染该玩家分配到的卡牌。
  const isRevealed = (state.mode === 'standard' && (state.phase === 'challenge_result' || state.phase === 'game_over')) || state.mode === 'simulator';

  const visibleForeheadCards = state.players
    .filter((id) => (isRevealed || id !== playerId) && state.foreheadCards[id])
    .map((id) => ({
      playerId: id,
      card: structuredClone(state.foreheadCards[id]!) as DurianCard,
    }));

  const isCurrent = state.currentPlayerId === playerId;
  const drawnCard = isCurrent && state.drawnCard ? structuredClone(state.drawnCard) as DurianCard : null;

  return {
    ...publicView,
    me: {
      playerId,
      ownForeheadHidden: !isRevealed,
      drawnCard,
      visibleForeheadCards,
    },
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
