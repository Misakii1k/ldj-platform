import type { GameManifest } from '@ldj/shared';

/**
 * 斗地主 游戏 manifest。
 * 基础 manifest 之上追加规则集清单；整体仍结构兼容 GameManifest。
 */
const LANDLORD_MANIFEST_BASE = {
  id: 'landlord',
  displayName: '斗地主',
  version: '0.1.0',
  minPlayers: 3,
  maxPlayers: 3,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

/** 基础 manifest 之上追加规则集清单；整体仍结构兼容 GameManifest（多出的字段不影响赋值）。 */
export const LANDLORD_MANIFEST = {
  ...LANDLORD_MANIFEST_BASE,
  /** D5 P2a：该游戏声明的全部规则集（legacy 兼容基线 + 平台变体并行注册）。 */
  rulesets: ['landlord_legacy_platform_v1', 'landlord_platform_v1'],
} as const;

export type LandlordManifest = typeof LANDLORD_MANIFEST;
