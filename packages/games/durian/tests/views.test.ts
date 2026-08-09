import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { durianModule } from '../server/module.ts';

const players = ['a', 'b', 'c'];

function initial() {
  const ctx = deterministicContext();
  return durianModule.createInitialState(ctx, players, durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));
}

test('Durian 视图严格解析：build→parse 往返一致且不泄漏本人与中央库存', () => {
  const state = initial();
  for (const id of players) {
    const view = durianModule.getPlayerView(state, id);
    assert.deepEqual(durianModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
    assert.equal(JSON.stringify(view).includes(state.playerInventory[id]!.id), false);
    assert.equal(JSON.stringify(view).includes(state.centralInventory.id), false);
  }
  const spectator = durianModule.getSpectatorView(state);
  assert.deepEqual(durianModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('Durian 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = durianModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => durianModule.parsePlayerView({ ...playerView, stock: {} }), /字段无效/);
  const spectator = durianModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => durianModule.parseSpectatorView({ ...spectator, inventory: [] }), /字段无效/);
});
