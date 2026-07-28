import test from 'node:test';
import assert from 'node:assert/strict';
import { UNO_MANIFEST } from '../shared/manifest.ts';

test('UNO manifest shape', () => {
  assert.equal(UNO_MANIFEST.id, 'uno');
  assert.equal(UNO_MANIFEST.displayName, 'UNO');
  assert.equal(UNO_MANIFEST.stateSchemaVersion, 1);
});
