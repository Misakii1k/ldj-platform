import type { GameManifest } from '@ldj/shared';

export const GOOSE_RELAY_MANIFEST = {
  id: 'goose-relay',
  displayName: '以鹅传鹅：鹅鹅密令',
  version: '0.2.0',
  minPlayers: 5,
  maxPlayers: 9,
  stateSchemaVersion: 1,
  rulesets: ['goose_relay_classic_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type GooseRelayManifest = typeof GOOSE_RELAY_MANIFEST;
