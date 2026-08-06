import { normalizeLegacyReduceResult, type GameModuleV2 } from '@ldj/shared';
import { UNO_MANIFEST } from '../shared/manifest.ts';
import {
  unoModule,
  type UnoAction,
  type UnoConfig,
  type UnoEvent,
  type UnoPlayerView,
  type UnoPublicView,
  type UnoResult,
  type UnoState,
} from './module.ts';
import { assertUnoInvariants } from './invariants.ts';
import {
  migrateLegacyUnoState,
  unoActionSchema,
  unoConfigSchema,
  unoPlayerViewSchema,
  unoPublicViewSchema,
  unoStateSchema,
} from './schemas.ts';

export const UNO_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'uno_legacy_platform_v1',
  viewVersion: 1,
};

export const unoVersionedModule: GameModuleV2<
  UnoConfig,
  UnoState,
  UnoAction,
  UnoPlayerView,
  UnoPublicView,
  UnoEvent,
  UnoResult
> = {
  manifest: UNO_MANIFEST,
  identity: UNO_VERSIONED_IDENTITY,
  registeredRulesets: ['uno_legacy_platform_v1'],
  defaultRulesetId: 'uno_legacy_platform_v1',
  parseConfig: input => unoConfigSchema.parse(input),
  parseAction: input => unoActionSchema.parse(input),
  parseState: input => unoStateSchema.parse(input),
  parsePlayerView: input => unoPlayerViewSchema.parse(input),
  parseSpectatorView: input => unoPublicViewSchema.parse(input),
  assertInvariants: assertUnoInvariants,
  snapshotMigrations: {},
  createInitialState(ctx, players) {
    const state = migrateLegacyUnoState(unoModule.createInitialState(ctx, players, { variant: 'standard' }));
    assertUnoInvariants(state);
    return state;
  },
  reduce(ctx, state, actor, action) {
    const legacy = unoModule.reduce(ctx, state, actor, action);
    if (!legacy.ok) return legacy;
    const nextState = migrateLegacyUnoState(legacy.state);
    assertUnoInvariants(nextState);
    return normalizeLegacyReduceResult(
      { ...legacy, state: nextState },
      { resultCandidate: unoModule.getResult(nextState) },
    );
  },
  getPlayerView(state, playerId) {
    return unoPlayerViewSchema.parse(unoModule.getPlayerView(state, playerId));
  },
  getSpectatorView(state) {
    return unoPublicViewSchema.parse(unoModule.getSpectatorView(state));
  },
  pickBotAction(input) {
    return unoModule.pickBotAction?.(input) ?? null;
  },
  buildBotPrompt(input) {
    return unoModule.buildBotPrompt?.(input) ?? null;
  },
};

export { assertUnoInvariants, migrateLegacyUnoState };
