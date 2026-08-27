/**
 * apiKeyMemory 测试：用注入的假 storage 验证按预设记取/清除与降级行为。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRememberedKey, rememberKey, forgetKey, type KeyStorageLike } from '../src/app/ai-settings/apiKeyMemory.ts';

function fakeStorage(): KeyStorageLike & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => map,
  };
}

test('记住并按 profileId 取回', () => {
  const storage = fakeStorage();
  assert.equal(loadRememberedKey('p1', storage), null);
  rememberKey('p1', 'sk-abc', storage);
  rememberKey('p2', 'sk-def', storage);
  assert.equal(loadRememberedKey('p1', storage), 'sk-abc');
  assert.equal(loadRememberedKey('p2', storage), 'sk-def');
});

test('全局桶（空 profileId）与其他预设互不串扰', () => {
  const storage = fakeStorage();
  rememberKey('', 'global-key', storage);
  rememberKey('p1', 'p1-key', storage);
  assert.equal(loadRememberedKey('', storage), 'global-key');
  assert.equal(loadRememberedKey('p1', storage), 'p1-key');
});

test('forgetKey 只删目标槽', () => {
  const storage = fakeStorage();
  rememberKey('p1', 'a', storage);
  rememberKey('p2', 'b', storage);
  forgetKey('p1', storage);
  assert.equal(loadRememberedKey('p1', storage), null);
  assert.equal(loadRememberedKey('p2', storage), 'b');
});

test('空白密钥不会写入；非法 JSON 静默清零', () => {
  const storage = fakeStorage();
  rememberKey('p1', '   ', storage);
  assert.equal(loadRememberedKey('p1', storage), null);

  rememberKey('p1', 'ok', storage);
  storage.setItem('ldj_llm_apikey_memory_v1', '{broken json');
  assert.equal(loadRememberedKey('p1', storage), null);
});

test('存储抛异常时读写均静默降级', () => {
  const hostile: KeyStorageLike = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => rememberKey('p1', 'x', hostile));
  assert.equal(loadRememberedKey('p1', hostile), null);
  assert.doesNotThrow(() => forgetKey('p1', hostile));
});
