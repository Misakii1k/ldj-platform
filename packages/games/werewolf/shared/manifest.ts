import type { GameManifest } from '@ldj/shared';

/**
 * 狼人杀 游戏 manifest。
 * v4 服务端状态机：身份确认、扩展角色、完整昼夜流程、可配置夜刀范围、计时兜底与终局复盘。
 */
export const WEREWOLF_MANIFEST = {
  id: 'werewolf',
  displayName: '狼人杀',
  version: '0.4.0',
  minPlayers: 6,
  maxPlayers: 12,
  stateSchemaVersion: 5,
} as const satisfies GameManifest;

export type WerewolfManifest = typeof WEREWOLF_MANIFEST;
