import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { cheeseThiefModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };

const config = { rulesetId: 'cheese_thief_classic_v1' };
const players = ['a', 'b', 'c', 'd', 'e'];

/** 完整局：begin → 6 时刻夜间 → 共犯兜底 → 讨论 → 全员投票 → 结算 */
const steps = [
  { actor: sys, action: { type: 'begin' } },
  { actor: sys, action: { type: 'advance_night', hour: 1 } },
  { actor: sys, action: { type: 'advance_night', hour: 2 } },
  { actor: sys, action: { type: 'advance_night', hour: 3 } },
  { actor: sys, action: { type: 'advance_night', hour: 4 } },
  { actor: sys, action: { type: 'advance_night', hour: 5 } },
  { actor: sys, action: { type: 'advance_night', hour: 6 } },
  { actor: sys, action: { type: 'end_night' } },
  { actor: sys, action: { type: 'auto_select_accomplice' } },
  { actor: sys, action: { type: 'end_discussion' } },
  { actor: actor('a'), action: { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' } },
  { actor: actor('b'), action: { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' } },
  { actor: actor('c'), action: { type: 'cast_abstention', playerId: 'c' } },
  { actor: actor('d'), action: { type: 'cast_vote', playerId: 'd', targetPlayerId: 'a' } },
  { actor: actor('e'), action: { type: 'cast_abstention', playerId: 'e' } },
] as const;

test('奶酪大盗 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(cheeseThiefModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(cheeseThiefModule, ctx, players, config);
  const state = cheeseThiefModule.createInitialState(ctx, players, cheeseThiefModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(cheeseThiefModule, state, players);
});

test('奶酪大盗 契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(cheeseThiefModule, 'cheese-thief-contract', players, config, steps);
  versionedContractAssertions.snapshotReplayable(cheeseThiefModule, 'cheese-thief-contract', players, config, steps);
});
