import type { GameManifest } from '@ldj/shared';

export const BELL_CLASH_MANIFEST = {
  id: 'bell-clash',
  displayName: 'Ding',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 7,
  stateSchemaVersion: 1,
  rulesets: ['bell_clash_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type BellClashManifest = typeof BELL_CLASH_MANIFEST;
