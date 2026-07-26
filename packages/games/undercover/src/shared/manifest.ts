import type { GameManifest } from '@lan-party/shared';

export const undercoverManifest = {
  id: 'undercover',
  version: '0.2.0-alpha.2',
  displayName: '谁是卧底',
  minPlayers: 4,
  maxPlayers: 12,
  stateSchemaVersion: 1,
} as const satisfies GameManifest;

export type { GameManifest } from '@lan-party/shared';
