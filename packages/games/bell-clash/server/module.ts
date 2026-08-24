import { pickBellClashBotAction } from './bot.ts';
import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { BELL_CLASH_MANIFEST } from '../shared/manifest.ts';
import { parseBellClashAction, parseBellClashConfig } from './schemas.ts';
import {
  assertBellClashInvariants,
  buildDeck,
  createBellClashState,
  reduceBellClashState,
} from './rules.ts';
import {
  buildBellClashPlayerView,
  buildBellClashSpectatorView,
  parseBellClashPlayerView,
  parseBellClashSpectatorView,
} from './views.ts';
import type {
  BellClashAction,
  BellClashCard,
  BellClashConfig,
  BellClashEvent,
  BellClashPlayerView,
  BellClashPublicView,
  BellClashResult,
  BellClashState,
} from './types.ts';

export const BELL_CLASH_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'bell_clash_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): BellClashState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('铃铛对决 状态必须是对象');
  }
  const state = structuredClone(input) as BellClashState;
  assertBellClashInvariants(state);
  return state;
}

/** 玩家可发起的动作类型（其余仅允许 system 投递） */
const PLAYER_ACTIONS = new Set<string>(['play_card', 'draw_card', 'ring_bell']);

function playerMatches(actor: Actor, action: BellClashAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: BellClashState): BellClashResult | null {
  return state.phase === 'game_over' ? { winners: [...state.winners] } : null;
}

export const bellClashModule: GameModuleV2<
  BellClashConfig,
  BellClashState,
  BellClashAction,
  BellClashPlayerView,
  BellClashPublicView,
  BellClashEvent,
  BellClashResult
> = {
  manifest: BELL_CLASH_MANIFEST,
  identity: BELL_CLASH_VERSIONED_IDENTITY,
  registeredRulesets: ['bell_clash_v1'],
  defaultRulesetId: 'bell_clash_v1',
  parseConfig: (input) => parseBellClashConfig(input ?? {}),
  parseAction: parseBellClashAction,
  parseState,
  parsePlayerView: parseBellClashPlayerView,
  parseSpectatorView: parseBellClashSpectatorView,
  assertInvariants: assertBellClashInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: BellClashConfig) {
    const parsedConfig = parseBellClashConfig(config);
    const deck = ctx.random.shuffle(buildDeck(ctx.random));
    const hands: Record<string, BellClashCard[]> = {};
    for (const id of players) {
      hands[id] = [];
      for (let i = 0; i < parsedConfig.handSize; i += 1) {
        hands[id]!.push(deck.pop()!);
      }
    }
    // 首张弃牌顶：从剩余牌堆取一张（保证开局可接）
    let discardTop = deck.pop() ?? null;
    // 若首张是短语卡，重新换一张数字卡（避免开局即按铃窗口）
    if (discardTop && discardTop.kind === 'phrase') {
      const numberIndex = deck.findIndex((card) => card.kind === 'number');
      if (numberIndex >= 0) {
        deck.push(discardTop);
        discardTop = deck.splice(numberIndex, 1)[0]!;
      }
    }
    const state = createBellClashState(players, config, deck, hands, discardTop);
    assertBellClashInvariants(state);
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
    const reduced = reduceBellClashState(state, action, { now: _ctx.now });
    if (!reduced.ok) return reduced;
    assertBellClashInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: reduced.effects,
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildBellClashPlayerView,
  getSpectatorView: buildBellClashSpectatorView,
  pickBotAction(input) {
    return pickBellClashBotAction(input);
  },
};
