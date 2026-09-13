/**
 * 抽卡仪式持久化状态测试：同局不重播、新局重播、存储不可用时降级。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRevealStore,
  defaultRevealStore,
  hasConfirmedReveal,
  markRevealConfirmed,
  revealStorageKey,
} from '../src/game/werewolf/moderator/revealState.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

test('键包含 sessionId 与 playerId，避免跨局与跨玩家串味', () => {
  assert.notEqual(revealStorageKey('s1', 'p1'), revealStorageKey('s2', 'p1'));
  assert.notEqual(revealStorageKey('s1', 'p1'), revealStorageKey('s1', 'p2'));
});

test('确认后同一局不再重播，新一局自动重播', () => {
  const store = createRevealStore(memoryStorage());

  assert.equal(hasConfirmedReveal(store, 's1', 'p1'), false);
  markRevealConfirmed(store, 's1', 'p1');
  assert.equal(hasConfirmedReveal(store, 's1', 'p1'), true);
  assert.equal(hasConfirmedReveal(store, 's2', 'p1'), false, '新 sessionId 必须重播');
  assert.equal(hasConfirmedReveal(store, 's1', 'p2'), false, '其他玩家不受影响');
});

test('缺少 sessionId 或 playerId 时不读写', () => {
  const store = createRevealStore(memoryStorage());

  assert.equal(hasConfirmedReveal(store, '', 'p1'), false);
  assert.equal(hasConfirmedReveal(store, 's1', ''), false);
  markRevealConfirmed(store, '', 'p1');
  markRevealConfirmed(store, 's1', '');
  assert.equal(hasConfirmedReveal(store, '', 'p1'), false);
  assert.equal(hasConfirmedReveal(store, 's1', ''), false);
});

test('存储不可用时降级为每次都播且不抛错', () => {
  assert.equal(createRevealStore(null), null);
  assert.equal(createRevealStore(undefined), null);

  assert.equal(hasConfirmedReveal(null, 's1', 'p1'), false);
  markRevealConfirmed(null, 's1', 'p1');
  assert.equal(hasConfirmedReveal(null, 's1', 'p1'), false);
});

test('storage 抛错（隐私模式 / 配额满）时不抛异常', () => {
  const throwing = {
    get length() {
      return 0;
    },
    clear: () => undefined,
    getItem: () => {
      throw new Error('blocked');
    },
    key: () => null,
    removeItem: () => undefined,
    setItem: () => {
      throw new Error('quota');
    },
  } as unknown as Storage;
  const store = createRevealStore(throwing);

  assert.ok(store !== null);
  assert.equal(hasConfirmedReveal(store, 's1', 'p1'), false);
  assert.doesNotThrow(() => markRevealConfirmed(store, 's1', 'p1'));
});

test('默认存储可解析（Node 环境无 localStorage 时返回 null）', () => {
  assert.doesNotThrow(() => defaultRevealStore());
});
