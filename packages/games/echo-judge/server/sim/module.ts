/**
 * 伪人测试 桌面模拟模式模块（echo_judge_sim_v1）。无胜负判定，resultCandidate 恒 null。
 */
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { ECHO_JUDGE_MANIFEST } from '../../shared/manifest.ts';
import {
  assertEchoJudgeSimInvariants,
  createEchoJudgeSimState,
  reduceEchoJudgeSim,
} from './rules.ts';
import {
  buildEchoJudgeSimPlayerView,
  buildEchoJudgeSimPublicView,
  parseEchoJudgeSimPlayerView,
  parseEchoJudgeSimPublicView,
} from './views.ts';
import type {
  EchoJudgeSimAction,
  EchoJudgeSimConfig,
  EchoJudgeSimEvent,
  EchoJudgeSimPlayerView,
  EchoJudgeSimPublicView,
  EchoJudgeSimState,
} from './types.ts';

export const ECHO_JUDGE_SIM_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'echo_judge_sim_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): EchoJudgeSimState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('伪人测试 模拟模式 状态必须是对象');
  }
  const state = structuredClone(input) as EchoJudgeSimState;
  assertEchoJudgeSimInvariants(state);
  return state;
}

export const echoJudgeSimModule: GameModuleV2<
  EchoJudgeSimConfig,
  EchoJudgeSimState,
  EchoJudgeSimAction,
  EchoJudgeSimPlayerView,
  EchoJudgeSimPublicView,
  EchoJudgeSimEvent,
  Record<string, never>
> = {
  identity: ECHO_JUDGE_SIM_IDENTITY,
  manifest: ECHO_JUDGE_MANIFEST,
  registeredRulesets: ['echo_judge_sim_v1'],
  defaultRulesetId: 'echo_judge_sim_v1',
  parseConfig: (input) => input as EchoJudgeSimConfig,
  parseAction: (input) => input as EchoJudgeSimAction,
  parseState,
  parsePlayerView: parseEchoJudgeSimPlayerView,
  parseSpectatorView: parseEchoJudgeSimPublicView,
  assertInvariants: assertEchoJudgeSimInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: EchoJudgeSimConfig) {
    const state = createEchoJudgeSimState(players, config, ctx.random);
    assertEchoJudgeSimInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, _actor: Actor, action) {
    const reduced = reduceEchoJudgeSim(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertEchoJudgeSimInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: null,
    };
  },
  getPlayerView: buildEchoJudgeSimPlayerView,
  getSpectatorView: buildEchoJudgeSimPublicView,
};
