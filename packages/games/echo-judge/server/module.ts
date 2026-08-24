import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { ECHO_JUDGE_MANIFEST } from '../shared/manifest.ts';
import { parseEchoJudgeAction, parseEchoJudgeConfig } from './schemas.ts';
import {
  assertEchoJudgeInvariants,
  assignRoles,
  createEchoJudgeState,
  reduceEchoJudgeState,
} from './rules.ts';
import {
  buildEchoJudgePlayerView,
  buildEchoJudgeSpectatorView,
  parseEchoJudgePlayerView,
  parseEchoJudgeSpectatorView,
} from './views.ts';
import { pickEchoJudgeBotAction } from './bot.ts';
import type { BotDecisionInput } from '@ldj/shared';
import type {
  EchoJudgeAction,
  EchoJudgeConfig,
  EchoJudgeEvent,
  EchoJudgePlayerView,
  EchoJudgePublicView,
  EchoJudgeResult,
  EchoJudgeState,
} from './types.ts';

export const ECHO_JUDGE_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'echo_judge_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): EchoJudgeState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('伪人测试 状态必须是对象');
  }
  const state = structuredClone(input) as EchoJudgeState;
  state.accusations = state.accusations ?? [];
  state.caughtImpostors = state.caughtImpostors ?? [];
  state.wrongAccusations = state.wrongAccusations ?? [];
  state.escapedImpostors = state.escapedImpostors ?? [];
  assertEchoJudgeInvariants(state);
  return state;
}

/** 玩家可发起的动作类型（其余仅允许 system 投递） */
const PLAYER_ACTIONS = new Set<string>([
  'choose_role',
  'pick_topic_card',
  'start_round',
  'finish_speaking',
  'submit_answer',
  'accuse',
  'resolve_round',
]);

/** 规则自行调度、允许 system 超时兜底投递的动作（timerRunner 以 system actor 投递） */
const SYSTEM_FALLBACK_ACTIONS = new Set<string>(['submit_answer', 'finish_speaking', 'resolve_round']);

function playerMatches(actor: Actor, action: EchoJudgeAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: EchoJudgeState): EchoJudgeResult | null {
  return state.phase === 'game_over' ? { winners: [...state.winners] } : null;
}

export const echoJudgeModule: GameModuleV2<
  EchoJudgeConfig,
  EchoJudgeState,
  EchoJudgeAction,
  EchoJudgePlayerView,
  EchoJudgePublicView,
  EchoJudgeEvent,
  EchoJudgeResult
> = {
  manifest: ECHO_JUDGE_MANIFEST,
  identity: ECHO_JUDGE_VERSIONED_IDENTITY,
  registeredRulesets: ['echo_judge_v1'],
  defaultRulesetId: 'echo_judge_v1',
  parseConfig: (input) => parseEchoJudgeConfig(input ?? {}),
  parseAction: parseEchoJudgeAction,
  parseState,
  parsePlayerView: parseEchoJudgePlayerView,
  parseSpectatorView: parseEchoJudgeSpectatorView,
  assertInvariants: assertEchoJudgeInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: EchoJudgeConfig) {
    const judgeId = players[0]!;
    const { roles, triggerWords } = assignRoles(players, judgeId, ctx.random);
    const state = createEchoJudgeState(players, config, judgeId, '', roles, triggerWords);
    assertEchoJudgeInvariants(state);
    return state;
  },
  reduce(_ctx: GameContext, state, actor, action) {
    // finish_speaking/resolve_round/submit_answer 允许 system 超时兜底（自动推进/自动提交）；
    // 其余玩家动作必须身份一致。
    if (actor.kind === 'system' && SYSTEM_FALLBACK_ACTIONS.has(action.type)) {
      // 规则自调度的超时兜底放行
    } else if (PLAYER_ACTIONS.has(action.type)) {
      if (actor.kind !== 'player') {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许玩家发起' };
      }
      if (!playerMatches(actor, action)) {
        return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
      }
    } else if (actor.kind !== 'system') {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '该动作只允许系统发起' };
    }
    const reduced = reduceEchoJudgeState(state, action, {
      now: _ctx.now,
      random: _ctx.random as never,
    });
    if (!reduced.ok) return reduced;
    assertEchoJudgeInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildEchoJudgePlayerView,
  getSpectatorView: buildEchoJudgeSpectatorView,
  pickBotAction(input: BotDecisionInput<EchoJudgePlayerView>) {
    return pickEchoJudgeBotAction(input);
  },
};
