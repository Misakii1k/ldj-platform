/**
 * 一智千金桌面模拟模式模块（wits_wagers_sim_v1）。
 * 无系统胜负裁决：resultCandidate 恒为 null，也不提供 bot 钩子。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { WITS_WAGERS_MANIFEST } from '../../shared/manifest.ts';
import {
  assertWitsWagersSimInvariants,
  createWitsWagersSimState,
  reduceWitsWagersSim,
} from './rules.ts';
import {
  buildWitsWagersSimPlayerView,
  buildWitsWagersSimPublicView,
  parseWitsWagersSimPlayerView,
  parseWitsWagersSimPublicView,
} from './views.ts';
import type {
  WitsWagersSimAction,
  WitsWagersSimConfig,
  WitsWagersSimEvent,
  WitsWagersSimPlayerView,
  WitsWagersSimPublicView,
  WitsWagersSimState,
} from './types.ts';

export const WITS_WAGERS_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'wits_wagers_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): WitsWagersSimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('一智千金 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as WitsWagersSimState;
  assertWitsWagersSimInvariants(state);
  return state;
}

export const witsWagersSimModule: GameModuleV2<
  WitsWagersSimConfig,
  WitsWagersSimState,
  WitsWagersSimAction,
  WitsWagersSimPlayerView,
  WitsWagersSimPublicView,
  WitsWagersSimEvent,
  Record<string, never>
> = {
  identity: WITS_WAGERS_SIM_IDENTITY,
  manifest: WITS_WAGERS_MANIFEST,
  registeredRulesets: ['wits_wagers_sim_v1'],
  defaultRulesetId: 'wits_wagers_sim_v1',
  parseConfig: (input) => input as WitsWagersSimConfig,
  parseAction: (input) => input as WitsWagersSimAction,
  parseState,
  parsePlayerView: parseWitsWagersSimPlayerView,
  parseSpectatorView: parseWitsWagersSimPublicView,
  assertInvariants: assertWitsWagersSimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: WitsWagersSimConfig) {
    const state = createWitsWagersSimState(players, config, ctx.random);
    assertWitsWagersSimInvariants(state);
    return state;
  },
  reduce(ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceWitsWagersSim(state, action, { now: ctx.now, random: ctx.random });
    if (!reduced.ok) return reduced;
    assertWitsWagersSimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildWitsWagersSimPlayerView,
  getSpectatorView: buildWitsWagersSimPublicView,
};
