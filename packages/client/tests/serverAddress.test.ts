/**
 * 服务器地址解析测试（APP 跨源连接层）：
 * 覆盖归一化、优先级（运行时覆盖 > 手动配置 > 同源默认）、订阅与 URL 构造。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiUrl,
  buildWsUrl,
  getManualServerBase,
  getRuntimeServerBase,
  normalizeServerBase,
  resolveServerBase,
  setManualServerBase,
  setRuntimeServerBase,
  subscribeServerBaseChange,
} from '../src/connection/serverAddress.ts';

test('normalizeServerBase：补全协议、去路径、拒绝非法输入', () => {
  assert.equal(normalizeServerBase('192.168.1.5'), 'http://192.168.1.5');
  assert.equal(normalizeServerBase('192.168.1.5:8080'), 'http://192.168.1.5:8080');
  assert.equal(normalizeServerBase('http://192.168.1.5:8080/'), 'http://192.168.1.5:8080');
  assert.equal(normalizeServerBase('  https://host.example:8443/join/ABCDE2 '), 'https://host.example:8443');
  assert.equal(normalizeServerBase(''), null);
  assert.equal(normalizeServerBase('   '), null);
  assert.equal(normalizeServerBase('ftp://192.168.1.5'), null);
  assert.equal(normalizeServerBase('http://user:pass@192.168.1.5'), null);
});

test('优先级：无任何配置时回退同源默认（Node 环境无 location）', () => {
  setManualServerBase(null);
  setRuntimeServerBase(null);
  assert.equal(resolveServerBase(), 'http://127.0.0.1:8080');
});

test('优先级：手动配置覆盖同源默认', () => {
  assert.equal(setManualServerBase('192.168.1.9:8080'), true);
  assert.equal(getManualServerBase(), 'http://192.168.1.9:8080');
  assert.equal(resolveServerBase(), 'http://192.168.1.9:8080');
});

test('优先级：运行时覆盖（主机模式）高于手动配置', () => {
  setManualServerBase('192.168.1.9:8080');
  setRuntimeServerBase('http://127.0.0.1:8123');
  assert.equal(getRuntimeServerBase(), 'http://127.0.0.1:8123');
  assert.equal(resolveServerBase(), 'http://127.0.0.1:8123');
  setRuntimeServerBase(null);
  assert.equal(resolveServerBase(), 'http://192.168.1.9:8080');
});

test('非法手动配置被拒绝且不破坏现有配置', () => {
  setManualServerBase('192.168.1.9:8080');
  assert.equal(setManualServerBase('not a url ??'), false);
  assert.equal(getManualServerBase(), 'http://192.168.1.9:8080');
  assert.equal(setManualServerBase(null), true);
  assert.equal(getManualServerBase(), null);
  setRuntimeServerBase(null);
});

test('地址变更订阅：触发与退订', () => {
  let calls = 0;
  const unsubscribe = subscribeServerBaseChange(() => {
    calls += 1;
  });
  setManualServerBase('10.0.0.2');
  assert.equal(calls, 1);
  setRuntimeServerBase('http://127.0.0.1:8080');
  assert.equal(calls, 2);
  unsubscribe();
  setManualServerBase(null);
  setRuntimeServerBase(null);
  assert.equal(calls, 2);
  assert.equal(resolveServerBase(), 'http://127.0.0.1:8080');
});

test('buildWsUrl / buildApiUrl：http→ws 协议转换与路径拼接', () => {
  assert.equal(buildWsUrl('http://192.168.1.5:8080'), 'ws://192.168.1.5:8080/ws');
  assert.equal(buildWsUrl('https://host.example'), 'wss://host.example/ws');
  assert.equal(buildApiUrl('/api/network/status', 'http://192.168.1.5:8080'), 'http://192.168.1.5:8080/api/network/status');
  assert.equal(
    buildWsUrl('http://127.0.0.1:8080'),
    buildWsUrl(),
    '缺省 base 取当前解析结果',
  );
});
