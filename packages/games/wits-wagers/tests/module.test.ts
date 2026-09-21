import test from 'node:test';
import assert from 'node:assert/strict';
import { witsWagersModule, WITS_WAGERS_VERSIONED_IDENTITY } from '../server/module.ts';
import type { GameContext } from '@ldj/shared';

function createMockCtx(now = 1000): GameContext {
  return {
    now,
    random: {
      nextInt: (min, _max) => min,
      shuffle: (items) => [...items],
    },
  };
}

test('module: V2 身份标识与元数据', () => {
  assert.equal(witsWagersModule.manifest.id, 'wits-wagers');
  assert.equal(witsWagersModule.manifest.minPlayers, 3);
  assert.equal(witsWagersModule.manifest.maxPlayers, 7);
  assert.equal(witsWagersModule.manifest.stateSchemaVersion, 1);

  assert.equal(witsWagersModule.identity.engineContractVersion, 2);
  assert.equal(witsWagersModule.identity.rulesetId, 'wits_wagers_platform_v1');
  assert.equal(witsWagersModule.identity.viewVersion, 1);
  assert.deepEqual(witsWagersModule.identity, WITS_WAGERS_VERSIONED_IDENTITY);

  assert.deepEqual(witsWagersModule.registeredRulesets, ['wits_wagers_platform_v1']);
  assert.equal(witsWagersModule.defaultRulesetId, 'wits_wagers_platform_v1');
  assert.deepEqual(witsWagersModule.snapshotMigrations, {});
});

test('module: 完整生命周期接口调用', () => {
  const ctx = createMockCtx();
  const config = witsWagersModule.parseConfig({ answerSeconds: 30, betSeconds: 60 });
  assert.equal(config.answerSeconds, 30);
  assert.equal(config.betSeconds, 60);

  const state = witsWagersModule.createInitialState(ctx, ['p1', 'p2', 'p3'], config);
  assert.doesNotThrow(() => witsWagersModule.assertInvariants(state));

  const parsedState = witsWagersModule.parseState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(parsedState, state);

  const beginAction = witsWagersModule.parseAction({ type: 'begin' });
  const reduceRes = witsWagersModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, beginAction);
  assert.ok(reduceRes.ok);

  const nextState = reduceRes.nextState;
  const playerView = witsWagersModule.getPlayerView(nextState, 'p1');
  const parsedPlayerView = witsWagersModule.parsePlayerView(playerView);
  assert.equal(parsedPlayerView.phase, 'answering');

  const spectatorView = witsWagersModule.getSpectatorView(nextState);
  const parsedSpectatorView = witsWagersModule.parseSpectatorView(spectatorView);
  assert.equal(parsedSpectatorView.phase, 'answering');
  assert.equal('me' in parsedSpectatorView, false);
});
