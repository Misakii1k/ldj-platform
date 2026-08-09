import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { durianModule } from '../server/module.ts';
import { DURIAN_MANIFEST } from '../shared/manifest.ts';

const players = ['a', 'b', 'c'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });

function initial(ctx: GameContext = deterministicContext()) {
  return durianModule.createInitialState(ctx, players, durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));
}

test('Durian V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(durianModule);
  versionedContractAssertions.initial(durianModule, ctx, players, { rulesetId: 'durian_orchard_v1' });
  versionedContractAssertions.viewSchemas(durianModule, initial(), players);
});

test('Durian reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'submit_order' as const, playerId: 'a', optionIndex: 0 as const };
  versionedContractAssertions.pure(durianModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(durianModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(durianModule, ctx, state, actor('b'), action);
});

test('Durian 本人库存反向隐藏，中央库存和权威库存不进入任何视图', () => {
  const state = initial();
  const player = durianModule.getPlayerView(state, 'a');
  const spectator = durianModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.equal(player.me?.ownInventoryHidden, true);
  assert.deepEqual(player.me?.visibleInventory.map((entry) => entry.playerId), ['b', 'c']);
  assert.equal(JSON.stringify(player).includes(state.playerInventory.a!.id), false);
  assert.equal(JSON.stringify(player).includes(state.playerInventory.b!.id), true);
  assert.equal(JSON.stringify(player).includes(state.centralInventory.id), false);
  for (const view of [player as unknown as Record<string, unknown>, spectator]) {
    assert.equal('inventory' in view, false);
    assert.equal('stock' in view, false);
    assert.equal('orderDeck' in view, false);
    assert.equal(JSON.stringify(view).includes(state.centralInventory.id), false);
  }
  assert.deepEqual(durianModule.parsePlayerView(player), player);
  assert.deepEqual(durianModule.parseSpectatorView(spectator), spectator);
});

test('Durian 2 至 7 人逐视角均隐藏本人和中央库存', () => {
  for (let count = 2; count <= 7; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `p${index}`);
    const ctx = deterministicContext();
    const state = durianModule.createInitialState(ctx, ids, durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));
    assert.equal(Object.keys(state.playerInventory).length, count);
    assert.equal(state.removedInventory.length, 27 - count);
    for (const playerId of ids) {
      const view = durianModule.getPlayerView(state, playerId);
      assert.equal(view.me?.visibleInventory.length, count - 1);
      assert.equal(JSON.stringify(view).includes(state.playerInventory[playerId]!.id), false);
      assert.equal(JSON.stringify(view).includes(state.centralInventory.id), false);
      for (const otherId of ids.filter((id) => id !== playerId)) {
        assert.equal(JSON.stringify(view).includes(state.playerInventory[otherId]!.id), true);
      }
    }
    const spectator = JSON.stringify(durianModule.getSpectatorView(state));
    assert.equal(spectator.includes(state.centralInventory.id), false);
    for (const playerId of ids) assert.equal(spectator.includes(state.playerInventory[playerId]!.id), false);
  }
});

