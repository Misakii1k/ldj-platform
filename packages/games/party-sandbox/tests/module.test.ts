import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { partySandboxModule } from '../server/module.ts';
import { PARTY_SANDBOX_MANIFEST } from '../shared/manifest.ts';

const config = { rulesetId: 'party_sandbox_v1' };
const players = ['alice', 'bob', 'charlie'];

function initial() {
  const ctx = deterministicContext();
  return partySandboxModule.createInitialState(
    ctx,
    players,
    partySandboxModule.parseConfig(config),
  );
}

test('创意工坊 manifest shape 与模块身份一致', () => {
  assert.equal(PARTY_SANDBOX_MANIFEST.id, 'party-sandbox');
  assert.equal(PARTY_SANDBOX_MANIFEST.rulesets.includes('party_sandbox_v1'), true);
  assert.equal(partySandboxModule.identity.rulesetId, 'party_sandbox_v1');
  assert.equal(partySandboxModule.manifest.id, 'party-sandbox');
});

test('创意工坊 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  const state = partySandboxModule.createInitialState(ctx, players, partySandboxModule.parseConfig(config));
  assert.equal(state.phase, 'sandbox');
  assert.equal(state.players.length, 3);

  const parsedPlayer = partySandboxModule.parsePlayerView(
    partySandboxModule.getPlayerView(state, 'alice'),
  );
  assert.equal(parsedPlayer.me?.playerId, 'alice');
  assert.equal(parsedPlayer.props['prop_revolver_1']?.kind, 'revolver');

  const parsedPublic = partySandboxModule.parseSpectatorView(
    partySandboxModule.getSpectatorView(state),
  );
  assert.equal(parsedPublic.players.length, 3);
});

test('创意工坊 授权校验：玩家可发起操作道具，不可冒充他人', () => {
  const ctx = deterministicContext();
  const state = initial();
  const playerActor = { kind: 'player' as const, playerId: 'alice' };
  const okAuth = partySandboxModule.reduce(ctx, state, playerActor, {
    type: 'operate_bell',
    playerId: 'alice',
    propId: 'prop_bell_1',
    subAction: 'ring',
  });
  assert.equal(okAuth.ok, true);

  const fakeAuth = partySandboxModule.reduce(ctx, state, playerActor, {
    type: 'operate_bell',
    playerId: 'bob',
    propId: 'prop_bell_1',
    subAction: 'ring',
  });
  assert.equal(fakeAuth.ok, false);
});
