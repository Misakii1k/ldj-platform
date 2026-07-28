/**
 * 谁是卧底游戏包 manifest（SPEC §8.5：GameManifest）。
 * shared/ 下仅放双端可共享的元数据；规则实现在 server/，不得进入客户端构建。
 */
import type { GameManifest } from '@ldj/shared';

export const UNDERCOVER_MANIFEST = {
  id: 'undercover',
  displayName: '谁是卧底',
  version: '0.1.0',
  minPlayers: 4,
  maxPlayers: 12,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

export type UndercoverManifest = typeof UNDERCOVER_MANIFEST;
