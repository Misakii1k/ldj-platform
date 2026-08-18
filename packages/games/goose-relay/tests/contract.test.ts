import test from 'node:test';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };

const config = { rulesetId: 'goose_relay_classic_v1' };
const players = ['a', 'b', 'c', 'd', 'e'];

/**
 * 完整局：begin → 抢头鹅 → 选卡超时 → 表演接力 → 讨论 → 指认超时 → 投票结算
 */
const steps = [
  { actor: sys, action: { type: 'begin' } },
  { actor: actor('a'), action: { type: 'claim_head', playerId: 'a' } },
  { actor: sys, action: { type: 'pick_cards_timeout' } },
  { actor: actor('a'), action: { type: 'relay_done', playerId: 'a' } },
  { actor: actor('b'), action: { type: 'relay_done', playerId: 'b' } },
  { actor: actor('c'), action: { type: 'relay_done', playerId: 'c' } },
  { actor: actor('d'), action: { type: 'relay_done', playerId: 'd' } },
  { actor: actor('e'), action: { type: 'relay_done', playerId: 'e' } },
  { actor: sys, action: { type: 'end_discussion' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'resolve_vote' } },
] as const;

test('以鹅传鹅 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(gooseRelayModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(gooseRelayModule, ctx, players, config);
  const state = gooseRelayModule.createInitialState(
    ctx,
    players,
    gooseRelayModule.parseConfig(config),
  );
  versionedContractAssertions.viewSchemas(gooseRelayModule, state, players);
});

test('以鹅传鹅 契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(
    gooseRelayModule,
    'goose-relay-contract',
    players,
    config,
    steps,
  );
  versionedContractAssertions.snapshotReplayable(
    gooseRelayModule,
    'goose-relay-contract',
    players,
    config,
    steps,
  );
});
