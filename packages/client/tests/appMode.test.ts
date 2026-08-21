/**
 * APP 身份模式与最近主机记忆测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeSetItem } from '../src/lib/safeStorage.ts';
import {
  clearAppMode,
  forgetRecentHosts,
  getRecentHosts,
  getSavedAppMode,
  rememberRecentHost,
  resolveInitialDeviceRole,
  saveAppMode,
} from '../src/app/appMode.ts';

test('身份模式：保存与读取往返，非法值视为未保存', () => {
  clearAppMode();
  assert.equal(getSavedAppMode(), null);
  saveAppMode('table');
  assert.equal(getSavedAppMode(), 'table');
  saveAppMode('player');
  assert.equal(getSavedAppMode(), 'player');
});

test('模拟模式初始角色：APP 身份优先于每游戏记忆', () => {
  saveAppMode('table');
  assert.equal(resolveInitialDeviceRole('ldj_durian_device_role'), 'table');
  saveAppMode('player');
  assert.equal(resolveInitialDeviceRole('ldj_durian_device_role'), 'player');
});

test('模拟模式初始角色：无 APP 身份时回退每游戏记忆，缺省玩家端', () => {
  clearAppMode();
  safeSetItem('ldj_test_game_role', 'table');
  assert.equal(resolveInitialDeviceRole('ldj_test_game_role'), 'table');
  assert.equal(resolveInitialDeviceRole('ldj_other_game_role'), 'player');
});

test('最近主机：归一化、去重置顶、上限 5 条', () => {
  forgetRecentHosts();
  rememberRecentHost('192.168.1.5:8080');
  rememberRecentHost('http://192.168.1.9/');
  assert.deepEqual(getRecentHosts(), ['http://192.168.1.9', 'http://192.168.1.5:8080']);

  rememberRecentHost('192.168.1.5:8080');
  assert.deepEqual(getRecentHosts(), ['http://192.168.1.5:8080', 'http://192.168.1.9']);

  for (let i = 0; i < 6; i++) {
    rememberRecentHost(`10.0.0.${i}:9000`);
  }
  assert.equal(getRecentHosts().length, 5);
  assert.equal(getRecentHosts()[4], 'http://10.0.0.1:9000', '最旧的被挤出');

  forgetRecentHosts();
  assert.deepEqual(getRecentHosts(), []);
});
