import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldStartGamePhaseTransition,
} from '../src/shared-ui/GameMotion.tsx';

test('game motion phase keys are idempotent across repeated renders', () => {
  assert.equal(shouldStartGamePhaseTransition(null, 'night'), true);
  assert.equal(shouldStartGamePhaseTransition('night', 'night'), false);
  assert.equal(shouldStartGamePhaseTransition('night', 'day'), true);
  assert.equal(shouldStartGamePhaseTransition(1, 1), false);
  assert.equal(shouldStartGamePhaseTransition(1, 2), true);
});

test('game motion level uses the expected data attribute contract', async () => {
  const { GameMotionRoot } = await import('../src/shared-ui/GameMotion.tsx');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');

  const markup = renderToStaticMarkup(
    createElement(GameMotionRoot, { level: 'minimal' }, 'game'),
  );

  assert.match(markup, /class="game-motion-root"/);
  assert.match(markup, /data-motion-level="minimal"/);
});
