import type { GameManifest } from '@ldj/shared';

export const NIGHT_TESTIMONY_MANIFEST = {
  id: 'night-testimony',
  displayName: '囚徒之夜',
  version: '0.1.0',
  minPlayers: 3,
  maxPlayers: 6,
  stateSchemaVersion: 1,
  rulesets: ['night_testimony_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type NightTestimonyManifest = typeof NIGHT_TESTIMONY_MANIFEST;
