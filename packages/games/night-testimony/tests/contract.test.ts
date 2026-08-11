import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { nightTestimonyModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };

const config = { rulesetId: 'night_testimony_v1' };
const players = ['a', 'b', 'c', 'd'];

/**
 * 完整局：begin → 问答超时 → 推理超时 → 全员投票 → 结算。
 * 全程无随机分支：问答直接超时进入推理，投票后 settleVote 由被票者身份决定胜负，
 * 若票出狱警则进入猜罪环节（游戏继续），否则终局。resultOnlyOnce 断言两种终局都合法。
 */
const steps = [
  { actor: sys, action: { type: 'begin' } },
  { actor: sys, action: { type: 'resolve_question' } },
  { actor: sys, action: { type: 'end_deduction' } },
  { actor: actor('a'), action: { type: 'cast_vote', playerId: 'a', targetPlayerId: 'b' } },
  { actor: actor('b'), action: { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' } },
  { actor: actor('c'), action: { type: 'cast_vote', playerId: 'c', targetPlayerId: 'a' } },
  { actor: actor('d'), action: { type: 'cast_vote', playerId: 'd', targetPlayerId: 'a' } },
] as const;

test('囚徒之夜 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(nightTestimonyModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(nightTestimonyModule, ctx, players, config);
  const state = nightTestimonyModule.createInitialState(ctx, players, nightTestimonyModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(nightTestimonyModule, state, players);
});

test('囚徒之夜 契约套件：结果 only-once 且快照可重放', () => {
  versionedContractAssertions.resultOnlyOnce(nightTestimonyModule, 'night-testimony-contract', players, config, steps);
  versionedContractAssertions.snapshotReplayable(nightTestimonyModule, 'night-testimony-contract', players, config, steps);
});
