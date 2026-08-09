import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { loveLetterModule } from '../server/module.ts';

const players = ['a', 'b'];

function initial() {
  const ctx = deterministicContext();
  return loveLetterModule.createInitialState(ctx, players, loveLetterModule.parseConfig({ rulesetId: 'loveletter_classic16_v1' }));
}

test('情书视图严格解析：build→parse 往返一致且只暴露本人手牌', () => {
  const state = initial();
  for (const id of players) {
    const view = loveLetterModule.getPlayerView(state, id);
    assert.deepEqual(loveLetterModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
    assert.deepEqual(view.me?.hand, state.hands[id]);
  }
  const spectator = loveLetterModule.getSpectatorView(state);
  assert.deepEqual(loveLetterModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
  // 手牌绝不进入他人/观战视角
  for (const card of state.hands.a!) {
    assert.equal(JSON.stringify(loveLetterModule.getPlayerView(state, 'b')).includes(card.id), false);
    assert.equal(JSON.stringify(spectator).includes(card.id), false);
  }
});

test('情书视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = loveLetterModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => loveLetterModule.parsePlayerView({ ...playerView, hands: state.hands }), /字段无效/);
  const spectator = loveLetterModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => loveLetterModule.parseSpectatorView({ ...spectator, inspections: [] }), /字段无效/);
});
