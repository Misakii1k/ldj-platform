import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURED_GAME_ID,
  GAME_CATALOG,
  getGameCatalogEntry,
  listGamesForPlayerCount,
} from '@ldj/shared';

test('主页推荐游戏契约：FEATURED_GAME_ID 为 werewolf，且位于目录首位', () => {
  assert.equal(FEATURED_GAME_ID, 'werewolf');
  assert.equal(GAME_CATALOG[0]?.id, 'werewolf');
  assert.equal(GAME_CATALOG[1]?.id, 'undercover');
});

test('主页人数筛选与推荐游戏联动表现', () => {
  // 1. 全部人数视图下：狼人杀位于首位
  const allGames = listGamesForPlayerCount(null);
  assert.equal(allGames[0]?.id, 'werewolf');
  assert.equal(allGames[1]?.id, 'undercover');

  // 2. 筛选 2~5 人（狼人杀不支持，狼人杀支持 6~13 人）：狼人杀自然过滤，不出现在列表中
  for (const count of [2, 3, 4, 5]) {
    const filtered = listGamesForPlayerCount(count);
    assert.equal(
      filtered.some((game) => game.id === 'werewolf'),
      false,
      `在 ${count} 人筛选下狼人杀不应展示`,
    );
  }

  // 3. 筛选 4 人时，谁是卧底正常存在
  const fourPlayers = listGamesForPlayerCount(4);
  assert.ok(fourPlayers.some((game) => game.id === 'undercover'));

  // 4. 筛选 6~12 人时，狼人杀正常存在且位于符合条件游戏的首位
  for (const count of [6, 7, 8, 9, 10, 11, 12]) {
    const filtered = listGamesForPlayerCount(count);
    assert.equal(filtered[0]?.id, 'werewolf', `在 ${count} 人筛选下狼人杀应排在首位`);
  }
});

test('狼人杀与谁是卧底展示元数据与可用性状态', () => {
  const werewolf = getGameCatalogEntry('werewolf')!;
  assert.ok(werewolf);
  assert.equal(werewolf.availability, 'playable');
  assert.equal(werewolf.maturity, 'M4');
  assert.equal(werewolf.theme, 'violet');
  assert.equal(werewolf.minPlayers, 6);
  assert.equal(werewolf.maxPlayers, 13);

  const undercover = getGameCatalogEntry('undercover')!;
  assert.ok(undercover);
  assert.equal(undercover.availability, 'playable');
  assert.equal(undercover.maturity, 'M4');
  assert.equal(undercover.theme, 'berry');
});
