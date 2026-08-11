import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { echoJudgeModule } from '../server/module.ts';

const actor = (playerId: string) => ({ kind: 'player' as const, playerId });

const config = { rulesetId: 'echo_judge_v1' };
const players = ['a', 'b', 'c', 'd'];

test('伪人测试 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(echoJudgeModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(echoJudgeModule, ctx, players, config);
  const state = echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(echoJudgeModule, state, players);
});

test('伪人测试 契约套件：pure/deterministic/rejectedDoesNotAdvance', () => {
  const ctx = deterministicContext();
  const state = echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig(config));
  versionedContractAssertions.pure(
    echoJudgeModule,
    ctx,
    state,
    { kind: 'player', playerId: 'b' },
    { type: 'submit_answer', playerId: 'b', text: 'x' },
  );
  versionedContractAssertions.deterministic(
    echoJudgeModule,
    ctx,
    state,
    { kind: 'player', playerId: 'b' },
    { type: 'submit_answer', playerId: 'b', text: 'x' },
  );
  versionedContractAssertions.rejectedDoesNotAdvance(
    echoJudgeModule,
    ctx,
    state,
    { kind: 'player', playerId: 'a' },
    { type: 'submit_answer', playerId: 'b', text: 'x' },
  );
});

test('伪人测试 契约套件：begin 后未出题阶段提交回答被拒（顺序守卫）', () => {
  const ctx = deterministicContext();
  const state = echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig(config));
  const r = echoJudgeModule.reduce(ctx, state, actor('b'), { type: 'submit_answer', playerId: 'b', text: 'x' });
  // judge_setup 阶段（未出题）提交回答应被拒
  if (r.ok) throw new Error('judge_setup 阶段不应允许提交回答');
});
