/**
 * 囚徒之夜 桌面模拟模式模块（night_testimony_sim_v1）。无胜负判定，resultCandidate 恒 null。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { NIGHT_TESTIMONY_MANIFEST } from '../../shared/manifest.ts';
import {
  assertNightTestimonySimInvariants,
  createNightTestimonySimState,
  reduceNightTestimonySim,
} from './rules.ts';
import {
  buildNightTestimonySimPlayerView,
  buildNightTestimonySimPublicView,
  parseNightTestimonySimPlayerView,
  parseNightTestimonySimPublicView,
} from './views.ts';
import type {
  NightTestimonySimAction,
  NightTestimonySimConfig,
  NightTestimonySimEvent,
  NightTestimonySimPlayerView,
  NightTestimonySimPublicView,
  NightTestimonySimState,
} from './types.ts';

export const NIGHT_TESTIMONY_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'night_testimony_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): NightTestimonySimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('囚徒之夜 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as NightTestimonySimState;
  assertNightTestimonySimInvariants(state);
  return state;
}

export const nightTestimonySimModule: GameModuleV2<
  NightTestimonySimConfig,
  NightTestimonySimState,
  NightTestimonySimAction,
  NightTestimonySimPlayerView,
  NightTestimonySimPublicView,
  NightTestimonySimEvent,
  Record<string, never>
> = {
  identity: NIGHT_TESTIMONY_SIM_IDENTITY,
  manifest: NIGHT_TESTIMONY_MANIFEST,
  registeredRulesets: ['night_testimony_sim_v1'],
  defaultRulesetId: 'night_testimony_sim_v1',
  parseConfig: (input) => input as NightTestimonySimConfig,
  parseAction: (input) => input as NightTestimonySimAction,
  parseState,
  parsePlayerView: parseNightTestimonySimPlayerView,
  parseSpectatorView: parseNightTestimonySimPublicView,
  assertInvariants: assertNightTestimonySimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: NightTestimonySimConfig) {
    const state = createNightTestimonySimState(players, config, ctx.random);
    assertNightTestimonySimInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceNightTestimonySim(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertNightTestimonySimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildNightTestimonySimPlayerView,
  getSpectatorView: buildNightTestimonySimPublicView,
};
