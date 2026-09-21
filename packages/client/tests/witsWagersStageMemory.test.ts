import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageMemory } from '../src/game/wits-wagers/stage/stageMemory.ts';

/** 最小 Storage 假实现，行为对齐浏览器（含 key(i) 遍历顺序）。 */
function fakeStorage(initial: Record<string, string> = {}): Storage & { throwOnWrite?: boolean } {
  const map = new Map<string, string>(Object.entries(initial));
  const store = {
    get length() {
      return map.size;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (store.throwOnWrite) throw new Error('QuotaExceeded');
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
    throwOnWrite: false,
  };
  return store as unknown as Storage & { throwOnWrite?: boolean };
}

test('stageMemory: 标记后同键不再重播', () => {
  const storage = fakeStorage();
  const memory = createStageMemory('tok-1', storage);

  assert.equal(memory.has('settle:1'), false);
  memory.mark('settle:1');
  assert.equal(memory.has('settle:1'), true);
  // 不同键互不影响
  assert.equal(memory.has('settle:2'), false);
});

test('stageMemory: 重建实例仍能读到已标记（模拟刷新重连）', () => {
  const storage = fakeStorage();
  createStageMemory('tok-1', storage).mark('board:1:2');

  // 刷新后是一个全新实例，但 sessionStorage 还在
  const afterReload = createStageMemory('tok-1', storage);
  assert.equal(afterReload.has('board:1:2'), true);
});

test('stageMemory: 记忆按 roundToken 隔离', () => {
  const storage = fakeStorage();
  createStageMemory('tok-1', storage).mark('settle:1');

  // 新一轮换了 token，同名键应视为未播放
  assert.equal(createStageMemory('tok-2', storage).has('settle:1'), false);
});

test('stageMemory: keepOnly 清掉其它轮次的记忆但保留当前轮', () => {
  const storage = fakeStorage();
  createStageMemory('tok-1', storage).mark('settle:1');
  createStageMemory('tok-2', storage).mark('settle:2');
  const current = createStageMemory('tok-3', storage);
  current.mark('settle:3');

  // 不相关的键不该被误删
  storage.setItem('ldj_user_nickname', '玩家');

  current.keepOnly('tok-3');

  assert.equal(current.has('settle:3'), true);
  assert.equal(createStageMemory('tok-1', storage).has('settle:1'), false);
  assert.equal(createStageMemory('tok-2', storage).has('settle:2'), false);
  assert.equal(storage.getItem('ldj_user_nickname'), '玩家');
});

test('stageMemory: 存储损坏时视为未播放而不抛错', () => {
  const storage = fakeStorage({ 'ww:stage:tok-1': '{not json' });
  const memory = createStageMemory('tok-1', storage);
  assert.equal(memory.has('settle:1'), false);
  assert.doesNotThrow(() => memory.mark('settle:1'));
  assert.equal(memory.has('settle:1'), true);
});

test('stageMemory: 存储非数组内容时忽略', () => {
  const memory = createStageMemory('tok-1', fakeStorage({ 'ww:stage:tok-1': '{"a":1}' }));
  assert.equal(memory.has('settle:1'), false);
});

test('stageMemory: 写入失败（隐私模式/配额）不影响界面', () => {
  const storage = fakeStorage();
  storage.throwOnWrite = true;
  const memory = createStageMemory('tok-1', storage);
  assert.doesNotThrow(() => memory.mark('settle:1'));
  // 退化为"每次都演"，但绝不崩
  assert.equal(memory.has('settle:1'), false);
});

test('stageMemory: 无可用存储时退化为进程内记忆', () => {
  const memory = createStageMemory('tok-1', null);
  assert.equal(memory.has('settle:1'), false);
  memory.mark('settle:1');
  assert.equal(memory.has('settle:1'), true);
  assert.doesNotThrow(() => memory.keepOnly('tok-1'));
});
