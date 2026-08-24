import test from 'node:test';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { partySandboxModule } from '../server/module.ts';

const config = { rulesetId: 'party_sandbox_v1' };
const players = ['alice', 'bob', 'charlie'];

test('创意工坊 契约套件：identity/initial/viewSchemas', () => {
  versionedContractAssertions.identity(partySandboxModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(partySandboxModule, ctx, players, config);
  const state = partySandboxModule.createInitialState(ctx, players, partySandboxModule.parseConfig(config));
  versionedContractAssertions.viewSchemas(partySandboxModule, state, players);
});

test('创意工坊 契约套件：pure/deterministic/rejectedDoesNotAdvance', () => {
  const ctx = deterministicContext();
  const state = partySandboxModule.createInitialState(ctx, players, partySandboxModule.parseConfig(config));
  versionedContractAssertions.pure(
    partySandboxModule,
    ctx,
    state,
    { kind: 'player', playerId: 'alice' },
    { type: 'operate_bell', playerId: 'alice', propId: 'prop_bell_1', subAction: 'ring' },
  );
  versionedContractAssertions.deterministic(
    partySandboxModule,
    ctx,
    state,
    { kind: 'player', playerId: 'alice' },
    { type: 'operate_bell', playerId: 'alice', propId: 'prop_bell_1', subAction: 'ring' },
  );
  versionedContractAssertions.rejectedDoesNotAdvance(
    partySandboxModule,
    ctx,
    state,
    { kind: 'player', playerId: 'bob' },
    { type: 'operate_bell', playerId: 'alice', propId: 'prop_bell_1', subAction: 'ring' },
  );
});
