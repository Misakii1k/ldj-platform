import type { GameManifest } from '@ldj/shared';

export const DURIAN_MANIFEST = {
  id: 'durian',
  displayName: 'During',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 7,
  stateSchemaVersion: 1,
  rulesets: ['durian_orchard_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type DurianManifest = typeof DURIAN_MANIFEST;
