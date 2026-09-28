import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStartTransition, plateFor } from '../src/shared-ui/platformSkin.ts';

test('platformSkin: correctly maps all 12 known gameIds', () => {
  assert.equal(plateFor('werewolf').skin, 'dark');
  assert.equal(plateFor('werewolf').icon, '🐺');

  assert.equal(plateFor('undercover').skin, 'dark');
  assert.equal(plateFor('wits-wagers').skin, 'dark');
  assert.equal(plateFor('goose-relay').skin, 'dark');

  assert.equal(plateFor('cheese-thief').skin, 'light');
  assert.equal(plateFor('cheese-thief').icon, '🧀');

  assert.equal(plateFor('durian').skin, 'light');
  assert.equal(plateFor('loveletter').skin, 'light');
  assert.equal(plateFor('landlord').skin, 'light');
  assert.equal(plateFor('uno').skin, 'light');
  assert.equal(plateFor('bell-clash').skin, 'light');
  assert.equal(plateFor('echo-judge').skin, 'light');
  assert.equal(plateFor('night-testimony').skin, 'light');
});

test('platformSkin: falls back to default plate for unknown or null gameId', () => {
  assert.deepEqual(plateFor(null), {
    skin: 'light',
    icon: '🎲',
    bars: ['#f7c84b', '#08715d', '#c23616', '#7358a7'],
  });
  assert.deepEqual(plateFor('unknown-game'), {
    skin: 'light',
    icon: '🎲',
    bars: ['#f7c84b', '#08715d', '#c23616', '#7358a7'],
  });
});

test('platformSkin: randomly selects transitions based on provided random generator', () => {
  assert.equal(pickStartTransition(() => 0), 'sheet');
  assert.equal(pickStartTransition(() => 0.33), 'sheet');
  assert.equal(pickStartTransition(() => 0.34), 'curtain');
  assert.equal(pickStartTransition(() => 0.5), 'curtain');
  assert.equal(pickStartTransition(() => 0.66), 'curtain');
  assert.equal(pickStartTransition(() => 0.67), 'stripes');
  assert.equal(pickStartTransition(() => 0.999), 'stripes');
});
