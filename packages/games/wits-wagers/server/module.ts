import type { GameModuleV2 } from '@ldj/shared';
import { WITS_WAGERS_MANIFEST } from '../shared/manifest.ts';
import { parseConfig, parseAction } from './schemas.ts';
import { assertInvariants } from './invariants.ts';
import { createInitialState, DEFAULT_RESOLVED_CONFIG } from './state.ts';
import { reduce } from './reducer.ts';
import {
  buildPlayerView,
  buildSpectatorView,
  parsePlayerView,
  parseSpectatorView,
} from './views.ts';
import type {
  WitsWagersConfig,
  WitsWagersState,
  WitsWagersAction,
  WitsWagersPublicEvent,
  FinalResult,
} from './types.ts';
import type { WitsWagersPlayerView, WitsWagersSpectatorView } from './views.ts';
import { pickWitsWagersBotAction } from './bot.ts';
import { buildWitsWagersBotPrompt } from './botPrompt.ts';

export const WITS_WAGERS_VERSIONED_IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: 'wits_wagers_platform_v1',
  viewVersion: 1,
} as const;

function parseState(input: unknown): WitsWagersState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('WitsWagers 状态必须是对象');
  }
  const state = structuredClone(input) as WitsWagersState;
  // 阶段展示时长是后加入的配置项，旧存档缺失时回填默认值，
  // 否则恢复后的 arranging/settlement 计时会算出 NaN 并卡死阶段推进。
  if (state.config) {
    state.config.arrangingSeconds ??= DEFAULT_RESOLVED_CONFIG.arrangingSeconds;
    state.config.settlementSeconds ??= DEFAULT_RESOLVED_CONFIG.settlementSeconds;
  }
  assertInvariants(state);
  return state;
}

export const witsWagersModule: GameModuleV2<
  WitsWagersConfig,
  WitsWagersState,
  WitsWagersAction,
  WitsWagersPlayerView,
  WitsWagersSpectatorView,
  WitsWagersPublicEvent,
  FinalResult
> = {
  manifest: WITS_WAGERS_MANIFEST,
  identity: WITS_WAGERS_VERSIONED_IDENTITY,
  registeredRulesets: ['wits_wagers_platform_v1'],
  defaultRulesetId: 'wits_wagers_platform_v1',
  parseConfig: (input) => parseConfig(input ?? {}),
  parseAction,
  parseState,
  parsePlayerView,
  parseSpectatorView,
  assertInvariants,
  snapshotMigrations: {},
  createInitialState: (ctx, players, config) => createInitialState(ctx, players, config),
  reduce,
  getPlayerView: buildPlayerView,
  getSpectatorView: buildSpectatorView,
  pickBotAction(input) {
    return pickWitsWagersBotAction(input);
  },
  buildBotPrompt(input) {
    return buildWitsWagersBotPrompt(input);
  },
};
