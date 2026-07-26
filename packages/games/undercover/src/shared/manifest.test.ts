import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as packageRoot from '../index.js';
import { undercoverManifest } from './manifest.js';

describe('undercover manifest', () => {
  it('advertises the supported table size and snapshot schema', () => {
    expect(undercoverManifest).toEqual({
      id: 'undercover',
      version: '0.2.0-alpha.2',
      displayName: '谁是卧底',
      minPlayers: 4,
      maxPlayers: 12,
      stateSchemaVersion: 1,
    });
  });

  it('keeps the package root limited to the browser-safe shared surface', () => {
    expect(Object.keys(packageRoot).sort()).toEqual([
      'UndercoverConfigSchema',
      'parseUndercoverConfig',
      'undercoverManifest',
    ]);
    expect(packageRoot).not.toHaveProperty('createUndercoverModule');
    expect(packageRoot).not.toHaveProperty('UndercoverStateSchema');

    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      exports: Record<string, { types: string; default: string }>;
    };
    expect(packageJson.exports).toMatchObject({
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './shared': { types: './dist/shared/index.d.ts', default: './dist/shared/index.js' },
      './server': { types: './dist/server/index.d.ts', default: './dist/server/index.js' },
    });
  });
});
