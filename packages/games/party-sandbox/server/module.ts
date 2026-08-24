import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { PARTY_SANDBOX_MANIFEST } from '../shared/manifest.ts';
import { decidePartySandboxBotAction } from './bot.ts';
import {
  parsePartySandboxAction,
  parsePartySandboxConfig,
} from './schemas.ts';
import {
  assertPartySandboxInvariants,
  createPartySandboxState,
  reducePartySandboxState,
} from './rules.ts';
import {
  buildPartySandboxPlayerView,
  buildPartySandboxPublicView,
  partySandboxPlayerViewSchema,
  partySandboxPublicViewSchema,
} from './views.ts';
import type {
  PartySandboxAction,
  PartySandboxConfig,
  PartySandboxEvent,
  PartySandboxPlayerView,
  PartySandboxPublicView,
  PartySandboxState,
} from './types.ts';

export const PARTY_SANDBOX_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'party_sandbox_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): PartySandboxState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('聚会沙盒 状态必须是对象');
  }
  const state = structuredClone(input) as PartySandboxState;
  assertPartySandboxInvariants(state);
  return state;
}

const PLAYER_ACTIONS = new Set<string>([
  'spawn_prop',
  'remove_prop',
  'operate_revolver',
  'operate_dice',
  'operate_bell',
  'operate_deck',
  'operate_timer',
  'operate_coin',
  'ai_setup_table',
  'reset_table',
]);

function playerMatches(actor: Actor, action: PartySandboxAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

export const partySandboxModule: GameModuleV2<
  PartySandboxConfig,
  PartySandboxState,
  PartySandboxAction,
  PartySandboxPlayerView,
  PartySandboxPublicView,
  PartySandboxEvent,
  Record<string, never>
> = {
  identity: PARTY_SANDBOX_VERSIONED_IDENTITY,
  manifest: PARTY_SANDBOX_MANIFEST,
  registeredRulesets: ['party_sandbox_v1'],
  defaultRulesetId: 'party_sandbox_v1',
  parseConfig: parsePartySandboxConfig,
  parseAction: parsePartySandboxAction,
  parseState,
  parsePlayerView: (v) => partySandboxPlayerViewSchema.parse(v) as PartySandboxPlayerView,
  parseSpectatorView: (v) => partySandboxPublicViewSchema.parse(v) as PartySandboxPublicView,
  assertInvariants: assertPartySandboxInvariants,
  snapshotMigrations: {},
  createInitialState(_ctx: GameContext, players: string[], config: PartySandboxConfig) {
    const state = createPartySandboxState(players, config);
    assertPartySandboxInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, actor, action) {
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

    const random = {
      nextInt: (min: number, max: number) => _ctx.random.nextInt(min, max),
      shuffle: <T>(items: readonly T[]) => _ctx.random.shuffle(items),
    };
    const reduced = reducePartySandboxState(state, action, { now: _ctx.now, random });
    if (!reduced.ok) {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: reduced.error ?? '动作无效' };
    }
    assertPartySandboxInvariants(reduced.nextState!);
    return {
      ok: true,
      nextState: reduced.nextState!,
      publicEvents: reduced.events ?? [],
      privateEvents: [],
      effects: reduced.effects ?? [],
      resultCandidate: null,
    };
  },
  getPlayerView: buildPartySandboxPlayerView,
  getSpectatorView: buildPartySandboxPublicView,
  pickBotAction(input) {
    const view = input.view as PartySandboxPlayerView;
    return decidePartySandboxBotAction(view, input.playerId);
  },
};
