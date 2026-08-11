import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { bellClashModule } from '../server/module.ts';

const config = { rulesetId: 'bell_clash_v1' };
const players = ['a', 'b', 'c'];

/**
 * 铃铛对决契约：identity/initial/viewSchemas 与纯函数/确定性/被拒不推进断言。
 * 注：终局依赖随机牌库（先打完手牌者胜），无法用静态动作序列确定到达，
 * resultOnlyOnce/snapshotReplayable 由 module.test.ts 的确定性完整局覆盖。
 */
test('铃铛对决 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(bellClashModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(bellClashModule, ctx, players, config);
  const state = bellClashModule.createInitialState(ctx, players, bellClashModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(bellClashModule, state, players);
});

test('铃铛对决 契约套件：pure/deterministic/rejectedDoesNotAdvance', () => {
  const ctx = deterministicContext();
  const state = bellClashModule.createInitialState(ctx, players, bellClashModule.parseConfig(config));
  versionedContractAssertions.pure(
    bellClashModule,
    ctx,
    state,
    { kind: 'player', playerId: 'a' },
    { type: 'draw_card', playerId: 'a' },
  );
  versionedContractAssertions.deterministic(
    bellClashModule,
    ctx,
    state,
    { kind: 'player', playerId: 'a' },
    { type: 'draw_card', playerId: 'a' },
  );
  versionedContractAssertions.rejectedDoesNotAdvance(
    bellClashModule,
    ctx,
    state,
    { kind: 'player', playerId: 'b' },
    { type: 'draw_card', playerId: 'a' },
  );
});
