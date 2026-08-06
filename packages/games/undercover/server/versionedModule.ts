import {
  normalizeLegacyReduceResult,
  type GameModuleV2,
} from '@ldj/shared';
import { UNDERCOVER_MANIFEST } from '../shared/manifest.ts';
import { undercoverModule } from './module.ts';
import {
  undercoverActionSchema,
  undercoverConfigSchema,
  undercoverStateSchema,
  type UndercoverAction,
  type UndercoverConfig,
  type UndercoverEvent,
  type UndercoverResult,
  type UndercoverState,
} from './state.ts';
import {
  undercoverPlayerViewSchema,
  undercoverSpectatorViewSchema,
  type UndercoverPlayerView,
  type UndercoverSpectatorView,
} from './views.ts';

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}包含重复玩家`);
}

export function assertUndercoverInvariants(state: UndercoverState): void {
  const ids = Object.keys(state.players);
  if (ids.length < UNDERCOVER_MANIFEST.minPlayers || ids.length > UNDERCOVER_MANIFEST.maxPlayers) {
    throw new Error('卧底玩家数量不合法');
  }
  const seats = Object.values(state.players).map((player) => player.seat);
  if (new Set(seats).size !== seats.length) throw new Error('卧底席位必须唯一');
  const known = new Set(ids);
  for (const [label, references] of [
    ['发言顺序', state.speakingOrder],
    ['加赛候选', state.runoffCandidates],
    ['看词确认', state.confirmedPlayerIds],
  ] as const) {
    assertUnique(references, label);
    if (references.some((id) => !known.has(id))) throw new Error(`${label}引用未知玩家`);
  }
  if (state.roundFirstSpeaker !== null && !known.has(state.roundFirstSpeaker)) {
    throw new Error('首位发言者引用未知玩家');
  }
  for (const [voter, target] of Object.entries(state.votes)) {
    if (!known.has(voter) || !known.has(target)) throw new Error('选票引用未知玩家');
    if (voter === target) throw new Error('卧底规则不允许自投');
    if ((state.phase === 'voting' || state.phase === 'runoff_voting')
      && (!state.players[voter]!.alive || !state.players[target]!.alive)) {
      throw new Error('投票阶段选票必须属于存活玩家');
    }
  }
  if (state.phase === 'speaking') {
    const current = state.speakingOrder[state.currentSpeakerIndex];
    if (!current || !state.players[current]?.alive) throw new Error('当前发言者必须是存活玩家');
  }
  if (state.phase === 'game_over' && state.winner === null && !state.aborted) {
    throw new Error('正常终局必须有胜方');
  }
}

export const UNDERCOVER_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'undercover_classic_v1',
  viewVersion: 1,
};

export const undercoverVersionedModule: GameModuleV2<
  UndercoverConfig,
  UndercoverState,
  UndercoverAction,
  UndercoverPlayerView,
  UndercoverSpectatorView,
  UndercoverEvent,
  UndercoverResult
> = {
  manifest: UNDERCOVER_MANIFEST,
  identity: UNDERCOVER_VERSIONED_IDENTITY,
  registeredRulesets: ['undercover_classic_v1'],
  defaultRulesetId: 'undercover_classic_v1',
  parseConfig: input => undercoverConfigSchema.parse(input),
  parseAction: input => undercoverActionSchema.parse(input),
  parseState: input => undercoverStateSchema.parse(input),
  parsePlayerView: input => undercoverPlayerViewSchema.parse(input),
  parseSpectatorView: input => undercoverSpectatorViewSchema.parse(input),
  assertInvariants: assertUndercoverInvariants,
  snapshotMigrations: {},
  createInitialState(ctx, players, config) {
    const state = undercoverModule.createInitialState(ctx, players, config);
    assertUndercoverInvariants(state);
    return state;
  },
  reduce(ctx, state, actor, action) {
    const legacy = undercoverModule.reduce(ctx, state, actor, action);
    if (!legacy.ok) return legacy;
    assertUndercoverInvariants(legacy.state);
    return normalizeLegacyReduceResult(legacy, {
      resultCandidate: undercoverModule.getResult(legacy.state),
    });
  },
  getPlayerView(state, playerId) {
    return undercoverPlayerViewSchema.parse(undercoverModule.getPlayerView(state, playerId));
  },
  getSpectatorView(state) {
    return undercoverSpectatorViewSchema.parse(undercoverModule.getSpectatorView(state));
  },
  pickBotAction(input) {
    return undercoverModule.pickBotAction?.(input) ?? null;
  },
  buildBotPrompt(input) {
    return undercoverModule.buildBotPrompt?.(input) ?? null;
  },
};

// —— D4-B：白板规则集（undercover_blank_v1）并行注册 ——
export { blankModule, BLANK_VERSIONED_IDENTITY } from './blank/module.ts';
