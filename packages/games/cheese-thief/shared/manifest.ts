import type { GameManifest } from '@ldj/shared';

export const CHEESE_THIEF_MANIFEST = {
  id: 'cheese-thief',
  displayName: '奶酪大盗',
  version: '0.1.0',
  minPlayers: 4,
  maxPlayers: 8,
  stateSchemaVersion: 1,
  rulesets: ['cheese_thief_classic_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type CheeseThiefManifest = typeof CHEESE_THIEF_MANIFEST;
