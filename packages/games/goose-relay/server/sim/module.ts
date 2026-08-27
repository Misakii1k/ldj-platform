/**
 * 以鹅传鹅 桌面模拟模式模块（goose_relay_sim_v1）。无胜负判定，resultCandidate 恒 null。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { GOOSE_RELAY_MANIFEST } from '../../shared/manifest.ts';
import {
  assertGooseRelaySimInvariants,
  createGooseRelaySimState,
  reduceGooseRelaySim,
} from './rules.ts';
import {
  buildGooseRelaySimPlayerView,
  buildGooseRelaySimPublicView,
  parseGooseRelaySimPlayerView,
  parseGooseRelaySimPublicView,
} from './views.ts';
import type {
  GooseRelaySimAction,
  GooseRelaySimConfig,
  GooseRelaySimEvent,
  GooseRelaySimPlayerView,
  GooseRelaySimPublicView,
  GooseRelaySimState,
} from './types.ts';

export const GOOSE_RELAY_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'goose_relay_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): GooseRelaySimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('以鹅传鹅 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as GooseRelaySimState;
  assertGooseRelaySimInvariants(state);
  return state;
}

export const gooseRelaySimModule: GameModuleV2<
  GooseRelaySimConfig,
  GooseRelaySimState,
  GooseRelaySimAction,
  GooseRelaySimPlayerView,
  GooseRelaySimPublicView,
  GooseRelaySimEvent,
  Record<string, never>
> = {
  identity: GOOSE_RELAY_SIM_IDENTITY,
  manifest: GOOSE_RELAY_MANIFEST,
  registeredRulesets: ['goose_relay_sim_v1'],
  defaultRulesetId: 'goose_relay_sim_v1',
  parseConfig: (input) => input as GooseRelaySimConfig,
  parseAction: (input) => input as GooseRelaySimAction,
  parseState,
  parsePlayerView: parseGooseRelaySimPlayerView,
  parseSpectatorView: parseGooseRelaySimPublicView,
  assertInvariants: assertGooseRelaySimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: GooseRelaySimConfig) {
    const state = createGooseRelaySimState(players, config, ctx.random);
    assertGooseRelaySimInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceGooseRelaySim(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertGooseRelaySimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildGooseRelaySimPlayerView,
  getSpectatorView: buildGooseRelaySimPublicView,
};
