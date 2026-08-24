import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { partySandboxModule } from '../server/module.ts';
import { createDefaultDeck, createPartySandboxState } from '../server/rules.ts';

const players = ['alice', 'bob', 'charlie'];

test('创意工坊 视图严格解析：build->parse 往返一致', () => {
  const ctx = deterministicContext();
  const state = partySandboxModule.createInitialState(
    ctx,
    players,
    partySandboxModule.parseConfig({ rulesetId: 'party_sandbox_v1' }),
  );

  const playerView = partySandboxModule.getPlayerView(state, 'alice');
  const parsed = partySandboxModule.parsePlayerView(playerView);
  assert.equal(parsed.me?.playerId, 'alice');
  assert.equal(parsed.players.length, 3);
  assert.ok(parsed.props['prop_revolver_1']);

  const spectatorView = partySandboxModule.getSpectatorView(state);
  const parsedSpectator = partySandboxModule.parseSpectatorView(spectatorView);
  assert.equal(parsedSpectator.players.length, 3);
});

test('创意工坊 私有手牌隔离：他人手牌内容不可见，仅数量可见', () => {
  const deck = createDefaultDeck('deck_1', '测试卡牌', [
    { id: 'c1', title: '秘密卡 1', content: '绝密' },
    { id: 'c2', title: '秘密卡 2', content: '绝密' },
  ]);
  const state = createPartySandboxState(players, {}, [deck]);
  state.hands['alice'] = [{ id: 'c1', title: '秘密卡 1', content: '绝密' }];
  state.hands['bob'] = [{ id: 'c2', title: '秘密卡 2', content: '绝密' }];

  const aliceView = partySandboxModule.getPlayerView(state, 'alice');
  assert.equal(aliceView.myHand.length, 1);
  assert.equal(aliceView.myHand[0]?.title, '秘密卡 1');
  assert.equal(aliceView.playerHandCounts['bob'], 1);

  const bobView = partySandboxModule.getPlayerView(state, 'bob');
  assert.equal(bobView.myHand.length, 1);
  assert.equal(bobView.myHand[0]?.title, '秘密卡 2');
  assert.equal(bobView.playerHandCounts['alice'], 1);

  const spectatorView = partySandboxModule.getSpectatorView(state);
  const spectatorJson = JSON.stringify(spectatorView);
  assert.equal(spectatorJson.includes('myHand'), false, '观战视角不得包含私有手牌');
  assert.equal(spectatorView.playerHandCounts['alice'], 1);
});
