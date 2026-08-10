import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../../../shared/src/game/catalog.ts';
import {
  getDefaultRuleset,
  getGameModule,
  getSessionGameModule,
} from '../../../server/src/core/game/registry.ts';

test('loveletter 注册：目录条目声明 playable 与 botSupport none', () => {
  const entry = GAME_CATALOG.find((game) => game.id === 'loveletter');
  assert.ok(entry, '目录应包含 loveletter');
  assert.equal(entry!.availability, 'playable');
  assert.equal(entry!.botSupport, 'none');
  assert.equal(entry!.setup.defaultRulesetId, 'loveletter_classic16_v1');
  assert.deepEqual(entry!.rulesets.map((ruleset) => ruleset.id), ['loveletter_classic16_v1']);
});

test('loveletter 注册：服务端注册表可解析 (loveletter, loveletter_classic16_v1)', () => {
  const module = getGameModule('loveletter', 'loveletter_classic16_v1');
  assert.ok(module, '注册表应注册 (loveletter, loveletter_classic16_v1)');
  if (module && 'identity' in module) assert.equal(module.identity.rulesetId, 'loveletter_classic16_v1');
  assert.equal(getDefaultRuleset('loveletter'), 'loveletter_classic16_v1');
  const session = {
    module_id: 'loveletter',
    ruleset_id: 'loveletter_classic16_v1',
  } as unknown as Parameters<typeof getSessionGameModule>[0];
  const resolved = getSessionGameModule(session);
  assert.ok(resolved, '会话级解析应命中 loveletter 模块');
  if (resolved && 'identity' in resolved) assert.equal(resolved.identity.rulesetId, 'loveletter_classic16_v1');
});
