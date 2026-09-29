import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME_PAIR,
  getThemePairPreference,
  LEGACY_THEME_STORAGE_KEY,
  resolveThemePeriod,
  resolveWerewolfTheme,
  setThemePairPreference,
  THEME_PAIR_STORAGE_KEY,
} from '../src/game/werewolf/theme.ts';

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

test('resolveThemePeriod: 权威时间线优先，无时间线退回 phase，game_over 强制 day', () => {
  // 1. timeline.period 为 night
  assert.equal(resolveThemePeriod('night', 'discussion'), 'night');
  // 2. timeline.period 为 day
  assert.equal(resolveThemePeriod('day', 'night'), 'day');
  // 3. game_over 强制为 day
  assert.equal(resolveThemePeriod('night', 'game_over'), 'day');
  assert.equal(resolveThemePeriod(null, 'game_over'), 'day');
  // 4. 无 timeline 时按 phase / nightStage
  assert.equal(resolveThemePeriod(null, 'night'), 'night');
  assert.equal(resolveThemePeriod(null, 'day_announcement', 'witch'), 'night');
  assert.equal(resolveThemePeriod(null, 'discussion', null), 'day');
});

test('resolveWerewolfTheme: 只保留剧场一套，period 决定唯一两种渲染主题', () => {
  assert.equal(resolveWerewolfTheme('day'), 'theatre-day');
  assert.equal(resolveWerewolfTheme('night'), 'theatre-night');
});

test('getThemePairPreference: 唯一主题 theatre，缺失值就地归一化并写回', () => {
  const emptyStorage = createMockStorage();
  assert.equal(getThemePairPreference(emptyStorage), DEFAULT_THEME_PAIR);
  assert.equal(emptyStorage.getItem(THEME_PAIR_STORAGE_KEY), 'theatre');
});

test('getThemePairPreference: 旧存储值（forest / woodcut / eclipse / 未知值）一律迁移为 theatre', () => {
  for (const legacyValue of ['forest', 'woodcut', 'eclipse', 'theatre', 'unknown-future-value']) {
    const storage = createMockStorage({ [THEME_PAIR_STORAGE_KEY]: legacyValue });
    assert.equal(getThemePairPreference(storage), 'theatre', `存储值 ${legacyValue} 应迁移为 theatre`);
    assert.equal(storage.getItem(THEME_PAIR_STORAGE_KEY), 'theatre');
  }
});

test('getThemePairPreference: 旧 key ldj_werewolf_theme 迁移为 theatre 并被清除', () => {
  for (const legacyValue of ['woodcut', 'eclipse', 'theatre']) {
    const storage = createMockStorage({ [LEGACY_THEME_STORAGE_KEY]: legacyValue });
    assert.equal(getThemePairPreference(storage), 'theatre');
    assert.equal(storage.getItem(THEME_PAIR_STORAGE_KEY), 'theatre');
    assert.equal(storage.getItem(LEGACY_THEME_STORAGE_KEY), null);
  }
});

test('setThemePairPreference: 写入与读取闭环（只可能是 theatre）', () => {
  const storage = createMockStorage();
  setThemePairPreference('theatre', storage);
  assert.equal(storage.getItem(THEME_PAIR_STORAGE_KEY), 'theatre');
  assert.equal(getThemePairPreference(storage), 'theatre');
});

test('storage 异常防御：存储异常或受限时不抛错且安全回退', () => {
  const brokenStorage = {
    getItem: () => {
      throw new Error('SecurityError: access denied');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError: access denied');
    },
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;

  assert.doesNotThrow(() => {
    const pair = getThemePairPreference(brokenStorage);
    assert.equal(pair, 'theatre');
  });

  assert.doesNotThrow(() => {
    setThemePairPreference('theatre', brokenStorage);
  });

  assert.doesNotThrow(() => {
    assert.equal(getThemePairPreference(), 'theatre');
  });
});
