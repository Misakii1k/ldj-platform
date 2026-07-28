import type { GameManifest } from '@ldj/shared';

/**
 * 狼人杀 游戏 manifest。
 * 当前仅作为待实现模块骨架存在，首页仍保持 coming_soon，避免半成品进入建房流程。
 */
export const WEREWOLF_MANIFEST = {
  id: 'werewolf',
  displayName: '狼人杀',
  version: '0.1.0',
  minPlayers: 6,
  maxPlayers: 12,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

export type WerewolfManifest = typeof WEREWOLF_MANIFEST;
