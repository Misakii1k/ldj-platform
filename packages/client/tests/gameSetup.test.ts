import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameSetupSpec } from '@ldj/shared';
import { applySetupValue, buildModuleConfig, buildSetupConfig, readRoomGameConfig } from '../src/shared-ui/setupState.ts';

const setup: GameSetupSpec = {
  rulesets: [
    { id: 'classic', label: '经典' },
    { id: 'quick', label: '快速' },
  ],
  defaultRulesetId: 'classic',
  options: [
    { key: 'pace', kind: 'select', label: '节奏', defaultValue: 'normal', choices: [{ value: 'normal', label: '标准' }, { value: 'fast', label: '快速' }] },
    { key: 'rounds', kind: 'integer', label: '轮数', defaultValue: 3, min: 1, max: 5, step: 1 },
    { key: 'private', kind: 'boolean', label: '私密', defaultValue: true },
  ],
  defaultConfig: { rulesetId: 'classic', pace: 'normal', rounds: 3, private: true },
};

test('配置状态从默认值构建且不修改 setup', () => {
  const before = structuredClone(setup);
  assert.deepEqual(buildSetupConfig(setup), setup.defaultConfig);
  assert.deepEqual(setup, before);
});

test('配置状态只接受规则集和有限选项中的合法值', () => {
  let config = buildSetupConfig(setup);
  config = applySetupValue(setup, config, 'rulesetId', 'quick');
  config = applySetupValue(setup, config, 'pace', 'fast');
  config = applySetupValue(setup, config, 'rounds', 5);
  config = applySetupValue(setup, config, 'private', false);
  assert.deepEqual(config, { rulesetId: 'quick', pace: 'fast', rounds: 5, private: false });
  assert.throws(() => applySetupValue(setup, config, 'rounds', 6), /配置值无效/);
  assert.throws(() => applySetupValue(setup, config, 'missing', true), /配置项不存在/);
});

test('房间配置只合并 setup 已知的合法游戏字段', () => {
  assert.deepEqual(readRoomGameConfig(setup, {
    gameConfig: { rulesetId: 'quick', pace: 'fast', rounds: 4, private: false, leaked: 'x' },
  }), { rulesetId: 'quick', pace: 'fast', rounds: 4, private: false });
  assert.deepEqual(readRoomGameConfig(setup, null), setup.defaultConfig);
  assert.deepEqual(buildModuleConfig(setup, { rulesetId: 'quick', pace: 'fast', rounds: 4, private: false }), {
    rulesetId: 'quick', pace: 'fast', rounds: 4, private: false,
  });
});

test('单规则集模块仍只接收模块选项，不额外透传目录身份', () => {
  const single = { ...setup, rulesets: [setup.rulesets[0]!] };
  assert.deepEqual(buildModuleConfig(single, setup.defaultConfig), {
    pace: 'normal', rounds: 3, private: true,
  });
});
