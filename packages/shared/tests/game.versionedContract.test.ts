import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPrivateGameEvents,
  isVersionedGameModule,
  normalizeLegacyReduceResult,
  type Actor,
  type GameContext,
  type GameModuleV2,
} from '../src/index.ts';

const identity = {
  engineContractVersion: 2 as const,
  rulesetId: 'test_ruleset_v1',
  viewVersion: 1,
};

test('legacy 成功结果被规范化为 V2 六字段成功结果', () => {
  const result = normalizeLegacyReduceResult(
    { ok: true as const, state: { n: 2 }, events: [{ type: 'advanced' }], effects: [] },
    { resultCandidate: { winner: 'p1' }, diagnostics: { trace: 1 } },
  );

  assert.deepEqual(result, {
    ok: true,
    nextState: { n: 2 },
    publicEvents: [{ type: 'advanced' }],
    privateEvents: [],
    effects: [],
    resultCandidate: { winner: 'p1' },
    diagnostics: { trace: 1 },
  });
});

test('legacy 拒绝结果保持稳定错误且不伪造成功字段', () => {
  assert.deepEqual(
    normalizeLegacyReduceResult({ ok: false as const, code: 'DENIED', message: 'no' }),
    { ok: false, code: 'DENIED', message: 'no' },
  );
});

test('私有事件必须声明非空、去重且属于参局者的接收者', () => {
  const players = ['p1', 'p2'];
  assert.doesNotThrow(() => assertPrivateGameEvents([
    { recipients: ['p1'], event: { type: 'secret' } },
  ], players));
  assert.throws(() => assertPrivateGameEvents([
    { recipients: [], event: { type: 'secret' } },
  ], players), /接收者/);
  assert.throws(() => assertPrivateGameEvents([
    { recipients: ['p1', 'p1'], event: { type: 'secret' } },
  ], players), /重复/);
  assert.throws(() => assertPrivateGameEvents([
    { recipients: ['outsider'], event: { type: 'secret' } },
  ], players), /未知/);
});

test('只把带 contract v2 identity 的模块识别为版本化模块', () => {
  const module: GameModuleV2<unknown, unknown, unknown, unknown, unknown, unknown, unknown> = {
    manifest: {
      id: 'test', version: '1.0.0', displayName: 'Test', minPlayers: 2, maxPlayers: 2, stateSchemaVersion: 1,
    },
    identity,
    registeredRulesets: ['test_ruleset_v1'],
    defaultRulesetId: 'test_ruleset_v1',
    parseConfig: input => input,
    parseAction: input => input,
    parseState: input => input,
    parsePlayerView: input => input,
    parseSpectatorView: input => input,
    assertInvariants: () => {},
    snapshotMigrations: {},
    createInitialState: (_ctx: GameContext, players: string[]) => ({ players }),
    reduce: (_ctx: GameContext, state: unknown, _actor: Actor, _action: unknown) => ({
      ok: true,
      nextState: state,
      publicEvents: [],
      privateEvents: [],
      effects: [],
      resultCandidate: null,
    }),
    getPlayerView: state => state,
    getSpectatorView: state => state,
  };

  assert.equal(isVersionedGameModule(module), true);
  assert.equal(isVersionedGameModule({ manifest: module.manifest }), false);
});
