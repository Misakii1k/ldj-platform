import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { loveLetterModule } from '../server/module.ts';
import { buildLoveLetterDeck } from '../server/rules.ts';
import type { LoveLetterCard, LoveLetterRole } from '../server/types.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });

function deckWith(prefix: LoveLetterRole[]): LoveLetterCard[] {
  const remaining = buildLoveLetterDeck();
  const selected = prefix.map((role) => {
    const index = remaining.findIndex((card) => card.role === role);
    assert.notEqual(index, -1, `缺少角色 ${role}`);
    return remaining.splice(index, 1)[0]!;
  });
  return [...selected, ...remaining];
}

const winningDeck = deckWith(['guard', 'guard', 'guard', 'princess', 'priest']);
const config = {
  rulesetId: 'loveletter_classic16_v1',
  deckOrder: winningDeck,
  futureDeckOrders: Array.from({ length: 6 }, () => structuredClone(winningDeck)),
};
const steps = Array.from({ length: 7 }, () => ({
  actor: actor('a'),
  action: { type: 'play_card' as const, playerId: 'a', cardId: 'guard-3', targetPlayerId: 'b', guessedRole: 'princess' },
}));

test('情书契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(loveLetterModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(loveLetterModule, ctx, ['a', 'b'], { rulesetId: 'loveletter_classic16_v1' });
  const state = loveLetterModule.createInitialState(ctx, ['a', 'b'], loveLetterModule.parseConfig({ rulesetId: 'loveletter_classic16_v1' }));
  versionedContractAssertions.viewSchemas(loveLetterModule, state, ['a', 'b']);
});

test('情书契约套件：无秘密泄漏（手牌只属于本人）', () => {
  const state = loveLetterModule.createInitialState(
    deterministicContext(),
    ['a', 'b'],
    loveLetterModule.parseConfig({ rulesetId: 'loveletter_classic16_v1' }),
  );
  versionedContractAssertions.noSecretLeak(
    loveLetterModule,
    state,
    ['a', 'b'],
    (current, playerId) => {
      const hands = (current as { hands: Record<string, LoveLetterCard[]> }).hands;
      return hands[playerId]!.map((card) => card.id);
    },
  );
});

test('情书契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(loveLetterModule, 'loveletter-contract', ['a', 'b'], config, steps);
  versionedContractAssertions.snapshotReplayable(loveLetterModule, 'loveletter-contract', ['a', 'b'], config, steps);
});
