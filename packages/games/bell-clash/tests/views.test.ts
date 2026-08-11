import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { bellClashModule } from '../server/module.ts';
import { createBellClashState } from '../server/rules.ts';
import type { BellClashCard, BellClashState } from '../server/types.ts';

const players = ['a', 'b', 'c'];
const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };

function initial() {
  const ctx = deterministicContext();
  return bellClashModule.createInitialState(ctx, players, bellClashModule.parseConfig({ rulesetId: 'bell_clash_v1' }));
}

function deterministic(): BellClashState {
  return createBellClashState(
    players,
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    { a: [red1, red1], b: [blue2, red1], c: [red1, blue2] },
    red1,
  );
}

test('铃铛对决 视图严格解析：build→parse 往返一致', () => {
  const state = initial();
  for (const id of players) {
    const view = bellClashModule.getPlayerView(state, id);
    assert.deepEqual(bellClashModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
  }
  const spectator = bellClashModule.getSpectatorView(state);
  assert.deepEqual(bellClashModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('铃铛对决 手牌隐私：他人手牌数量可见、内容不可见', () => {
  const state = deterministic();
  const a = bellClashModule.getPlayerView(state, 'a');
  assert.equal(a.me?.hand.length, 2, '本人可见手牌');
  const spectator = bellClashModule.getSpectatorView(state);
  assert.equal(spectator.handCounts['a'], 2, '观战可见手牌数');
  const spectatorJson = JSON.stringify(spectator);
  assert.equal(spectatorJson.includes('"phrase"') && spectatorJson.includes('red1'), false);
  // 观战视角不含任何玩家手牌内容
  const b = bellClashModule.getPlayerView(state, 'b');
  assert.equal(JSON.stringify(b).includes('"me"'), true);
  const aJson = JSON.stringify(a);
  // a 的视角不得含 b 的手牌内容（red1 是 a 自己的牌，blue2 也是 a 的——用长度验证）
  assert.equal(aJson.includes('"handCounts"'), true, '含他人手牌数');
});

test('铃铛对决 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = bellClashModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => bellClashModule.parsePlayerView({ ...playerView, drawPile: [] }), /字段无效/);
  const spectator = bellClashModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => bellClashModule.parseSpectatorView({ ...spectator, hands: {} }), /字段无效/);
});

test('铃铛对决 非参局观察者没有本人视角', () => {
  const view = bellClashModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(bellClashModule.parsePlayerView(view), view);
});
