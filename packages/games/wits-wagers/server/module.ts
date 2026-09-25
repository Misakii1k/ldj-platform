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
import type { BetPair } from './board.ts';
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
  // questionIndex / voidedRounds 是"作废重抽"一起加进来的字段。
  // 旧存档里题目下标恒等于 round-1（那时不存在作废），据此回填。
  state.questionIndex ??= Math.max(0, (state.round ?? 1) - 1);
  state.voidedRounds ??= 0;
  stripRemovedHigherTarget(state);
  assertInvariants(state);
  return state;
}

/**
 * 「更高」边缘卡已从规则中移除。旧存档里版图右端还带着这张卡，
 * 押在上面的筹码也失去了目标；这里把两者一起清掉，否则不变量会拒绝恢复整局。
 * 历史轮次照样清理，保证回放视角与现行规则一致。
 */
function stripRemovedHigherTarget(state: WitsWagersState): void {
  const isHigher = (t: { id: string }) => t.id === 'higher';
  const cleanBets = (bets: Record<string, BetPair> | undefined) => {
    if (!bets) return;
    for (const pair of Object.values(bets)) {
      for (const chip of pair) {
        if ((chip.targetId as string) === 'higher') {
          chip.targetId = null;
          chip.extraStake = 0;
        }
      }
    }
  };
  if (Array.isArray(state.board)) {
    state.board = state.board.filter((t) => !isHigher(t));
  }
  cleanBets(state.bets);
  for (const h of state.history ?? []) {
    if (Array.isArray(h.board)) h.board = h.board.filter((t) => !isHigher(t));
    h.winningTargetIds = (h.winningTargetIds ?? []).filter((id) => (id as string) !== 'higher');
    cleanBets(h.bets);
  }
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
