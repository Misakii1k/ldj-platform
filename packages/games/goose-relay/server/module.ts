import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';
import { parseGooseRelayAction, parseGooseRelayConfig } from './schemas.ts';
import {
  assertGooseRelayInvariants,
  buildRandomCase,
  createGooseRelayState,
  evilCountFor,
  reduceGooseRelayState,
} from './rules.ts';
import {
  buildGooseRelayPlayerView,
  buildGooseRelaySpectatorView,
  parseGooseRelayPlayerView,
  parseGooseRelaySpectatorView,
} from './views.ts';
import type {
  GooseRelayAction,
  GooseRelayConfig,
  GooseRelayEvent,
  GooseRelayPlayerView,
  GooseRelayPublicView,
  GooseRelayResult,
  GooseRelayState,
} from './types.ts';

export const GOOSE_RELAY_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'goose_relay_classic_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): GooseRelayState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('以鹅传鹅 状态必须是对象');
  }
  const state = structuredClone(input) as GooseRelayState;
  assertGooseRelayInvariants(state);
  return state;
}

function playerMatches(actor: Actor, action: GooseRelayAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: GooseRelayState): GooseRelayResult | null {
  return state.phase === 'game_over' && state.caseMatched !== null
    ? {
        winners: [...state.winners],
        caseMatched: state.caseMatched,
        evilIdentified: state.evilIdentified ?? false,
      }
    : null;
}

export const gooseRelayModule: GameModuleV2<
  GooseRelayConfig,
  GooseRelayState,
  GooseRelayAction,
  GooseRelayPlayerView,
  GooseRelayPublicView,
  GooseRelayEvent,
  GooseRelayResult
> = {
  manifest: GOOSE_RELAY_MANIFEST,
  identity: GOOSE_RELAY_VERSIONED_IDENTITY,
  registeredRulesets: ['goose_relay_classic_v1'],
  defaultRulesetId: 'goose_relay_classic_v1',
  parseConfig: (input) => parseGooseRelayConfig(input ?? {}),
  parseAction: parseGooseRelayAction,
  parseState,
  parsePlayerView: parseGooseRelayPlayerView,
  parseSpectatorView: parseGooseRelaySpectatorView,
  assertInvariants: assertGooseRelayInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: GooseRelayConfig) {
    const caseCard = buildRandomCase(ctx.random);
    // 恶鹅从非头鹅中随机抽取（不重复）
    const candidates = ctx.random.shuffle(players.slice(1));
    const evilGeese = candidates.slice(0, evilCountFor(players.length));
    const state = createGooseRelayState(players, config, caseCard, evilGeese);
    assertGooseRelayInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, actor, action) {
    // 平台计时器/开局以 system 投递；玩家动作必须与连接身份一致。
    const isPlayerAction = action.type === 'transmit' || action.type === 'accuse' || action.type === 'cast_vote';
    if (isPlayerAction) {
      if (actor.kind !== 'player') {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许玩家发起' };
      }
      if (!playerMatches(actor, action)) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
      }
    } else if (actor.kind !== 'system') {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许系统发起' };
    }
    const reduced = reduceGooseRelayState(state, action, { now: _ctx.now });
    if (!reduced.ok) return reduced;
    assertGooseRelayInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildGooseRelayPlayerView,
  getSpectatorView: buildGooseRelaySpectatorView,
};
