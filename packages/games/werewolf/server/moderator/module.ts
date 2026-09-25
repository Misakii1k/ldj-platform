import { createWerewolfAnnouncement } from '@ldj/shared';
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
  stateSchemaVersion: 2,
};

function migrateV1(snapshot: unknown): ModeratorState {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('Invalid moderator v1 snapshot');
  }
  const s = snapshot as Record<string, unknown>;
  if (s.schemaVersion !== 1) {
    throw new Error('Invalid moderator v1 schemaVersion');
  }
  return {
    ...(s as unknown as ModeratorState),
    schemaVersion: 2,
    timelineState: null,
  };
}

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
  snapshotMigrations: {
    1: migrateV1,
  },
  createInitialState: createModeratorInitialState,
  reduce(ctx, state, actor, action) {
    const result = reduceModerator(ctx,state,actor,action);
    if (!result.ok || !result.nextState.timelineState) return result;
    const current = result.nextState.timelineState.current;
    if ((state.timelineState?.current.role !== 'witch' || state.timelineState?.current.segment !== 'action') && current.role === 'witch' && current.segment === 'action' && current.mode === 'auto') {
      return { ...result, nextState: { ...result.nextState, announcement: createWerewolfAnnouncement('witch:' + current.id, ['witch_cure_prompt','witch_poison_prompt'],ctx.now) } };
    }
    return result;
  },
  getPlayerView: buildModeratorPlayerView,
  getSpectatorView: buildModeratorSpectatorView,
};
