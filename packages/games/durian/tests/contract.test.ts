import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { durianModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
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

test('Durian 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(durianModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(durianModule, ctx, ['a', 'b', 'c'], { rulesetId: 'durian_orchard_v1' });
  const state = durianModule.createInitialState(ctx, ['a', 'b', 'c'], durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));
  versionedContractAssertions.viewSchemas(durianModule, state, ['a', 'b', 'c']);
});

test('Durian 契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(durianModule, 'durian-contract', ['a', 'b'], config, steps);
  versionedContractAssertions.snapshotReplayable(durianModule, 'durian-contract', ['a', 'b'], config, steps);
});
