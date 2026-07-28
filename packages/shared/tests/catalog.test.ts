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
  }
});

test('GAME_CATALOG：首发游戏可玩且默认为谁是卧底', () => {
  assert.equal(DEFAULT_PLAYABLE_GAME_ID, 'undercover');
  assert.equal(getPlayableGameCatalogEntry(DEFAULT_PLAYABLE_GAME_ID)?.displayName, '谁是卧底');
});

test('listGamesForPlayerCount：按精确人数筛选，未选择时保留完整目录', () => {
  assert.equal(listGamesForPlayerCount(null).length, GAME_CATALOG.length);
  assert.deepEqual(
    listGamesForPlayerCount(3).map((game) => game.id),
    ['uno', 'landlord'],
  );
  assert.deepEqual(
    listGamesForPlayerCount(12).map((game) => game.id),
    ['undercover', 'werewolf'],
  );
  assert.deepEqual(PLAYER_COUNT_OPTIONS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
