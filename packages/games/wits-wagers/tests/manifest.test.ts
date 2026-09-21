import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WITS_WAGERS_MANIFEST, WITS_WAGERS_VIEW_KEY } from '../shared/manifest.ts';

// T01 冻结项：这些值被 catalog、registry、client viewRegistry 共同依赖，
// 改动任何一个都会静默拆掉视角解析路由，因此逐个字面量锁定。

test('一智千金 manifest 锁定 id/人数/版本/规则集', () => {
  assert.equal(WITS_WAGERS_MANIFEST.id, 'wits-wagers');
  assert.equal(WITS_WAGERS_MANIFEST.displayName, '一智千金');
  // G0 P5：3–7 席位，一席位=一提交身份=一设备。
  assert.equal(WITS_WAGERS_MANIFEST.minPlayers, 3);
  assert.equal(WITS_WAGERS_MANIFEST.maxPlayers, 7);
  assert.equal(WITS_WAGERS_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(WITS_WAGERS_MANIFEST.rulesets, ['wits_wagers_platform_v1']);
});

test('视角路由 key 与 manifest 各字段一致', () => {
  // client/src/game/viewRegistry.ts 的 REGISTRY 以 `${gameId}:${rulesetId}:${viewVersion}` 为键。
  assert.equal(WITS_WAGERS_VIEW_KEY, 'wits-wagers:wits_wagers_platform_v1:1');
  const [gameId, rulesetId, viewVersion] = WITS_WAGERS_VIEW_KEY.split(':');
  assert.equal(gameId, WITS_WAGERS_MANIFEST.id);
  assert.equal(rulesetId, WITS_WAGERS_MANIFEST.rulesets[0]);
  assert.equal(Number(viewVersion), 1);
});

test('包 exports 只暴露 manifest 与 server（契约修订 C01）', () => {
  // C01：客户端零游戏包依赖。新增 ./shared 或根 barrel 会把结构性边界降级为约定性边界。
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { name: string; exports: Record<string, string>; dependencies?: Record<string, string> };
  assert.equal(pkg.name, '@ldj/game-wits-wagers');
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['./manifest', './server']);
  assert.equal(pkg.exports['./manifest'], './shared/manifest.ts');
  assert.equal(pkg.exports['./server'], './server/index.ts');
  assert.equal(pkg.exports['.'], undefined, '不得提供根 barrel，避免顺带导出题库/State');
});

test('manifest 不夹带题库、答案或服务端状态', () => {
  // shared/manifest.ts 会被 server 与（未来）构建审计同时读取，必须保持纯常量。
  const source = readFileSync(new URL('../shared/manifest.ts', import.meta.url), 'utf8');
  assert.ok(!source.includes('../server'), 'manifest 不得从 server 目录导入');
  for (const forbidden of ['answer', 'question-bank', 'questionPlan']) {
    assert.ok(!source.includes(forbidden), `manifest 不得出现 ${forbidden}`);
  }
});
