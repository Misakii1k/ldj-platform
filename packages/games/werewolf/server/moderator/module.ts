import type { GameManifest, GameModuleV2 } from '@ldj/shared';
import type {
  ModeratorEvent,
  ModeratorResult,
  ModeratorState,
  WerewolfModeratorAction,
  WerewolfModeratorConfig,
  WerewolfModeratorView,
} from './types.ts';
import {
  assertModeratorInvariants,
  buildModeratorPlayerView,
  buildModeratorSpectatorView,
  createModeratorInitialState,
  reduceModerator,
} from './reducer.ts';
import { parseModeratorAction, parseModeratorConfig } from './schemas.ts';

export const WEREWOLF_MODERATOR_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'werewolf_moderator_v1',
  viewVersion: 1,
} as const;

export const WEREWOLF_MODERATOR_MANIFEST: GameManifest = {
  id: 'werewolf',
  displayName: '狼人杀（真人主持）',
  version: '1.0.0',
  minPlayers: 5,
  maxPlayers: 13,
  stateSchemaVersion: 1,
};

export const werewolfModeratorModule: GameModuleV2<
  WerewolfModeratorConfig,
  ModeratorState,
  WerewolfModeratorAction,
  WerewolfModeratorView,
  WerewolfModeratorView,
  ModeratorEvent,
  ModeratorResult
> = {
  manifest: WEREWOLF_MODERATOR_MANIFEST,
  identity: WEREWOLF_MODERATOR_IDENTITY,
  registeredRulesets: ['werewolf_moderator_v1'],
  defaultRulesetId: 'werewolf_moderator_v1',
  parseConfig: parseModeratorConfig,
  parseAction: parseModeratorAction,
  parseState: (input) => {
    const s = input as ModeratorState;
    assertModeratorInvariants(s);
    return s;
  },
  parsePlayerView: (input) => input as WerewolfModeratorView,
  parseSpectatorView: (input) => input as WerewolfModeratorView,
  assertInvariants: assertModeratorInvariants,
  snapshotMigrations: {},
  createInitialState: createModeratorInitialState,
  reduce: reduceModerator,
  getPlayerView: buildModeratorPlayerView,
  getSpectatorView: buildModeratorSpectatorView,
};
