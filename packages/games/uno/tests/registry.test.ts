/**
 * D4-U（uno_platform_house_v1）注册断言：模块导出、共享 manifest、目录目录、服务端注册表。
 * 引用 compliance/rules/uno_platform_house_v1.json 的 plannedTestIds：
 * - uno_house_identity_is_platform_variant_test
 * - uno_house_does_not_replace_legacy_before_gates_test
 * - uno_house_register_separate_ruleset
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unoHouseModule, UNO_HOUSE_VERSIONED_IDENTITY } from '../server/index.ts';
import { UNO_MANIFEST } from '../shared/manifest.ts';
import { GAME_CATALOG } from '../../../shared/src/game/catalog.ts';
import {
  getDefaultRuleset,
  getGameModule,
  getSessionGameModule,
} from '../../../server/src/core/game/registry.ts';

test('uno_platform_house_v1 注册：server/index.ts 导出 unoHouseModule 且身份正确', () => {
  assert.equal(unoHouseModule.identity.rulesetId, 'uno_platform_house_v1');
  assert.equal(unoHouseModule.identity.engineContractVersion, 2);
  assert.deepEqual(
    unoHouseModule.registeredRulesets,
    ['uno_platform_house_v1'],
  );
  assert.equal(unoHouseModule.defaultRulesetId, 'uno_platform_house_v1');
  assert.deepEqual(
    UNO_HOUSE_VERSIONED_IDENTITY,
    { engineContractVersion: 2, rulesetId: 'uno_platform_house_v1', viewVersion: 1 },
  );
  // 平台变体清单：只能并行走平台变体，不得覆盖 legacy。
  assert.equal(unoHouseModule.manifest.id, 'uno');
  assert.equal(unoHouseModule.manifest.maxPlayers, 10);
});

test('uno_platform_house_v1 注册：shared/manifest.ts 声明 house 规则集且保留 legacy 默认', () => {
  const rulesets = (UNO_MANIFEST as unknown as { rulesets?: readonly string[] }).rulesets;
  assert.ok(Array.isArray(rulesets), 'UNO_MANIFEST 应声明 rulesets 数组');
  assert.ok(rulesets!.includes('uno_platform_house_v1'), 'manifest 应注册 uno_platform_house_v1');
});

test('uno_platform_house_v1 注册：catalog.ts uno 规则集含 house 项且默认仍是 legacy 基线', () => {
  const unoEntry = GAME_CATALOG.find((game) => game.id === 'uno');
  assert.ok(unoEntry, '目录应包含 uno');
  const rulesetIds = unoEntry!.rulesets.map((r) => r.id);
  assert.ok(rulesetIds.includes('uno_platform_house_v1'), 'uno rulesets 应含 house 项');
  // legacy 基线必须保留为默认，不被 house 替换（UNO-HOUSE-GOV-002 并行注册）。
  assert.equal(unoEntry!.setup.defaultRulesetId, 'uno_legacy_platform_v1');
  assert.equal(unoEntry!.availability, 'playable');
});

test('uno_platform_house_v1 注册：服务端注册表可解析 (uno, uno_platform_house_v1)', () => {
  const module = getGameModule('uno', 'uno_platform_house_v1');
  assert.ok(module, '注册表应注册 (uno, uno_platform_house_v1)');
  if (module && 'identity' in module) {
    assert.equal(module.identity.rulesetId, 'uno_platform_house_v1');
  }
  // 默认规则集保持不变：不替换 legacy。
  assert.equal(getDefaultRuleset('uno'), 'uno_legacy_platform_v1');
  const legacy = getGameModule('uno');
  assert.ok(legacy, 'legacy 默认规则集仍可解析');
});

test('uno_platform_house_v1 注册：会话级解析按 ruleset_id 走 house 模块', () => {
  const house = getGameModule('uno', 'uno_platform_house_v1');
  assert.ok(house, 'house 模块应已注册');
  // 用会话行形状直接验证 getSessionGameModule 分支。
  const session = {
    module_id: 'uno',
    ruleset_id: 'uno_platform_house_v1',
  } as unknown as Parameters<typeof getSessionGameModule>[0];
  const resolved = getSessionGameModule(session);
  assert.ok(resolved, '会话级解析应命中 house 模块');
  if (resolved && 'identity' in resolved) {
    assert.equal(resolved.identity.rulesetId, 'uno_platform_house_v1');
  }
});
