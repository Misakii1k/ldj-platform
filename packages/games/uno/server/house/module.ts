/**
 * uno_platform_house_v1 — GameModuleV2 版本化模块。
 * 与 legacy UNO 完全隔离；注册键 (uno, uno_platform_house_v1)。
 */
import { type GameContext, type GameModuleV2 } from '@ldj/shared';
import {
  createUnoHouseInitialState,
  reduceUnoHouse,
  buildUnoHousePublicView,
  buildUnoHousePlayerView,
  assertUnoHouseInvariants,
} from './rules.ts';
import {
  unoHouseActionSchema,
  unoHouseConfigSchema,
  unoHousePlayerViewSchema,
  unoHousePublicViewSchema,
  unoHouseStateSchema,
} from './schemas.ts';
import { pickUnoHouseBotAction } from './bot.ts';
import type {
  UnoHouseAction,
  UnoHouseConfig,
  UnoHouseEvent,
  UnoHousePlayerView,
  UnoHousePublicView,
  UnoHouseResult,
  UnoHouseState,
} from './types.ts';

export const UNO_HOUSE_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'uno_platform_house_v1',
  viewVersion: 1,
};

export { unoHouseChatPolicy } from './chatPolicy.ts';

export const unoHouseModule: GameModuleV2<
  UnoHouseConfig,
  UnoHouseState,
  UnoHouseAction,
  UnoHousePlayerView,
  UnoHousePublicView,
  UnoHouseEvent,
  UnoHouseResult
> = {
  manifest: {
    id: 'uno',
    displayName: 'UNO',
    version: '0.4.0-d4',
    minPlayers: 2,
    maxPlayers: 10,
    stateSchemaVersion: 1,
  },
  identity: UNO_HOUSE_VERSIONED_IDENTITY,
  registeredRulesets: ['uno_platform_house_v1'],
  defaultRulesetId: 'uno_platform_house_v1',
  parseConfig: (input) => unoHouseConfigSchema.parse(input),
  parseAction: (input) => unoHouseActionSchema.parse(input),
  parseState: (input) => unoHouseStateSchema.parse(input),
  parsePlayerView: (input) => unoHousePlayerViewSchema.parse(input),
  parseSpectatorView: (input) => unoHousePublicViewSchema.parse(input),
  assertInvariants: assertUnoHouseInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: UnoHouseConfig) {
    const state = createUnoHouseInitialState(ctx, players, config);
    assertUnoHouseInvariants(state);
    return state;
  },
  reduce(ctx, state, actor, action) {
    const result = reduceUnoHouse(ctx, state, actor, action);
    if (!result.ok) return result;
    const nextState = unoHouseStateSchema.parse(result.nextState);
    assertUnoHouseInvariants(nextState);
    return {
      ok: true,
      nextState,
      publicEvents: result.publicEvents,
      privateEvents: result.privateEvents,
      effects: result.effects,
      resultCandidate: result.resultCandidate,
    };
  },
  getPlayerView(state, playerId) {
    return unoHousePlayerViewSchema.parse(buildUnoHousePlayerView(state, playerId));
  },
  getSpectatorView(state) {
    return unoHousePublicViewSchema.parse(buildUnoHousePublicView(state));
  },
  pickBotAction(input) {
    return pickUnoHouseBotAction(input);
  },
};

export { pickUnoHouseBotAction } from './bot.ts';
export * from './types.ts';
export * from './schemas.ts';
export { assertUnoHouseInvariants } from './rules.ts';
