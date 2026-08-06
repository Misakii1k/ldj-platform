/**
 * undercover_blank_v1 — GameModuleV2 版本化模块。
 * 与 classic 完全隔离；注册键 (undercover, undercover_blank_v1)。
 */
import { type GameContext, type GameEffect, type GameModuleV2 } from '@ldj/shared';
import {
  assertBlankInvariants,
  buildBlankPlayerView,
  buildBlankResult,
  buildBlankSpectatorView,
  createBlankInitialState,
  reduceBlank,
} from './rules.ts';
import {
  blankActionSchema,
  blankConfigSchema,
  blankPlayerViewSchema,
  blankSpectatorViewSchema,
  blankStateSchema,
} from './schemas.ts';
import { pickBlankBotAction } from './bot.ts';
import type {
  BlankAction,
  BlankConfig,
  BlankEvent,
  BlankPlayerView,
  BlankResult,
  BlankSpectatorView,
  BlankState,
} from './types.ts';

export const BLANK_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'undercover_blank_v1',
  viewVersion: 1,
};

const BLANK_MANIFEST = {
  id: 'undercover',
  displayName: '谁是卧底',
  version: '0.4.0-d4',
  minPlayers: 4,
  maxPlayers: 12,
  stateSchemaVersion: 1,
} as const;

export const blankModule: GameModuleV2<
  BlankConfig,
  BlankState,
  BlankAction,
  BlankPlayerView,
  BlankSpectatorView,
  BlankEvent,
  BlankResult
> = {
  manifest: BLANK_MANIFEST,
  identity: BLANK_VERSIONED_IDENTITY,
  registeredRulesets: ['undercover_blank_v1'],
  defaultRulesetId: 'undercover_blank_v1',
  parseConfig: (input) => blankConfigSchema.parse(input),
  // zod v3 将 z.unknown() 输出推断为可选键，而外部裁判结果在契约中必须存在；
  // 以 types.ts 的 BlankAction 为权威，在模块边界做一次显式收窄。
  parseAction: (input) => blankActionSchema.parse(input) as BlankAction,
  parseState: (input) => blankStateSchema.parse(input),
  parsePlayerView: (input) => blankPlayerViewSchema.parse(input),
  parseSpectatorView: (input) => blankSpectatorViewSchema.parse(input),
  assertInvariants: assertBlankInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: BlankConfig) {
    const state = createBlankInitialState(ctx, players, config);
    assertBlankInvariants(state);
    return state;
  },
  reduce(ctx, state, actor, action) {
    const result = reduceBlank(ctx, state, actor, action);
    if (!result.ok) return result;
    const nextState = blankStateSchema.parse(result.nextState);
    assertBlankInvariants(nextState);
    return {
      ok: true,
      nextState,
      publicEvents: result.publicEvents,
      privateEvents: result.privateEvents,
      effects: result.effects as readonly GameEffect[],
      // 平台以 resultCandidate !== null 判定终局：终局动作必须给出正式结果。
      resultCandidate: nextState.phase === 'game_over' ? buildBlankResult(nextState) : null,
    };
  },
  getPlayerView(state, playerId) {
    return blankPlayerViewSchema.parse(buildBlankPlayerView(state, playerId));
  },
  getSpectatorView(state) {
    return blankSpectatorViewSchema.parse(buildBlankSpectatorView(state));
  },
  pickBotAction(input) {
    return pickBlankBotAction(input);
  },
};

export { assertBlankInvariants } from './rules.ts';
export { buildBlankPublicView } from './rules.ts';
export * from './types.ts';
export * from './schemas.ts';
