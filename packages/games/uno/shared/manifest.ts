import type { GameManifest } from '@ldj/shared';

/**
 * UNO 游戏 manifest。
 * 当前仅作为待实现模块骨架存在，首页仍保持 coming_soon，避免半成品进入建房流程。
 */
export const UNO_MANIFEST = {
  id: 'uno',
  displayName: 'UNO',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 6,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

export type UnoManifest = typeof UNO_MANIFEST;
