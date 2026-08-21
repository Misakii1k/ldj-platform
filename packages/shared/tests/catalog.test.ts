import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYABLE_GAME_ID,
  GAME_CATALOG,
  PLAYER_COUNT_OPTIONS,
  getPlayableGameCatalogEntry,
  listGamesForPlayerCount,
} from '@ldj/shared';

test('GAME_CATALOG：游戏 ID 唯一且人数范围有效', () => {
  const ids = GAME_CATALOG.map((game) => game.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const game of GAME_CATALOG) {
    assert.ok(game.minPlayers >= 2, `${game.id} 最少人数应不小于 2`);
    assert.ok(game.maxPlayers >= game.minPlayers, `${game.id} 人数范围无效`);
    const rulesetIds: readonly string[] = game.rulesets.map((ruleset) => ruleset.id);
    assert.equal(new Set(rulesetIds).size, rulesetIds.length, `${game.id} 规则集 ID 应唯一`);
    assert.ok(rulesetIds.includes(game.setup.defaultRulesetId), `${game.id} 默认规则集必须存在`);
    assert.equal(game.setup.defaultConfig.rulesetId, game.setup.defaultRulesetId);
    assert.equal(game.visualTheme.accent, game.theme);
    assert.deepEqual(game.setup.rulesets, game.rulesets);
  }
});

test('GAME_CATALOG：现有内部模块保留机器人能力声明', () => {
  const ruleOnlyGames = new Set(['durian', 'loveletter', 'cheese-thief', 'goose-relay', 'night-testimony', 'bell-clash', 'echo-judge']);
  for (const game of GAME_CATALOG) {
    if (ruleOnlyGames.has(game.id)) {
      assert.equal(game.botSupport, 'rule', `${game.id} 应声明规则机器人`);
    } else {
      assert.equal(game.botSupport, 'rule_and_llm', `${game.id} 应保留机器人能力`);
    }
  }
});

test('GAME_CATALOG：客户端目录配置可转换为现有模块配置', () => {
  const undercover = GAME_CATALOG.find((game) => game.id === 'undercover')!;
  assert.deepEqual(undercover.setup.defaultConfig, {
    rulesetId: 'undercover_classic_v1',
    speechSeconds: 60,
    voteSeconds: 45,
  });
  assert.deepEqual(undercover.rulesets.map((ruleset) => ruleset.id), [
    'undercover_classic_v1',
    'undercover_blank_v1',
  ]);
  const landlord = GAME_CATALOG.find((game) => game.id === 'landlord')!;
  assert.deepEqual(landlord.setup.defaultConfig, {
    rulesetId: 'landlord_platform_v1',
    variant: 'standard',
  });
  assert.deepEqual(landlord.rulesets.map((ruleset) => ruleset.id), [
    'landlord_platform_v1',
    'landlord_legacy_platform_v1',
  ]);
  const werewolf = GAME_CATALOG.find((game) => game.id === 'werewolf')!;
  assert.equal(werewolf.setup.defaultConfig.pace, 'standard');
  assert.equal(werewolf.setup.defaultConfig.witchSelfSave, 'first_night');
  assert.deepEqual(werewolf.setup.rulesets.map((ruleset) => ruleset.id), [
    'werewolf_legacy_platform_v2',
    'werewolf_platform_open_kill_v1',
  ]);
  assert.equal(werewolf.setup.options.some((option) => option.key === 'wolfKillScope'), false);
});

test('GAME_CATALOG：D1 规则集 ID 与目录状态已冻结', () => {
  assert.deepEqual(
    GAME_CATALOG.map((game) => ({ id: game.id, availability: game.availability, rulesetId: game.setup.defaultRulesetId })),
    [
      { id: 'undercover', availability: 'playable', rulesetId: 'undercover_classic_v1' },
      { id: 'uno', availability: 'playable', rulesetId: 'uno_legacy_platform_v1' },
      { id: 'landlord', availability: 'playable', rulesetId: 'landlord_platform_v1' },
      { id: 'werewolf', availability: 'playable', rulesetId: 'werewolf_legacy_platform_v2' },
      { id: 'durian', availability: 'playable', rulesetId: 'durian_orchard_v1' },
      { id: 'loveletter', availability: 'playable', rulesetId: 'loveletter_classic16_v1' },
      { id: 'cheese-thief', availability: 'playable', rulesetId: 'cheese_thief_classic_v1' },
      { id: 'goose-relay', availability: 'playable', rulesetId: 'goose_relay_classic_v1' },
      { id: 'night-testimony', availability: 'playable', rulesetId: 'night_testimony_v1' },
      { id: 'bell-clash', availability: 'playable', rulesetId: 'bell_clash_v1' },
      { id: 'echo-judge', availability: 'playable', rulesetId: 'echo_judge_v1' },
    ],
  );
});

