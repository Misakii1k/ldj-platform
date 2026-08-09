import type { GameManifest } from '@ldj/shared';

export const LOVELETTER_MANIFEST = {
  id: 'loveletter',
  displayName: '情书：密函心意',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 4,
  stateSchemaVersion: 1,
  rulesets: ['loveletter_classic16_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type LoveLetterManifest = typeof LOVELETTER_MANIFEST;
