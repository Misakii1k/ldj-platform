import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };

const config = { rulesetId: 'goose_relay_classic_v1' };
const players = ['a', 'b', 'c', 'd', 'e'];

const card = (overrides: Partial<{ murderer: string; victim: string; tool: string; scene: string }> = {}) => ({
  murderer: overrides.murderer ?? 'grey_goose',
  victim: overrides.victim ?? 'white_goose',
  tool: overrides.tool ?? 'knife',
  scene: overrides.scene ?? 'barn',
});

/**
 * 完整局：begin → 全员传递 → 讨论 → 指认阶段全部超时（视为指错）
 * → 无人指对 → 恶鹅胜。全程无随机分支（超时推进保证必达终局）。
 */
const steps = [
  { actor: sys, action: { type: 'begin' } },
  { actor: actor('a'), action: { type: 'transmit', playerId: 'a', case: card() } },
  { actor: actor('b'), action: { type: 'transmit', playerId: 'b', case: card() } },
  { actor: actor('c'), action: { type: 'transmit', playerId: 'c', case: card() } },
  { actor: actor('d'), action: { type: 'transmit', playerId: 'd', case: card() } },
  { actor: actor('e'), action: { type: 'transmit', playerId: 'e', case: card() } },
  { actor: sys, action: { type: 'end_discussion' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
  { actor: sys, action: { type: 'accusation_timeout' } },
] as const;

test('以鹅传鹅 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(gooseRelayModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(gooseRelayModule, ctx, players, config);
  const state = gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(gooseRelayModule, state, players);
});

test('以鹅传鹅 契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(gooseRelayModule, 'goose-relay-contract', players, config, steps);
  versionedContractAssertions.snapshotReplayable(gooseRelayModule, 'goose-relay-contract', players, config, steps);
});
