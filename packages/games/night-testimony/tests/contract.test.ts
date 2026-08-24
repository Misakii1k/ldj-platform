import test from 'node:test';
import type { Actor } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { nightTestimonyModule } from '../server/module.ts';
import type { NightTestimonyAction, NightTestimonyState } from '../server/types.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };

const config = { rulesetId: 'night_testimony_v1' };
const players = ['a', 'b', 'c', 'd'];

type ContractStep = {
  actor: Actor;
  action: NightTestimonyAction;
};

/**
 * 完整局步骤：begin → 3 轮全员答是达终止条件 → 投票票出囚犯 → 终局。
 * 选卡必须从本轮提供的 3 张中挑（规则强制），静态数组无法预知后续轮次卡面，
 * 因此按 reducer 实际派发的 pendingCardChoices 动态构造步骤。
 * 注意：必须用与 replayWithSeed 相同的随机种子（'night-testimony-contract'）
 * 构造，否则快照重放时抽卡序列不一致、选卡会被拒。
 */
function buildSteps(): readonly ContractStep[] {
  const random = createSeededRandom('night-testimony-contract');
  const ctx = { now: 1_700_000_000_000, random } as const;
  const steps: ContractStep[] = [];
  let state: NightTestimonyState = nightTestimonyModule.createInitialState(
    ctx,
    players,
    nightTestimonyModule.parseConfig(config),
  );

  const apply = (a: ContractStep['actor'], action: NightTestimonyAction): void => {
    steps.push({ actor: a, action });
    const reduced = nightTestimonyModule.reduce(ctx, state, a, action);
    if (!reduced.ok) throw new Error(`步骤被拒绝: ${JSON.stringify(action)} ${reduced.message}`);
    state = reduced.nextState;
  };

  const pickFor = (playerId: string): void => {
    const offered = state.pendingCardChoices;
    if (!offered || offered.length === 0) throw new Error('无可用题卡');
    apply(actor(playerId), { type: 'pick_question_card', playerId, cardId: offered[0]!.id });
  };

  apply(sys, { type: 'begin' });
  pickFor('a');
  for (const p of players) apply(actor(p), { type: 'answer_question', playerId: p, answer: 'yes' });
  pickFor('b');
  for (const p of players) apply(actor(p), { type: 'answer_question', playerId: p, answer: 'yes' });
  pickFor('c');
  for (const p of players) apply(actor(p), { type: 'answer_question', playerId: p, answer: 'yes' });
  apply(actor('a'), { type: 'cast_vote', playerId: 'a', targetPlayerId: 'c' });
  apply(actor('b'), { type: 'cast_vote', playerId: 'b', targetPlayerId: 'c' });
  apply(actor('c'), { type: 'cast_vote', playerId: 'c', targetPlayerId: 'b' });
  apply(actor('d'), { type: 'cast_vote', playerId: 'd', targetPlayerId: 'c' });
  return steps;
}

const steps = buildSteps();

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
