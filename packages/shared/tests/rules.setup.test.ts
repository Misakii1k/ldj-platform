import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameSetupSpec } from '../src/game/rules/setup.ts';

test('setup builds a client-consumable ruleset and host option description', () => {
  const spec = createGameSetupSpec({
    rulesets: [
      { id: 'classic_v1', label: '经典规则', description: '标准流程' },
      { id: 'quick_v1', label: '快速规则' },
    ],
    defaultRulesetId: 'classic_v1',
    options: [
      {
        key: 'pace',
        kind: 'select',
        label: '节奏',
        defaultValue: 'standard',
        choices: [
          { value: 'relaxed', label: '轻松' },
          { value: 'standard', label: '标准' },
          { value: 'quick', label: '快速' },
        ],
      },
      {
        key: 'targetScore',
        kind: 'integer',
        label: '目标分',
        defaultValue: 5,
        min: 3,
        max: 9,
        step: 1,
      },
      {
        key: 'allowDiscussion',
        kind: 'boolean',
        label: '允许讨论',
        defaultValue: true,
      },
    ],
  });

  assert.equal(spec.defaultRulesetId, 'classic_v1');
  assert.deepEqual(spec.defaultConfig, {
    rulesetId: 'classic_v1',
    pace: 'standard',
    targetScore: 5,
    allowDiscussion: true,
  });
  assert.deepEqual(spec.rulesets.map((ruleset) => ruleset.id), ['classic_v1', 'quick_v1']);
  assert.deepEqual(spec.options.map((option) => option.key), ['pace', 'targetScore', 'allowDiscussion']);
});

test('setup rejects duplicate identifiers and missing defaults', () => {
  assert.throws(
    () => createGameSetupSpec({
      rulesets: [
        { id: 'same', label: '规则一' },
        { id: 'same', label: '规则二' },
      ],
      defaultRulesetId: 'same',
      options: [],
    }),
    /规则集 ID 重复/,
  );

  assert.throws(
    () => createGameSetupSpec({
      rulesets: [{ id: 'classic', label: '经典规则' }],
      defaultRulesetId: 'missing',
      options: [],
    }),
    /默认规则集不存在/,
  );

  assert.throws(
    () => createGameSetupSpec({
      rulesets: [{ id: 'classic', label: '经典规则' }],
      defaultRulesetId: 'classic',
      options: [
        { key: 'pace', kind: 'boolean', label: '节奏一', defaultValue: true },
        { key: 'pace', kind: 'boolean', label: '节奏二', defaultValue: false },
      ],
    }),
    /配置项 key 重复/,
  );

  assert.throws(
    () => createGameSetupSpec({
      rulesets: [{ id: 'classic', label: '经典规则' }],
      defaultRulesetId: 'classic',
      options: [{ key: 'rulesetId', kind: 'boolean', label: '冲突配置', defaultValue: true }],
    }),
    /配置项 key 不能使用保留字段/,
  );
});

test('setup validates option defaults and numeric boundaries', () => {
  assert.throws(
    () => createGameSetupSpec({
      rulesets: [{ id: 'classic', label: '经典规则' }],
      defaultRulesetId: 'classic',
      options: [{
        key: 'pace',
        kind: 'select',
        label: '节奏',
        defaultValue: 'missing',
        choices: [{ value: 'quick', label: '快速' }],
      }],
    }),
    /默认选项不存在/,
  );

  assert.throws(
    () => createGameSetupSpec({
      rulesets: [{ id: 'classic', label: '经典规则' }],
      defaultRulesetId: 'classic',
      options: [{
        key: 'rounds',
        kind: 'integer',
        label: '局数',
        defaultValue: 2,
        min: 3,
        max: 9,
        step: 1,
      }],
    }),
    /整数默认值超出范围/,
  );
});

test('setup returns detached data that does not mutate its input', () => {
  const input = {
    rulesets: [{ id: 'classic', label: '经典规则' }],
    defaultRulesetId: 'classic',
    options: [{
      key: 'pace',
      kind: 'select' as const,
      label: '节奏',
      defaultValue: 'standard',
      choices: [{ value: 'standard', label: '标准' }],
    }],
  };
  const spec = createGameSetupSpec(input);
  assert.notEqual(spec.rulesets, input.rulesets);
  assert.notEqual(spec.options, input.options);
  assert.notEqual(spec.options[0], input.options[0]);
});
