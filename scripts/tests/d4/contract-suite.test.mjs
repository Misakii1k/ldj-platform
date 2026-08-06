/**
 * D4-TOOLS：扩展契约测试套件的消费者验证。
 * 用稳定基线模块（undercover V2，只读引用）验证 versionedGameContract.ts 扩展断言：
 * identity/initial/pure/被拒动作不推进/同种子确定性/视角 Schema/无秘密泄漏/结果 only-once/
 * 快照可重放/机器人合法候选。
 * 不依赖 UNO（另一窗口 D4-U 中途状态），全部用例对 undercover V2 + D1 冻结 fixture 运行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { versionedContractAssertions, deterministicContext } from '../../../packages/shared/tests/helpers/versionedGameContract.ts';
import { undercoverVersionedModule } from '../../../packages/games/undercover/server/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FIXTURE_URL = new URL('../../../packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json', import.meta.url);

const baseline = JSON.parse(await readFile(fileURLToPath(FIXTURE_URL), 'utf8'));

test('契约套件扩展函数已导出（red 前置）', () => {
  for (const name of [
    'rejectedDoesNotAdvance',
    'deterministic',
    'viewSchemas',
    'noSecretLeak',
    'resultOnlyOnce',
    'snapshotReplayable',
    'botLegalCandidates',
  ]) {
    assert.equal(typeof versionedContractAssertions[name], 'function', `versionedContractAssertions.${name} 必须存在`);
  }
});

test('undercover V2 通过基础断言 identity/initial/pure', () => {
  const ctx = deterministicContext('d4:contract:base');
  versionedContractAssertions.identity(undercoverVersionedModule);
  versionedContractAssertions.initial(undercoverVersionedModule, ctx, baseline.players, {});
  const state = undercoverVersionedModule.createInitialState(
    ctx,
    [...baseline.players],
    undercoverVersionedModule.parseConfig({}),
  );
  versionedContractAssertions.pure(
    undercoverVersionedModule,
    ctx,
    state,
    { kind: 'player', playerId: baseline.players[0] },
    { type: 'confirm_word' },
  );
});

test('undercover V2 被拒动作不推进且同种子确定性', () => {
  const ctx = deterministicContext('d4:contract:rejected');
  const state = undercoverVersionedModule.createInitialState(
    ctx,
    [...baseline.players],
    undercoverVersionedModule.parseConfig({}),
  );
  // 非投票阶段投给他人 → 必须被拒绝
  versionedContractAssertions.rejectedDoesNotAdvance(
    undercoverVersionedModule,
    ctx,
    state,
    { kind: 'player', playerId: baseline.players[0] },
    { type: 'cast_vote', targetPlayerId: baseline.players[1] },
  );
  // 可接受动作也必须确定性
  versionedContractAssertions.deterministic(
    undercoverVersionedModule,
    ctx,
    state,
    { kind: 'player', playerId: baseline.players[0] },
    { type: 'confirm_word' },
  );
});

test('undercover V2 视角 Schema 全部可 parse 且 round-trip 稳定', () => {
  const ctx = deterministicContext('d4:contract:views');
  const state = undercoverVersionedModule.createInitialState(
    ctx,
    [...baseline.players],
    undercoverVersionedModule.parseConfig({}),
  );
  versionedContractAssertions.viewSchemas(undercoverVersionedModule, state, baseline.players);
});

test('undercover V2 无秘密泄漏（词语只出现在自己的视角；观战视角无词）', () => {
  const ctx = deterministicContext('d4:contract:secrets');
  const state = undercoverVersionedModule.createInitialState(
    ctx,
    [...baseline.players],
    undercoverVersionedModule.parseConfig({}),
  );
  const getSecrets = (current, playerId) => [
    current.players[playerId].role === 'undercover' ? current.undercoverWord : current.civilianWord,
  ];
  const allowedLeakPairs = (left, right) =>
    state.players[left].role === state.players[right].role;
  versionedContractAssertions.noSecretLeak(
    undercoverVersionedModule,
    state,
    baseline.players,
    getSecrets,
    { allowedLeakPairs, isRevealed: (current) => current.phase === 'game_over' },
  );
});

test('undercover V2 结果 only-once：沿 D1 fixture 动作推进恰好产出一个稳定结果', () => {
  const actions = baseline.actions.map((step) => ({ actor: step.actor, action: step.action }));
  versionedContractAssertions.resultOnlyOnce(undercoverVersionedModule, baseline.seed, baseline.players, {}, actions);
});

test('undercover V2 快照可重放：同一初始状态两次重放字节一致且末态通过 parse/invariants', () => {
  const actions = baseline.actions.map((step) => ({ actor: step.actor, action: step.action }));
  versionedContractAssertions.snapshotReplayable(undercoverVersionedModule, baseline.seed, baseline.players, {}, actions);
});

test('undercover V2 机器人合法候选：fixture 重放全程采样状态的 pickBotAction 均被 reducer 接受', () => {
  const ctx = deterministicContext(baseline.seed);
  let state = undercoverVersionedModule.createInitialState(
    ctx,
    [...baseline.players],
    undercoverVersionedModule.parseConfig({}),
  );
  const sampled = [state];
  for (let index = 0; index < baseline.actions.length; index += 1) {
    const step = baseline.actions[index];
    const reduced = undercoverVersionedModule.reduce(
      ctx,
      globalThis.structuredClone(state),
      step.actor,
      undercoverVersionedModule.parseAction(step.action),
    );
    assert.equal(reduced.ok, true, `fixture 动作 ${index} 被拒`);
    state = reduced.ok ? reduced.nextState : state;
    if (index % 5 === 0) sampled.push(state);
  }
  for (const sample of sampled) {
    versionedContractAssertions.botLegalCandidates(
      undercoverVersionedModule,
      ctx,
      sample,
      baseline.players,
      'd4:contract:bot',
    );
  }
});

test('sanity：fixture 基线可读且含动作序列', () => {
  assert.equal(baseline.rulesetId, 'undercover_classic_v1');
  assert.ok(baseline.actions.length >= 10);
  assert.equal(baseline.finalState.phase, 'game_over');
  assert.ok(ROOT.endsWith('项目') || ROOT.includes('项目'));
});
