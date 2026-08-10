import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { DURIAN_MANIFEST } from '../shared/manifest.ts';
import { parseDurianAction, parseDurianConfig } from './schemas.ts';
import {
  assertDurianInvariants,
  buildDurianOrderDeck,
  createDurianState,
  reduceDurianState,
} from './rules.ts';
import {
  buildDurianPlayerView,
  buildDurianSpectatorView,
  parseDurianPlayerView,
  parseDurianSpectatorView,
} from './views.ts';
import type {
  DurianAction,
  DurianConfig,
  DurianEvent,
  DurianPlayerView,
  DurianPublicView,
  DurianResult,
  DurianState,
} from './types.ts';

export const DURIAN_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'durian_orchard_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): DurianState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Durian 状态必须是对象');
  const state = structuredClone(input) as DurianState;
  assertDurianInvariants(state);
  return state;
}

function playerMatches(actor: Actor, action: DurianAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: DurianState): DurianResult | null {
  return state.phase === 'game_over'
    ? { winners: [...state.winners], penalties: { ...state.penalties } }
    : null;
}

export const durianModule: GameModuleV2<
  DurianConfig,
  DurianState,
  DurianAction,
  DurianPlayerView,
  DurianPublicView,
  DurianEvent,
  DurianResult
> = {
  manifest: DURIAN_MANIFEST,
  identity: DURIAN_VERSIONED_IDENTITY,
  registeredRulesets: ['durian_orchard_v1'],
  defaultRulesetId: 'durian_orchard_v1',
  parseConfig: (input) => parseDurianConfig(input ?? {}),
  parseAction: parseDurianAction,
  parseState,
  parsePlayerView: parseDurianPlayerView,
  parseSpectatorView: parseDurianSpectatorView,
  assertInvariants: assertDurianInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: DurianConfig) {
    const orderDeck = config.orderDeck ?? ctx.random.shuffle(buildDurianOrderDeck());
    const state = createDurianState(players, { rulesetId: 'durian_orchard_v1', orderDeck });
    assertDurianInvariants(state);
    return state;
  },
  reduce(_ctx, state, actor, action) {
    // 平台开局 begin 为系统动作（无 playerId），不参与玩家身份匹配。
    if (action.type !== 'begin' && !playerMatches(actor, action)) {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
    }
    const reduced = reduceDurianState(state, action);
    if (!reduced.ok) return reduced;
    assertDurianInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: [],
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildDurianPlayerView,
  getSpectatorView: buildDurianSpectatorView,
};
