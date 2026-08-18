import type { Actor, GameContext, GameModuleV2 } from '@ldj/shared';
import { LOVELETTER_MANIFEST } from '../shared/manifest.ts';
import { parseLoveLetterAction, parseLoveLetterConfig } from './schemas.ts';
import {
  affectionTarget,
  assertLoveLetterInvariants,
  buildLoveLetterDeck,
  createLoveLetterState,
  reduceLoveLetterState,
} from './rules.ts';
import {
  buildLoveLetterPlayerView,
  buildLoveLetterSpectatorView,
  parseLoveLetterPlayerView,
  parseLoveLetterSpectatorView,
} from './views.ts';
import type {
  LoveLetterAction,
  LoveLetterConfig,
  LoveLetterEvent,
  LoveLetterPlayerView,
  LoveLetterPublicView,
  LoveLetterResult,
  LoveLetterState,
} from './types.ts';

export const LOVELETTER_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'loveletter_classic16_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): LoveLetterState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('情书状态必须是对象');
  const state = structuredClone(input) as LoveLetterState;
  assertLoveLetterInvariants(state);
  return state;
}

function playerMatches(actor: Actor, action: LoveLetterAction): boolean {
  return actor.kind === 'player' && 'playerId' in action && actor.playerId === action.playerId;
}

function result(state: LoveLetterState): LoveLetterResult | null {
  return state.phase === 'game_over'
    ? { winners: [...state.winners], affection: { ...state.affection } }
    : null;
}

function shuffledDeck(ctx: GameContext) {
  return ctx.random.shuffle(buildLoveLetterDeck());
}

export const loveLetterModule: GameModuleV2<
  LoveLetterConfig,
  LoveLetterState,
  LoveLetterAction,
  LoveLetterPlayerView,
  LoveLetterPublicView,
  LoveLetterEvent,
  LoveLetterResult
> = {
  manifest: LOVELETTER_MANIFEST,
  identity: LOVELETTER_VERSIONED_IDENTITY,
  registeredRulesets: ['loveletter_classic16_v1'],
  defaultRulesetId: 'loveletter_classic16_v1',
  parseConfig: (input) => parseLoveLetterConfig(input ?? {}),
  parseAction: parseLoveLetterAction,
  parseState,
  parsePlayerView: parseLoveLetterPlayerView,
  parseSpectatorView: parseLoveLetterSpectatorView,
  assertInvariants: assertLoveLetterInvariants,
  snapshotMigrations: {},
  createInitialState(ctx: GameContext, players: string[], config: LoveLetterConfig) {
    const futureCount = affectionTarget(players.length) * players.length;
    const deckOrder = config.deckOrder ?? shuffledDeck(ctx);
    const futureDeckOrders = config.futureDeckOrders
      ?? Array.from({ length: futureCount }, () => shuffledDeck(ctx));
    const state = createLoveLetterState(players, {
      rulesetId: 'loveletter_classic16_v1',
      deckOrder,
      futureDeckOrders,
    });
    assertLoveLetterInvariants(state);
    return state;
  },
  reduce(_ctx, state, actor, action) {
    // 平台开局 begin 为系统动作（无 playerId），不参与玩家身份匹配。
    if (action.type !== 'begin' && !playerMatches(actor, action)) {
      return { ok: false, code: 'ACTION_NOT_ALLOWED', message: '动作玩家与连接身份不一致' };
    }
    const reduced = reduceLoveLetterState(state, action);
    if (!reduced.ok) return reduced;
    assertLoveLetterInvariants(reduced.nextState);
    return {
      ok: true,
      nextState: reduced.nextState,
      publicEvents: reduced.events,
      privateEvents: [],
      effects: [],
      resultCandidate: result(reduced.nextState),
    };
  },
  getPlayerView: buildLoveLetterPlayerView,
  getSpectatorView: buildLoveLetterSpectatorView,
  pickBotAction(input) {
    const { view, playerId, random } = input;
    if (view.phase !== 'playing' || view.currentPlayerId !== playerId || !view.me?.hand || view.me.hand.length === 0) {
      return null;
    }
    const hand = view.me.hand;
    const hasCountess = hand.some((c) => c.role === 'countess');
    const hasPrinceOrKing = hand.some((c) => c.role === 'prince' || c.role === 'king');
    let playable = hand;
    if (hasCountess && hasPrinceOrKing) {
      playable = hand.filter((c) => c.role === 'countess');
    }
    const card = playable[0] ?? hand[0];
    if (!card) return null;
    const otherPlayerIds = view.players
      .map((p) => p.playerId)
      .filter((id) => id !== playerId && !view.eliminatedPlayers.includes(id) && !view.protectedPlayers.includes(id));
    let targetPlayerId: string | undefined;
    let guessedRole: any;
    if (['guard', 'priest', 'baron', 'king'].includes(card.role)) {
      if (otherPlayerIds.length > 0) {
        targetPlayerId = otherPlayerIds[random.nextInt(0, otherPlayerIds.length)];
      }
    } else if (card.role === 'prince') {
      targetPlayerId = otherPlayerIds.length > 0 ? otherPlayerIds[0] : playerId;
    }
    if (card.role === 'guard' && targetPlayerId) {
      const candidateRoles = ['priest', 'baron', 'handmaid', 'prince', 'king', 'countess', 'princess'];
      guessedRole = candidateRoles[random.nextInt(0, candidateRoles.length)] as any;
    }
    return {
      type: 'play_card',
      playerId,
      cardId: card.id,
      targetPlayerId,
      guessedRole,
    };
  },
};
