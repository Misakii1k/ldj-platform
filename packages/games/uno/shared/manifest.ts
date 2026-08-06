import type { GameManifest } from '@ldj/shared';

/**
 * UNO 游戏 manifest。
 * 当前仅作为待实现模块骨架存在，首页仍保持 coming_soon，避免半成品进入建房流程。
 */
const UNO_MANIFEST_BASE = {
  id: 'uno',
  displayName: 'UNO',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 6,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

/** 基础 manifest 之上追加规则集清单；整体仍结构兼容 GameManifest（多出的字段不影响赋值）。 */
export const UNO_MANIFEST = {
  ...UNO_MANIFEST_BASE,
  /** D4-F1/D4-U：该游戏声明的全部规则集（legacy 兼容基线 + 平台变体并行注册）。 */
  rulesets: ['uno_legacy_platform_v1', 'uno_platform_house_v1'],
} as const;

export type UnoManifest = typeof UNO_MANIFEST;
