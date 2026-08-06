import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, type GameContext } from '@ldj/shared';
import { generateUnoBaseline } from '../../../../scripts/generate-d1-baselines.ts';
import {
  assertUnoInvariants,
  migrateLegacyUnoState,
  unoModule,
  unoVersionedModule,
} from '../server/index.ts';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';

test('D3 通用版本化契约：identity/初始/纯函数不变量', () => {
  versionedContractAssertions.identity(unoVersionedModule);
  const ctx = deterministicContext();
  versionedContractAssertions.initial(
    unoVersionedModule,
    ctx,
    ['p1', 'p2', 'p3', 'p4'],
    {},
  );
  const state = unoVersionedModule.createInitialState(
    ctx,
    ['p1', 'p2'],
    unoVersionedModule.parseConfig({}),
  );
  versionedContractAssertions.pure(
    unoVersionedModule,
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    { type: 'draw_card' },
  );
});

test('D3 UNO V2 identity 固定且 config/action 解析严格', () => {
  assert.deepEqual(unoVersionedModule.identity, {
    engineContractVersion: 2,
    rulesetId: 'uno_legacy_platform_v1',
    viewVersion: 1,
  });
  assert.deepEqual(unoVersionedModule.parseConfig({}), { variant: 'standard' });
  assert.throws(() => unoVersionedModule.parseConfig({ extra: true }));
  assert.throws(() => unoVersionedModule.parseAction({ type: 'draw_card', extra: true }));
  assert.throws(() => unoVersionedModule.parseAction({ type: 'play_card' }));
  assert.throws(() => unoVersionedModule.parseAction({ type: 'play_card', cardId: 'x', declaredColor: 'purple' }));
  assert.throws(() => unoVersionedModule.parseAction({ type: 'draw_card', declaredColor: 'red' }));
});

test('D3 UNO 旧 raw state 缺 lastPlayed 时显式迁移且不修改输入', () => {
  const random = createSeededRandom('uno-old');
  const current = unoModule.createInitialState(
    { now: 1, random },
    ['p1', 'p2'],
    unoModule.parseConfig({}),
  );
  const legacy = structuredClone(current) as unknown as Record<string, unknown>;
  delete legacy.lastPlayed;
  const before = structuredClone(legacy);
  const migrated = migrateLegacyUnoState(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(migrated.lastPlayed, null);
  assert.throws(() => unoVersionedModule.parseState(legacy));
  assert.doesNotThrow(() => unoVersionedModule.parseState(migrated));
});

test('D3 UNO 不变量拒绝重复/丢失卡牌和失效终局', () => {
  const random = createSeededRandom('uno-invariants');
  const state = unoVersionedModule.createInitialState(
    { now: 1, random },
    ['p1', 'p2'],
    unoVersionedModule.parseConfig({}),
  );
  assert.doesNotThrow(() => assertUnoInvariants(state));
  const duplicate = structuredClone(state);
  duplicate.deck.push(duplicate.deck[0]!);
  assert.throws(() => assertUnoInvariants(duplicate), /108|唯一/);
  const noDiscard = structuredClone(state);
  noDiscard.discardPile = [];
  assert.throws(() => assertUnoInvariants(noDiscard), /弃牌顶/);
  const badWinner = structuredClone(state);
  badWinner.phase = 'game_over';
  badWinner.winnerId = 'outsider';
  assert.throws(() => assertUnoInvariants(badWinner), /胜者/);
});

test('D3 UNO V2 对 D1 完整动作序列逐步兼容 legacy oracle', () => {
  const baseline = generateUnoBaseline();
  const legacyRandom = createSeededRandom(baseline.seed);
  const versionedRandom = createSeededRandom(baseline.seed);
  const legacyCtx: GameContext = { now: 1_700_000_000_000, random: legacyRandom };
  const versionedCtx: GameContext = { now: legacyCtx.now, random: versionedRandom };
  let legacyState = unoModule.createInitialState(legacyCtx, baseline.players, unoModule.parseConfig({}));
  let versionedState = unoVersionedModule.createInitialState(
    versionedCtx,
    baseline.players,
    unoVersionedModule.parseConfig({}),
  );
  assert.deepEqual(versionedState, legacyState);

  for (const step of baseline.actions) {
    legacyCtx.now = step.now;
    versionedCtx.now = step.now;
    const actor = { kind: 'player' as const, playerId: step.actor };
    const legacy = unoModule.reduce(legacyCtx, legacyState, actor, step.action);
    const versioned = unoVersionedModule.reduce(versionedCtx, versionedState, actor, step.action);
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
        unoVersionedModule.getPlayerView(versionedState, playerId),
        unoModule.getPlayerView(legacyState, playerId),
      );
    }
    assert.deepEqual(unoVersionedModule.getSpectatorView(versionedState), unoModule.getSpectatorView(legacyState));
    assert.deepEqual(versioned.resultCandidate, unoModule.getResult(legacyState));
    assert.equal(versionedRandom.getCursor(), legacyRandom.getCursor());
  }
  assert.deepEqual(versionedState, baseline.finalState);
  assert.deepEqual(unoModule.getResult(legacyState), baseline.result);
});
