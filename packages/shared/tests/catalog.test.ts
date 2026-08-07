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
  for (const game of GAME_CATALOG) {
    assert.equal(game.botSupport, 'rule_and_llm');
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
      { id: 'uno', availability: 'blocked_rights', rulesetId: 'uno_legacy_platform_v1' },
      { id: 'landlord', availability: 'playable', rulesetId: 'landlord_legacy_platform_v1' },
      { id: 'werewolf', availability: 'playable', rulesetId: 'werewolf_legacy_platform_v2' },
    ],
  );
});

test('GAME_CATALOG：证据未批准的游戏不能作为 playable 建房', () => {
  // D5 上架：undercover / werewolf / landlord 三款 playable；uno 权利证据未完成保持 blocked_rights
  const playableIds = GAME_CATALOG.filter((game) => game.availability === 'playable').map((game) => game.id).sort();
  assert.deepEqual(playableIds, ['landlord', 'undercover', 'werewolf']);
  assert.equal(getPlayableGameCatalogEntry('uno'), undefined);
  assert.equal(getPlayableGameCatalogEntry('undercover')?.id, 'undercover');
  assert.equal(getPlayableGameCatalogEntry('werewolf')?.id, 'werewolf');
  assert.equal(getPlayableGameCatalogEntry('landlord')?.id, 'landlord');
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

test('listGamesForPlayerCount：生产目录展示 playable、隐藏内部或权利阻断项', () => {
  const all = listGamesForPlayerCount(null);
  assert.deepEqual(all.map((game) => game.id).sort(), ['landlord', 'undercover', 'werewolf']);
  assert.deepEqual(listGamesForPlayerCount(4).map((game) => game.id).sort(), ['undercover']);
  assert.deepEqual(listGamesForPlayerCount(3).map((game) => game.id).sort(), ['landlord']);
  assert.deepEqual(listGamesForPlayerCount(12).map((game) => game.id).sort(), ['undercover', 'werewolf']);
  assert.deepEqual(listGamesForPlayerCount(2), []);
  assert.deepEqual(PLAYER_COUNT_OPTIONS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
