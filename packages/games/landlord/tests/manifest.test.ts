import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDLORD_MANIFEST } from '../shared/manifest.ts';

test('斗地主 manifest shape', () => {
  assert.equal(LANDLORD_MANIFEST.id, 'landlord');
  assert.equal(LANDLORD_MANIFEST.displayName, '斗地主');
  assert.equal(LANDLORD_MANIFEST.stateSchemaVersion, 1);
});
