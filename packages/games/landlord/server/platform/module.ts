/**
 * landlord_platform_v1 — GameModuleV2 装配。
 * identity engine 2 / ruleset landlord_platform_v1 / view 1；snapshotMigrations 空（schema v1）。
 * 复用 server/cards.ts 纯函数与 legacy 陪练逻辑；legacy module 行为零改动。
 */
import type { GameModuleV2 } from '@ldj/shared';
import { LANDLORD_MANIFEST } from '../../shared/manifest.ts';
import { platformConfigSchema, platformPlayerViewSchema, platformPublicViewSchema } from './schemas.ts';
import {
  assertPlatformInvariants,
  buildPlatformPlayerView,
  buildPlatformPublicView,
  createPlatformInitialState,
  parsePlatformAction,
  parsePlatformState,
  reducePlatform,
} from './rules.ts';
import { pickPlatformBotAction } from './bot.ts';
import { buildPlatformBotPrompt } from './botPrompt.ts';
import type {
  PlatformAction,
  PlatformConfig,
  PlatformEvent,
  PlatformPlayerView,
  PlatformPublicView,
  PlatformResult,
  PlatformState,
} from './types.ts';

export const LANDLORD_PLATFORM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'landlord_platform_v1',
  viewVersion: 1,
} as const;

export const landlordPlatformModule: GameModuleV2<
  PlatformConfig,
  PlatformState,
  PlatformAction,
  PlatformPlayerView,
  PlatformPublicView,
  PlatformEvent,
  PlatformResult
> = {
  manifest: LANDLORD_MANIFEST,
  identity: LANDLORD_PLATFORM_IDENTITY,
  registeredRulesets: ['landlord_platform_v1'],
  defaultRulesetId: 'landlord_platform_v1',
  parseConfig: (input) => platformConfigSchema.parse(input ?? {}),
  parseAction: parsePlatformAction,
  parseState: parsePlatformState,
  parsePlayerView: (input) => platformPlayerViewSchema.parse(input),
  parseSpectatorView: (input) => platformPublicViewSchema.parse(input),
  assertInvariants: assertPlatformInvariants,
  snapshotMigrations: {},
  createInitialState: createPlatformInitialState,
  reduce: reducePlatform,
  getPlayerView: buildPlatformPlayerView,
  getSpectatorView: buildPlatformPublicView,
  pickBotAction: pickPlatformBotAction,
  buildBotPrompt: buildPlatformBotPrompt,
};
