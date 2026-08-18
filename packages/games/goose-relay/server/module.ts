import type { Actor, BotDecisionInput, GameContext, GameModuleV2 } from '@ldj/shared';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';
import { pickGooseRelayBotAction } from './bot.ts';
import { parseGooseRelayAction, parseGooseRelayConfig } from './schemas.ts';
import {
  assertGooseRelayInvariants,
  createGooseRelayState,
  evilCountFor,
  pickCandidateCards,
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
  viewVersion: 2,
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
    const candidateCards = pickCandidateCards(ctx.random, 9);
    // 随机指派 1 只恶鹅
    const shuffled = ctx.random.shuffle(players);
    const evilGeese = shuffled.slice(0, evilCountFor(players.length));
    const state = createGooseRelayState(players, config, candidateCards, evilGeese);
    assertGooseRelayInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, actor, action) {
    // 平台计时器/开局以 system 投递；玩家动作必须与连接身份一致。
    const isPlayerAction =
      action.type === 'claim_head' ||
      action.type === 'pick_cards' ||
      action.type === 'relay_done' ||
      action.type === 'end_discussion' ||
      action.type === 'accuse' ||
      action.type === 'cast_vote';

    if (isPlayerAction) {
      if (actor.kind !== 'player' && (action.type !== 'end_discussion' || actor.kind !== 'system')) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许玩家发起' };
      }
      if (actor.kind === 'player' && 'playerId' in action && action.playerId && !playerMatches(actor, action)) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
      }
      if (
        action.type === 'end_discussion' &&
        actor.kind === 'player' &&
        (state.phase !== 'discussion' || actor.playerId !== state.headPlayerId)
      ) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '只有头鹅可以在讨论阶段结束讨论' };
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
  pickBotAction(input: BotDecisionInput<GooseRelayPlayerView>) {
    return pickGooseRelayBotAction(input);
  },
};
