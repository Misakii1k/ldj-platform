import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, type GameContext } from '@ldj/shared';
import {
  UNDERCOVER_VERSIONED_IDENTITY,
  assertUndercoverInvariants,
  undercoverModule,
  undercoverVersionedModule,
} from '../server/index.ts';
import { generateUndercoverBaseline } from '../../../../scripts/generate-d1-baselines.ts';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';

test('D3 通用版本化契约：identity/初始/纯函数不变量', () => {
  versionedContractAssertions.identity(undercoverVersionedModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(
    undercoverVersionedModule,
    ctx,
    ['p1', 'p2', 'p3', 'p4'],
    {},
  );
  const state = undercoverVersionedModule.createInitialState(
    ctx,
    ['p1', 'p2', 'p3', 'p4'],
    undercoverVersionedModule.parseConfig({}),
  );
  versionedContractAssertions.pure(
    undercoverVersionedModule,
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    { type: 'confirm_word' },
  );
});

test('D3 卧底 V2 identity 固定且视角 parser 严格', () => {
  assert.deepEqual(undercoverVersionedModule.identity, {
    engineContractVersion: 2,
    rulesetId: 'undercover_classic_v1',
    viewVersion: 1,
  });
  assert.deepEqual(undercoverVersionedModule.identity, UNDERCOVER_VERSIONED_IDENTITY);

  const random = createSeededRandom('uc-view-contract');
  const state = undercoverVersionedModule.createInitialState(
    { now: 1, random },
    ['p1', 'p2', 'p3', 'p4'],
    undercoverVersionedModule.parseConfig({}),
  );
  assert.doesNotThrow(() => undercoverVersionedModule.parsePlayerView(
    undercoverVersionedModule.getPlayerView(state, 'p1'),
  ));
  assert.throws(() => undercoverVersionedModule.parsePlayerView({
    ...undercoverVersionedModule.getPlayerView(state, 'p1'),
    secret: 'leak',
  }));
  assert.throws(() => undercoverVersionedModule.parseSpectatorView({
    ...undercoverVersionedModule.getSpectatorView(state),
    me: null,
  }));
});

test('D3 卧底不变量拒绝重复席位、未知引用和失效投票', () => {
  const random = createSeededRandom('uc-invariants');
  const state = undercoverModule.createInitialState(
    { now: 1, random },
    ['p1', 'p2', 'p3', 'p4'],
    undercoverModule.parseConfig({}),
  );
  assert.doesNotThrow(() => assertUndercoverInvariants(state));
  const duplicateSeat = structuredClone(state);
  duplicateSeat.players.p2!.seat = duplicateSeat.players.p1!.seat;
  assert.throws(() => assertUndercoverInvariants(duplicateSeat), /席位/);
  const unknownSpeaker = structuredClone(state);
  unknownSpeaker.speakingOrder = ['unknown'];
  assert.throws(() => assertUndercoverInvariants(unknownSpeaker), /未知/);
  const selfVote = structuredClone(state);
  selfVote.votes = { p1: 'p1' };
  assert.throws(() => assertUndercoverInvariants(selfVote), /自投/);
});

test('D3 卧底 V2 对 D1 完整动作序列逐步兼容 legacy oracle', () => {
  const baseline = generateUndercoverBaseline();
  const legacyRandom = createSeededRandom(baseline.seed);
  const versionedRandom = createSeededRandom(baseline.seed);
  const legacyCtx: GameContext = { now: 1_700_000_000_000, random: legacyRandom };
  const versionedCtx: GameContext = { now: legacyCtx.now, random: versionedRandom };
  let legacyState = undercoverModule.createInitialState(
    legacyCtx,
    baseline.players,
    undercoverModule.parseConfig({}),
  );
  let versionedState = undercoverVersionedModule.createInitialState(
    versionedCtx,
    baseline.players,
    undercoverVersionedModule.parseConfig({}),
  );
  assert.deepEqual(versionedState, legacyState);

  for (const step of baseline.actions) {
    legacyCtx.now = step.now;
    versionedCtx.now = step.now;
    const legacy = undercoverModule.reduce(legacyCtx, legacyState, step.actor, step.action);
    const versioned = undercoverVersionedModule.reduce(versionedCtx, versionedState, step.actor, step.action);
    assert.equal(versioned.ok, legacy.ok);
    assert.ok(legacy.ok && versioned.ok);
    assert.deepEqual(versioned.nextState, legacy.state);
    assert.deepEqual(versioned.publicEvents, legacy.events);
    assert.deepEqual(versioned.privateEvents, []);
    assert.deepEqual(versioned.effects, legacy.effects);
    legacyState = legacy.state;
    versionedState = versioned.nextState;
    for (const playerId of baseline.players) {
      assert.deepEqual(
        undercoverVersionedModule.getPlayerView(versionedState, playerId),
        undercoverModule.getPlayerView(legacyState, playerId),
      );
    }
    assert.deepEqual(
      undercoverVersionedModule.getSpectatorView(versionedState),
      undercoverModule.getSpectatorView(legacyState),
    );
    assert.deepEqual(versioned.resultCandidate, undercoverModule.getResult(legacyState));
    assert.equal(versionedRandom.getCursor(), legacyRandom.getCursor());
  }

  assert.deepEqual(versionedState, baseline.finalState);
  assert.deepEqual(undercoverModule.getResult(legacyState), baseline.result);
});