test('GAME_CATALOG：证据已批准的游戏作为 playable 建房', () => {
  const playableIds = GAME_CATALOG.filter((game) => game.availability === 'playable').map((game) => game.id).sort();
  assert.deepEqual(playableIds, ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'goose-relay', 'landlord', 'loveletter', 'night-testimony', 'undercover', 'uno', 'werewolf']);
  assert.equal(getPlayableGameCatalogEntry('uno')?.id, 'uno');
  assert.equal(getPlayableGameCatalogEntry('undercover')?.id, 'undercover');
  assert.equal(getPlayableGameCatalogEntry('werewolf')?.id, 'werewolf');
  assert.equal(getPlayableGameCatalogEntry('landlord')?.id, 'landlord');
  assert.equal(getPlayableGameCatalogEntry('durian')?.id, 'durian');
  assert.equal(getPlayableGameCatalogEntry('loveletter')?.id, 'loveletter');
  assert.equal(getPlayableGameCatalogEntry('cheese-thief')?.id, 'cheese-thief');
  assert.equal(getPlayableGameCatalogEntry('goose-relay')?.id, 'goose-relay');
  assert.equal(getPlayableGameCatalogEntry('night-testimony')?.id, 'night-testimony');
  assert.equal(getPlayableGameCatalogEntry('bell-clash')?.id, 'bell-clash');
  assert.equal(getPlayableGameCatalogEntry('echo-judge')?.id, 'echo-judge');
  assert.equal(getPlayableGameCatalogEntry('unknown_game'), undefined);
});

test('GAME_CATALOG：永久禁入标识不进入目录', () => {
  const serialized = JSON.stringify(GAME_CATALOG).toLowerCase();
  const forbiddenNames = [
    ['骗子', '酒馆'].join(''),
    ["liar's", 'bar'].join(' '),
    ['liars', 'bar'].join('-'),
    ['liars', 'bar'].join('_'),
  ];
  for (const forbidden of forbiddenNames) assert.equal(serialized.includes(forbidden), false);
});

test('GAME_CATALOG：D1 无默认可玩游戏', () => {
  assert.equal(DEFAULT_PLAYABLE_GAME_ID, null);
});

test('listGamesForPlayerCount：生产目录展示 playable 与 coming_soon，隐藏内部或权利阻断项', () => {
  const all = listGamesForPlayerCount(null);
  assert.deepEqual(all.map((game) => game.id).sort(), ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'goose-relay', 'landlord', 'loveletter', 'night-testimony', 'undercover', 'uno', 'werewolf']);
  assert.deepEqual(listGamesForPlayerCount(4).map((game) => game.id).sort(), ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'loveletter', 'night-testimony', 'undercover', 'uno']);
  assert.deepEqual(listGamesForPlayerCount(3).map((game) => game.id).sort(), ['bell-clash', 'durian', 'echo-judge', 'landlord', 'loveletter', 'night-testimony', 'uno']);
  assert.deepEqual(listGamesForPlayerCount(12).map((game) => game.id).sort(), ['echo-judge', 'undercover', 'werewolf']);
  assert.deepEqual(listGamesForPlayerCount(2).map((game) => game.id).sort(), ['bell-clash', 'durian', 'loveletter', 'uno']);
  assert.deepEqual(listGamesForPlayerCount(5).map((game) => game.id).sort(), ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'goose-relay', 'night-testimony', 'undercover', 'uno']);
  assert.deepEqual(PLAYER_COUNT_OPTIONS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
