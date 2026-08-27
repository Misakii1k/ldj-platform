/**
 * 铃铛对决（Ding）桌面模拟模式模块（bell_clash_sim_v1）。
 * 无系统胜负裁决：resultCandidate 恒为 null。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { BELL_CLASH_MANIFEST } from '../../shared/manifest.ts';
import {
  assertBellClashSimInvariants,
  createBellClashSimState,
  reduceBellClashSim,
} from './rules.ts';
import {
  buildBellClashSimPlayerView,
  buildBellClashSimPublicView,
  parseBellClashSimPlayerView,
  parseBellClashSimPublicView,
} from './views.ts';
import type {
  BellClashSimAction,
  BellClashSimConfig,
  BellClashSimEvent,
  BellClashSimPlayerView,
  BellClashSimPublicView,
  BellClashSimState,
} from './types.ts';

export const BELL_CLASH_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'bell_clash_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): BellClashSimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Ding 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as BellClashSimState;
  assertBellClashSimInvariants(state);
  return state;
}

export const bellClashSimModule: GameModuleV2<
  BellClashSimConfig,
  BellClashSimState,
  BellClashSimAction,
  BellClashSimPlayerView,
  BellClashSimPublicView,
  BellClashSimEvent,
  Record<string, never>
> = {
  identity: BELL_CLASH_SIM_IDENTITY,
  manifest: BELL_CLASH_MANIFEST,
  registeredRulesets: ['bell_clash_sim_v1'],
  defaultRulesetId: 'bell_clash_sim_v1',
  parseConfig: (input) => input as BellClashSimConfig,
  parseAction: (input) => input as BellClashSimAction,
  parseState,
  parsePlayerView: parseBellClashSimPlayerView,
  parseSpectatorView: parseBellClashSimPublicView,
  assertInvariants: assertBellClashSimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: BellClashSimConfig) {
    const state = createBellClashSimState(players, config, ctx.random);
    assertBellClashSimInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceBellClashSim(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertBellClashSimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildBellClashSimPlayerView,
  getSpectatorView: buildBellClashSimPublicView,
};
