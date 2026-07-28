import type { GameManifest } from '@ldj/shared';

/**
 * 斗地主 游戏 manifest。
 * 当前仅作为待实现模块骨架存在，首页仍保持 coming_soon，避免半成品进入建房流程。
 */
export const LANDLORD_MANIFEST = {
  id: 'landlord',
  displayName: '斗地主',
  version: '0.1.0',
  minPlayers: 3,
  maxPlayers: 3,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

export type LandlordManifest = typeof LANDLORD_MANIFEST;
