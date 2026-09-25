/**
 * 全员就绪自动开局的准入判定（gateway #checkAutoStart 的可判定部分）。
 *
 * 回归背景：准入判定一度用游戏的**默认**规则集查人数上下限，而真正开局用的是房间
 * config 里选中的规则集。两者 manifest 人数范围不一致时会造成两种故障：
 *   1. 合法人数等不到倒计时启动（UNO 屋规 7 人，默认模块上限只有 6）；
 *   2. 倒计时空转 5 秒后被 autoStartGame 复检驳回，客户端只看到横幅归零、房间毫无反应
 *      （狼人杀主持人版：默认模块允许 6 人起，但主持人版没有自动开局语义）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAutoStart, resolveAutoStartRuleset, type AutoStartRoomRow } from '../src/gateway/ws.ts';
import { GAME_CATALOG } from '@ldj/shared';
import { getGameModule, resolveRulesetForStart } from '../src/core/game/registry.ts';

function row(over: Partial<AutoStartRoomRow> = {}): AutoStartRoomRow {
  return {
    status: 'LOBBY',
    game_id: 'wits-wagers',
    config_json: JSON.stringify({ gameConfig: { rulesetId: 'wits_wagers_platform_v1' } }),
    online: 3,
    ready_online: 3,
    // 默认无大屏：平台版开局不看它，桌面模拟版用例自己覆盖
    spectators_online: 0,
    ...over,
  };
}

const houseConfig = JSON.stringify({ gameConfig: { rulesetId: 'uno_platform_house_v1' } });

test('autoStart: 全员就绪且人数达标时放行（LOBBY 与 POST_GAME 都算）', () => {
  assert.equal(canAutoStart(row()), true);
  assert.equal(canAutoStart(row({ status: 'POST_GAME' })), true);
});

test('autoStart: 人数按房间选中的规则集判定，不按默认规则集', () => {
  // UNO 默认模块（uno_legacy_platform_v1）上限 6，屋规上限 10。
  // 7 人选屋规必须放行，否则倒计时永远不会启动。
  assert.equal(canAutoStart(row({ game_id: 'uno', config_json: houseConfig, online: 7, ready_online: 7 })), true);
  // 屋规自己的上限仍然要守住
  assert.equal(canAutoStart(row({ game_id: 'uno', config_json: houseConfig, online: 11, ready_online: 11 })), false);
});

test('autoStart: 狼人杀主持人版不自动开局，与 autoStartGame 的短路一致', () => {
  const moderator = JSON.stringify({ gameConfig: { rulesetId: 'werewolf_moderator_v1' } });
  assert.equal(canAutoStart(row({ game_id: 'werewolf', config_json: moderator, online: 6, ready_online: 6 })), false);
});

test('autoStart: 未就绪、空房、非大厅状态、缺行都不放行', () => {
  assert.equal(canAutoStart(undefined), false);
  assert.equal(canAutoStart(row({ ready_online: 2 })), false);
  assert.equal(canAutoStart(row({ online: 0, ready_online: 0 })), false);
  assert.equal(canAutoStart(row({ status: 'IN_GAME' })), false);
  assert.equal(canAutoStart(row({ status: 'CLOSED' })), false);
});

test('autoStart: 人数不足下限不放行', () => {
  assert.equal(canAutoStart(row({ online: 2, ready_online: 2 })), false);
});

test('autoStart: config_json 损坏或游戏未注册时安全放弃，不抛异常', () => {
  assert.doesNotThrow(() => canAutoStart(row({ config_json: 'not json' })));
  // 损坏的配置回落默认规则集；一智千金只有这一个可自动开局的规则集，3 人仍合法
  assert.equal(canAutoStart(row({ config_json: '{oops' })), true);
  assert.equal(canAutoStart(row({ game_id: 'no-such-game' })), false);
  assert.equal(resolveAutoStartRuleset('no-such-game', '{}'), null);
});

test('autoStart: gameConfig 缺失时回落该游戏默认规则集', () => {
  assert.equal(resolveAutoStartRuleset('uno', '{}'), 'uno_legacy_platform_v1');
  assert.equal(resolveAutoStartRuleset('uno', houseConfig), 'uno_platform_house_v1');
  // rulesetId 写在顶层（不在 gameConfig 下）不该被误读
  assert.equal(
    resolveAutoStartRuleset('uno', JSON.stringify({ rulesetId: 'uno_platform_house_v1' })),
    'uno_legacy_platform_v1',
  );
});

test('autoStart: 目录里每个可玩规则集的人数下限都能触发倒计时', () => {
  // 防回归：任何游戏新增规则集后，只要它的 minPlayers 与默认模块不同，
  // 上面那类「默认模块判定」的 bug 会立刻在这里暴露。
  for (const game of GAME_CATALOG) {
    if (game.availability !== 'playable') continue;
    for (const rs of game.rulesets) {
      const resolved = resolveRulesetForStart(game.id, { rulesetId: rs.id });
      const module = getGameModule(game.id, resolved);
      assert.ok(module, `${game.id}/${rs.id} 模块应可解析`);
      const min = module.manifest.minPlayers;
      const config_json = JSON.stringify({ gameConfig: { rulesetId: rs.id } });
      const at = canAutoStart(row({ game_id: game.id, config_json, online: min, ready_online: min }));
      // 主持人版是唯一的例外：它靠主持人手动开局
      const expected = resolved !== 'werewolf_moderator_v1';
      assert.equal(at, expected, `${game.id}/${rs.id} 在 ${min} 人时的自动开局准入应为 ${expected}`);
    }
  }
});
