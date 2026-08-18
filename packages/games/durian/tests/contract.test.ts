import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { durianModule } from '../server/module.ts';
import type { FruitCard } from '../server/types.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const fruitCard = (id: string): FruitCard => ({
  id,
  kind: 'fruit',
  left: { fruit: 'durian', quantity: 3 },
  right: { fruit: 'durian', quantity: 3 },
});

const config = {
  rulesetId: 'durian_orchard_v1' as const,
  maxRounds: 1,
  customDeck: ['c1', 'c2', 'c3', 'c4', 'c5'].map(fruitCard),
};

const steps = [
  { actor: actor('a'), action: { type: 'draw_card' as const, playerId: 'a' } },
  { actor: actor('a'), action: { type: 'place_fruit' as const, playerId: 'a', checkHalf: 'left' as const } },
  { actor: actor('b'), action: { type: 'challenge' as const, playerId: 'b' } },
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
