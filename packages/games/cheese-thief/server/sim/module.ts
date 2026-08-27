/**
 * 奶酪大盗 桌面模拟模式模块（cheese_thief_sim_v1）。无胜负判定，resultCandidate 恒 null。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { CHEESE_THIEF_MANIFEST } from '../../shared/manifest.ts';
import {
  assertCheeseThiefSimInvariants,
  createCheeseThiefSimState,
  reduceCheeseThiefSim,
} from './rules.ts';
import {
  buildCheeseThiefSimPlayerView,
  buildCheeseThiefSimPublicView,
  parseCheeseThiefSimPlayerView,
  parseCheeseThiefSimPublicView,
} from './views.ts';
import type {
  CheeseThiefSimAction,
  CheeseThiefSimConfig,
  CheeseThiefSimEvent,
  CheeseThiefSimPlayerView,
  CheeseThiefSimPublicView,
  CheeseThiefSimState,
} from './types.ts';

export const CHEESE_THIEF_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'cheese_thief_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): CheeseThiefSimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('奶酪大盗 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as CheeseThiefSimState;
  assertCheeseThiefSimInvariants(state);
  return state;
}

export const cheeseThiefSimModule: GameModuleV2<
  CheeseThiefSimConfig,
  CheeseThiefSimState,
  CheeseThiefSimAction,
  CheeseThiefSimPlayerView,
  CheeseThiefSimPublicView,
  CheeseThiefSimEvent,
  Record<string, never>
> = {
  identity: CHEESE_THIEF_SIM_IDENTITY,
  manifest: CHEESE_THIEF_MANIFEST,
  registeredRulesets: ['cheese_thief_sim_v1'],
  defaultRulesetId: 'cheese_thief_sim_v1',
  parseConfig: (input) => input as CheeseThiefSimConfig,
  parseAction: (input) => input as CheeseThiefSimAction,
  parseState,
  parsePlayerView: parseCheeseThiefSimPlayerView,
  parseSpectatorView: parseCheeseThiefSimPublicView,
  assertInvariants: assertCheeseThiefSimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: CheeseThiefSimConfig) {
    const state = createCheeseThiefSimState(players, config, ctx.random);
    assertCheeseThiefSimInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceCheeseThiefSim(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertCheeseThiefSimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildCheeseThiefSimPlayerView,
  getSpectatorView: buildCheeseThiefSimPublicView,
};
