import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { CHEESE_THIEF_MANIFEST } from '../shared/manifest.ts';
import { parseCheeseThiefAction, parseCheeseThiefConfig } from './schemas.ts';
import {
  assertCheeseThiefInvariants,
  assignRoleCards,
  createCheeseThiefState,
  reduceCheeseThiefState,
  rollHourChoices,
  rollWakeHours,
} from './rules.ts';
import {
  buildCheeseThiefPlayerView,
  buildCheeseThiefSpectatorView,
  parseCheeseThiefPlayerView,
  parseCheeseThiefSpectatorView,
} from './views.ts';
import { pickCheeseThiefBotAction } from './bot.ts';
import type {
  CheeseThiefAction,
  CheeseThiefConfig,
  CheeseThiefEvent,
  CheeseThiefPlayerView,
  CheeseThiefPublicView,
  CheeseThiefResult,
  CheeseThiefState,
} from './types.ts';

export const CHEESE_THIEF_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'cheese_thief_classic_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): CheeseThiefState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('奶酪大盗 状态必须是对象');
  }
  const state = structuredClone(input) as CheeseThiefState;
  assertCheeseThiefInvariants(state);
  return state;
}

/** 玩家可发起的动作类型（其余仅允许 system 投递） */
const PLAYER_ACTIONS = new Set<string>([
  'choose_hour',
  'peek_die',
  'skip_peek',
  'select_accomplice',
  'reveal_cat',
  'reveal_dog',
  'cast_vote',
  'cast_abstention',
]);

function playerMatches(actor: Actor, action: CheeseThiefAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: CheeseThiefState): CheeseThiefResult | null {
  return state.phase === 'game_over' && state.thiefCaught !== null
    ? {
        winners: [...state.winners],
        thiefId: state.thiefId,
        thiefCaught: state.thiefCaught,
        eliminated: [...(state.eliminated ?? [])],
      }
    : null;
}

export const cheeseThiefModule: GameModuleV2<
  CheeseThiefConfig,
  CheeseThiefState,
  CheeseThiefAction,
  CheeseThiefPlayerView,
  CheeseThiefPublicView,
  CheeseThiefEvent,
  CheeseThiefResult
> = {
  manifest: CHEESE_THIEF_MANIFEST,
  identity: CHEESE_THIEF_VERSIONED_IDENTITY,
  registeredRulesets: ['cheese_thief_classic_v1'],
  defaultRulesetId: 'cheese_thief_classic_v1',
  parseConfig: (input) => parseCheeseThiefConfig(input ?? {}),
  parseAction: parseCheeseThiefAction,
  parseState,
  parsePlayerView: parseCheeseThiefPlayerView,
  parseSpectatorView: parseCheeseThiefSpectatorView,
  assertInvariants: assertCheeseThiefInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: CheeseThiefConfig) {
    const playersLen = players.length;
    const wakeHours = playersLen === 4 ? {} : rollWakeHours(players, ctx.random);
    const hourChoices = playersLen === 4 ? rollHourChoices(players, ctx.random) : null;
    const roleCards = config?.roleCards ? assignRoleCards(players, ctx.random) : null;
    const state = createCheeseThiefState(players, config, wakeHours, hourChoices, roleCards);
    assertCheeseThiefInvariants(state);
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
    const reduced = reduceCheeseThiefState(state, action, {
      now: _ctx.now,
      random: _ctx.random,
    });
    if (!reduced.ok) return reduced;
    assertCheeseThiefInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildCheeseThiefPlayerView,
  getSpectatorView: buildCheeseThiefSpectatorView,
  pickBotAction: pickCheeseThiefBotAction,
};
