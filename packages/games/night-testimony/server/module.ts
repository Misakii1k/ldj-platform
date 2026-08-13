import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { NIGHT_TESTIMONY_MANIFEST } from '../shared/manifest.ts';
import { parseNightTestimonyAction, parseNightTestimonyConfig } from './schemas.ts';
import { pickNightTestimonyBotAction } from './bot.ts';
import { assignWardenAndCrimes, assertNightTestimonyInvariants, createNightTestimonyState, reduceNightTestimonyState } from './rules.ts';
import {
  buildNightTestimonyPlayerView,
  buildNightTestimonySpectatorView,
  parseNightTestimonyPlayerView,
  parseNightTestimonySpectatorView,
} from './views.ts';
import type {
  NightTestimonyAction,
  NightTestimonyConfig,
  NightTestimonyEvent,
  NightTestimonyPlayerView,
  NightTestimonyPublicView,
  NightTestimonyResult,
  NightTestimonyState,
} from './types.ts';

export const NIGHT_TESTIMONY_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'night_testimony_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): NightTestimonyState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('囚徒之夜 状态必须是对象');
  }
  const state = structuredClone(input) as NightTestimonyState;
  assertNightTestimonyInvariants(state);
  return state;
}

/** 玩家可发起的动作类型（其余仅允许 system 投递） */
const PLAYER_ACTIONS = new Set<string>(['ask', 'answer', 'cast_vote', 'submit_guesses']);

function playerMatches(actor: Actor, action: NightTestimonyAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: NightTestimonyState): NightTestimonyResult | null {
  if (state.phase !== 'game_over') return null;
  if (state.wardenRevealed === false) {
    return { winners: [...state.winners], wardenRevealed: false, crimesAllGuessed: false };
  }
  if (state.wardenGuesses !== null && state.crimesAllGuessed !== null) {
    return {
      winners: [...state.winners],
      wardenRevealed: true,
      crimesAllGuessed: state.crimesAllGuessed,
    };
  }
  return null;
}

export const nightTestimonyModule: GameModuleV2<
  NightTestimonyConfig,
  NightTestimonyState,
  NightTestimonyAction,
  NightTestimonyPlayerView,
  NightTestimonyPublicView,
  NightTestimonyEvent,
  NightTestimonyResult
> = {
  manifest: NIGHT_TESTIMONY_MANIFEST,
  identity: NIGHT_TESTIMONY_VERSIONED_IDENTITY,
  registeredRulesets: ['night_testimony_v1'],
  defaultRulesetId: 'night_testimony_v1',
  parseConfig: (input) => parseNightTestimonyConfig(input ?? {}),
  parseAction: parseNightTestimonyAction,
  parseState,
  parsePlayerView: parseNightTestimonyPlayerView,
  parseSpectatorView: parseNightTestimonySpectatorView,
  assertInvariants: assertNightTestimonyInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: NightTestimonyConfig) {
    const { wardenId, crimes } = assignWardenAndCrimes(players, ctx.random);
    const state = createNightTestimonyState(players, config, wardenId, crimes);
    assertNightTestimonyInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, actor, action) {
    // 玩家动作必须与连接身份一致；其余仅允许系统投递。
    if (PLAYER_ACTIONS.has(action.type)) {
      if (actor.kind !== 'player') {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许玩家发起' };
      }
      if (!playerMatches(actor, action)) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
      }
    } else if (actor.kind !== 'system') {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许系统发起' };
    }
    const reduced = reduceNightTestimonyState(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertNightTestimonyInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildNightTestimonyPlayerView,
  getSpectatorView: buildNightTestimonySpectatorView,
  pickBotAction(input) {
    return pickNightTestimonyBotAction(input);
  },
};
