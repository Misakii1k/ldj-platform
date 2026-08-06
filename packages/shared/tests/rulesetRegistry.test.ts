import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_CATALOG,
  buildCatalogRulesetRegistry,
  buildRulesetRegistry,
  listRulesetIdsForGame,
  resolveRulesetIdentity,
  type GameCatalogEntry,
  type GameRulesetEntry,
} from '@ldj/shared';

const UNO_ENTRIES: readonly GameRulesetEntry[] = [
  { gameId: 'uno', rulesetId: 'uno_legacy_platform_v1', kind: 'legacy_compatibility', defaultForGame: true },
];
const UNDERCOVER_ENTRIES: readonly GameRulesetEntry[] = [
  { gameId: 'undercover', rulesetId: 'undercover_classic_v1', kind: 'legacy_compatibility', defaultForGame: true },
];
const WEREWOLF_ENTRIES: readonly GameRulesetEntry[] = [
  { gameId: 'werewolf', rulesetId: 'werewolf_legacy_platform_v2', kind: 'legacy_compatibility', defaultForGame: true },
  { gameId: 'werewolf', rulesetId: 'werewolf_platform_open_kill_v1', kind: 'platform_variant', defaultForGame: false },
];

test('buildRulesetRegistry：重复 (gameId, rulesetId) 元组被拒绝', () => {
  const entries: GameRulesetEntry[] = [
    ...UNO_ENTRIES,
    { gameId: 'uno', rulesetId: 'uno_legacy_platform_v1', kind: 'legacy_compatibility', defaultForGame: false },
  ];
  assert.throws(() => buildRulesetRegistry(entries), /重复/);
});

test('buildRulesetRegistry：缺少默认规则集的游戏被拒绝', () => {
  const entries: GameRulesetEntry[] = [
    { gameId: 'uno', rulesetId: 'uno_legacy_platform_v1', kind: 'legacy_compatibility', defaultForGame: false },
  ];
  assert.throws(() => buildRulesetRegistry(entries), /默认/);
});

test('resolve：返回已注册的规则集', () => {
  const registry = buildRulesetRegistry([...UNDERCOVER_ENTRIES, ...WEREWOLF_ENTRIES]);
  assert.equal(registry.resolve('werewolf', 'werewolf_platform_open_kill_v1').rulesetId, 'werewolf_platform_open_kill_v1');
  assert.equal(registry.resolve('werewolf', 'werewolf_platform_open_kill_v1').kind, 'platform_variant');
  assert.equal(
    resolveRulesetIdentity(
      { rulesetId: 'werewolf_platform_open_kill_v1' },
      ['werewolf_legacy_platform_v2', 'werewolf_platform_open_kill_v1'],
      'werewolf_legacy_platform_v2',
    ),
    'werewolf_platform_open_kill_v1',
  );
});

test('resolveRulesetIdentity：config.rulesetId 缺省时回落默认规则集', () => {
  const registered = ['werewolf_legacy_platform_v2', 'werewolf_platform_open_kill_v1'];
  assert.equal(resolveRulesetIdentity({}, registered, 'werewolf_legacy_platform_v2'), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetIdentity(undefined, registered, 'werewolf_legacy_platform_v2'), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetIdentity(null, registered, 'werewolf_legacy_platform_v2'), 'werewolf_legacy_platform_v2');
});

test('resolveRulesetIdentity：config.rulesetId 存在但未注册时抛错', () => {
  assert.throws(
    () => resolveRulesetIdentity({ rulesetId: 'not_registered_v1' }, ['uno_legacy_platform_v1'], 'uno_legacy_platform_v1'),
    /未注册|声明/,
  );
});

test('byGame / defaultRulesetId：按游戏返回条目与默认规则集', () => {
  const registry = buildRulesetRegistry([...UNDERCOVER_ENTRIES, ...WEREWOLF_ENTRIES, ...UNO_ENTRIES]);
  assert.deepEqual(
    registry.byGame('werewolf').map((entry) => entry.rulesetId),
    ['werewolf_legacy_platform_v2', 'werewolf_platform_open_kill_v1'],
  );
  assert.equal(registry.defaultRulesetId('werewolf'), 'werewolf_legacy_platform_v2');
  assert.equal(registry.byGame('undercover').length, 1);
  assert.equal(registry.defaultRulesetId('undercover'), 'undercover_classic_v1');
  assert.equal(registry.defaultRulesetId('uno'), 'uno_legacy_platform_v1');
  assert.deepEqual(registry.byGame('unknown_game'), []);
});

test('buildRulesetRegistry：输入数组的后续修改不影响注册表', () => {
  const entries: GameRulesetEntry[] = [
    { gameId: 'uno', rulesetId: 'uno_legacy_platform_v1', kind: 'legacy_compatibility', defaultForGame: true },
  ];
  const registry = buildRulesetRegistry(entries);
  entries.push({ gameId: 'werewolf', rulesetId: 'werewolf_legacy_platform_v2', kind: 'legacy_compatibility', defaultForGame: true });
  (entries[0] as { rulesetId: string }).rulesetId = 'mutated_v1';

  assert.equal(registry.entries.length, 1);
  assert.equal(registry.defaultRulesetId('uno'), 'uno_legacy_platform_v1');
  assert.deepEqual(registry.byGame('uno').map((entry) => entry.rulesetId), ['uno_legacy_platform_v1']);
  assert.deepEqual(registry.byGame('werewolf'), []);
});

test('buildCatalogRulesetRegistry：校验 GAME_CATALOG 规则集非空且每游戏唯一', () => {
  const registry = buildCatalogRulesetRegistry();
  assert.ok(registry.entries.length >= 4, '目录应包含四款游戏的规则集条目');
  assert.equal(registry.defaultRulesetId('uno'), 'uno_legacy_platform_v1');
  assert.equal(registry.defaultRulesetId('werewolf'), 'werewolf_legacy_platform_v2');
  assert.deepEqual(
    listRulesetIdsForGame(registry, 'werewolf'),
    ['werewolf_legacy_platform_v2', 'werewolf_platform_open_kill_v1'],
  );

  const catalogSource = GAME_CATALOG[0]!;
  const emptyRulesetsGame: GameCatalogEntry = {
    ...catalogSource,
    id: 'empty_rulesets_game',
    rulesets: [],
    setup: {
      ...catalogSource.setup,
      rulesets: [],
      defaultRulesetId: 'none_v1',
      defaultConfig: { rulesetId: 'none_v1' },
    },
  };
  assert.throws(() => buildCatalogRulesetRegistry([emptyRulesetsGame]), /规则集/);

  const duplicateRulesetsGame: GameCatalogEntry = {
    ...catalogSource,
    id: 'duplicate_rulesets_game',
    rulesets: [
      { id: 'dup_v1', label: '第一' },
      { id: 'dup_v1', label: '第二' },
    ],
    setup: {
      ...catalogSource.setup,
      rulesets: [
        { id: 'dup_v1', label: '第一' },
        { id: 'dup_v1', label: '第二' },
      ],
      defaultRulesetId: 'dup_v1',
      defaultConfig: { rulesetId: 'dup_v1' },
    },
  };
  assert.throws(() => buildCatalogRulesetRegistry([duplicateRulesetsGame]), /重复/);
});
