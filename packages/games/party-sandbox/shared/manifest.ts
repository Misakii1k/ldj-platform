import type { GameManifest } from '@ldj/shared';

export const PARTY_SANDBOX_MANIFEST = {
  id: 'party-sandbox',
  displayName: '创意工坊',
  version: '0.1.0',
  minPlayers: 2,
  maxPlayers: 12,
  stateSchemaVersion: 1,
  rulesets: ['party_sandbox_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type PartySandboxManifest = typeof PARTY_SANDBOX_MANIFEST;
