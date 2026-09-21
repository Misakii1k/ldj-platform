import type { GameManifest } from '@ldj/shared';

/**
 * 一智千金（wits_wagers_platform_v1）静态身份。
 *
 * 平台适配版：规则主线来自用户，平局与超时处理经 G0 确认，不是官方逐条复刻。
 * 本文件必须保持纯常量——它同时被服务端 registry 与构建边界审计读取，
 * 不得导入 server 目录，也不得夹带题库、标准答案或任何权威状态。
 */
export const WITS_WAGERS_MANIFEST = {
  id: 'wits-wagers',
  displayName: '一智千金',
  version: '0.1.0',
  // G0 P5：3–7 席位，每席位一个提交身份，小队共用一台设备。
  minPlayers: 3,
  maxPlayers: 7,
  stateSchemaVersion: 1,
  rulesets: ['wits_wagers_platform_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type WitsWagersManifest = typeof WITS_WAGERS_MANIFEST;

export const WITS_WAGERS_RULESET_ID = 'wits_wagers_platform_v1' as const;

/** 视角版本；与 client viewRegistry 的路由键共同冻结。 */
export const WITS_WAGERS_VIEW_VERSION = 1 as const;

/** client/src/game/viewRegistry.ts 的 REGISTRY 键：`${gameId}:${rulesetId}:${viewVersion}`。 */
export const WITS_WAGERS_VIEW_KEY = 'wits-wagers:wits_wagers_platform_v1:1' as const;

/** 固定七轮，不可配置。 */
export const WITS_WAGERS_TOTAL_ROUNDS = 7 as const;
