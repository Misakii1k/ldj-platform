/**
 * werewolf_platform_open_kill_v1 — GameModuleV2 装配。
 * identity engine 2 / ruleset open_kill / view 1；snapshotMigrations 空（schema v1）。
 * 未注册平台 registry（按批次裁决，见 D4-V 报告），纯模块直连测试。
 */
import type { GameModuleV2 } from '@ldj/shared';
import type { V2Action, V2Config, V2Event, V2PlayerView, V2PublicView, V2Result, V2State } from './types.ts';
import {
  assertV2Invariants,
  buildV2PlayerView,
  buildV2PublicView,
  createV2InitialState,
  parseV2Action,
  parseV2State,
  reduceV2,
} from './rules.ts';
import { v2ConfigSchema, v2PlayerViewSchema, v2PublicViewSchema } from './schemas.ts';
import { buildV2BotPrompt } from './botPrompt.ts';
import { pickV2BotAction } from './bot.ts';
import { wrapV2WithJudgeVoice } from '../judgeVoiceWrapper.ts';

export const WEREWOLF_V2_IDENTITY = { engineContractVersion: 2, rulesetId: 'werewolf_platform_open_kill_v1', viewVersion: 1 } as const;

const rawWerewolfV2Module: GameModuleV2<V2Config, V2State, V2Action, V2PlayerView, V2PublicView, V2Event, V2Result> = {
  manifest: { id: 'werewolf', version: '0.2.0', displayName: '狼人杀', minPlayers: 6, maxPlayers: 12, stateSchemaVersion: 1 },
  identity: WEREWOLF_V2_IDENTITY,
  registeredRulesets: ['werewolf_platform_open_kill_v1'],
  defaultRulesetId: 'werewolf_platform_open_kill_v1',
  parseConfig: (input) => v2ConfigSchema.parse(input ?? {}),
  parseAction: parseV2Action,
  parseState: parseV2State,
  parsePlayerView: (input) => v2PlayerViewSchema.parse(input),
  parseSpectatorView: (input) => v2PublicViewSchema.parse(input),
  assertInvariants: assertV2Invariants,
  snapshotMigrations: {},
  createInitialState: createV2InitialState,
  reduce: reduceV2,
  getPlayerView: buildV2PlayerView,
  getSpectatorView: buildV2PublicView,
  pickBotAction: pickV2BotAction,
  buildBotPrompt: buildV2BotPrompt,
};

export const werewolfV2Module = wrapV2WithJudgeVoice(rawWerewolfV2Module);