test('Durian 终局动作返回正式结果候选', () => {
  const ctx = deterministicContext();
  const safeOrder = {
    id: 'safe',
    options: [
      { fruit: 'amber_pear' as const, quantity: 1 as const },
      { fruit: 'cloud_berry' as const, quantity: 1 as const },
    ] as const,
    staffEvent: 'mixed_crate' as const,
  };
  const state = durianModule.createInitialState(ctx, ['a', 'b'], durianModule.parseConfig({
    rulesetId: 'durian_orchard_v1',
    orderDeck: [safeOrder, { ...safeOrder, id: 'next' }],
  }));
  state.penalties.b = 6;
  const submitted = durianModule.reduce(ctx, state, actor('a'), { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const claimed = durianModule.reduce(ctx, submitted.nextState, actor('b'), { type: 'ring_bell', playerId: 'b' });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;
  const resolved = durianModule.reduce(ctx, claimed.nextState, actor('a'), { type: 'resolve_bell', playerId: 'a' });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.deepEqual(resolved.resultCandidate, { winners: ['a'], penalties: { a: 0, b: 7 } });
});

test('Durian 稳定完整轨迹结果 only-once 且快照可重放', () => {
  const safeOrder = (id: string) => ({
    id,
    options: [
      { fruit: 'amber_pear' as const, quantity: 1 as const },
      { fruit: 'cloud_berry' as const, quantity: 1 as const },
    ] as const,
    staffEvent: 'mixed_crate' as const,
  });
  const config = {
    rulesetId: 'durian_orchard_v1',
    orderDeck: ['one', 'two', 'three', 'four'].map(safeOrder),
  };
  const steps = [
    { actor: actor('a'), action: { type: 'submit_order', playerId: 'a', optionIndex: 0 } },
    { actor: actor('b'), action: { type: 'ring_bell', playerId: 'b' } },
    { actor: actor('a'), action: { type: 'resolve_bell', playerId: 'a' } },
    { actor: actor('b'), action: { type: 'submit_order', playerId: 'b', optionIndex: 0 } },
    { actor: actor('a'), action: { type: 'ring_bell', playerId: 'a' } },
    { actor: actor('b'), action: { type: 'resolve_bell', playerId: 'b' } },
    { actor: actor('a'), action: { type: 'submit_order', playerId: 'a', optionIndex: 0 } },
    { actor: actor('b'), action: { type: 'ring_bell', playerId: 'b' } },
    { actor: actor('a'), action: { type: 'resolve_bell', playerId: 'a' } },
    { actor: actor('b'), action: { type: 'submit_order', playerId: 'b', optionIndex: 0 } },
    { actor: actor('a'), action: { type: 'ring_bell', playerId: 'a' } },
    { actor: actor('b'), action: { type: 'resolve_bell', playerId: 'b' } },
  ] as const;
  versionedContractAssertions.resultOnlyOnce(durianModule, 'durian-replay', ['a', 'b'], config, steps);
  versionedContractAssertions.snapshotReplayable(durianModule, 'durian-replay', ['a', 'b'], config, steps);
});

test('Durian 首个按铃者经模块锁定，后续玩家不能覆盖', () => {
  const ctx = deterministicContext();
  const submitted = durianModule.reduce(ctx, initial(ctx), actor('a'), {
    type: 'submit_order', playerId: 'a', optionIndex: 0,
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const first = durianModule.reduce(ctx, submitted.nextState, actor('b'), { type: 'ring_bell', playerId: 'b' });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const late = durianModule.reduce(ctx, first.nextState, actor('c'), { type: 'ring_bell', playerId: 'c' });
  assert.equal(late.ok, false);
  assert.deepEqual(first.nextState.bell, { windowId: 'bell-1', status: 'locked', claimantId: 'b' });
});

test('Durian 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(durianModule.manifest.id, 'durian');
  assert.equal(durianModule.identity.rulesetId, durianModule.defaultRulesetId);
  assert.deepEqual(durianModule.registeredRulesets, DURIAN_MANIFEST.rulesets);
  assert.equal(durianModule.manifest.stateSchemaVersion, 1);
});

test('Durian 边界解析拒绝畸形快照和视图秘密字段', () => {
  const state = initial();
  const broken = structuredClone(state) as Partial<typeof state>;
  delete broken.centralInventory;
  assert.throws(() => durianModule.parseState(broken), /库存分区无效/);

  const playerView = durianModule.getPlayerView(state, 'a');
  assert.throws(
    () => durianModule.parsePlayerView({ ...playerView, stock: state.stock }),
    /字段无效/,
  );
  const spectatorView = durianModule.getSpectatorView(state);
  assert.throws(
    () => durianModule.parseSpectatorView({ ...spectatorView, centralInventory: state.centralInventory }),
    /字段无效/,
  );
});

test('Durian 非参局观察者没有本人库存视角', () => {
  const view = durianModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(durianModule.parsePlayerView(view), view);
});
