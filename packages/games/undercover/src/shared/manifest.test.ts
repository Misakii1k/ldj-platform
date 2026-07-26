import { describe, expect, it } from 'vitest';

import { undercoverManifest } from './manifest.js';

describe('undercover manifest', () => {
  it('advertises the supported table size and snapshot schema', () => {
    expect(undercoverManifest).toEqual({
      id: 'undercover',
      version: '0.1.0',
      displayName: '谁是卧底',
      minPlayers: 4,
      maxPlayers: 12,
      stateSchemaVersion: 1,
    });
  });
});
