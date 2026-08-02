import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_SECTIONS, nextSettingsSection } from '../src/app/settings/settingsNavigationState.ts';

test('settings navigation：保持 AI、界面、背景的固定顺序', () => {
  assert.deepEqual(SETTINGS_SECTIONS.map((item) => item.id), ['ai', 'appearance', 'background']);
});

test('settings navigation：方向键循环切换分类', () => {
  assert.equal(nextSettingsSection('ai', 'ArrowRight'), 'appearance');
  assert.equal(nextSettingsSection('background', 'ArrowRight'), 'ai');
  assert.equal(nextSettingsSection('ai', 'ArrowLeft'), 'background');
});

test('settings navigation：Home 和 End 跳转首尾', () => {
  assert.equal(nextSettingsSection('background', 'Home'), 'ai');
  assert.equal(nextSettingsSection('ai', 'End'), 'background');
});

test('settings navigation：无关按键不改变分类', () => {
  assert.equal(nextSettingsSection('appearance', 'Enter'), 'appearance');
  assert.equal(nextSettingsSection('appearance', 'Tab'), 'appearance');
});
