import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WITS_SETTINGS,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  parseWitsSettings,
  readWitsSettings,
  writeWitsSettings,
  WITS_SETTINGS_STORAGE_KEY,
} from '../src/game/wits-wagers/settings/witsSettings.ts';
import { fitToDeadline, legDuration } from '../src/shared-ui/stage/flip.ts';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
}

test('witsSettings: 缺失或损坏的输入回落到默认值', () => {
  assert.deepEqual(parseWitsSettings(null), DEFAULT_WITS_SETTINGS);
  assert.deepEqual(parseWitsSettings('nope'), DEFAULT_WITS_SETTINGS);
  assert.deepEqual(parseWitsSettings([]), DEFAULT_WITS_SETTINGS);
  // 默认必须开启下注二次确认，避免误触
  assert.equal(DEFAULT_WITS_SETTINGS.confirmBets, true);
});

test('witsSettings: 单项损坏只回落该项，保留其余用户设置', () => {
  const parsed = parseWitsSettings({
    soundVolume: 'loud',
    theme: 'midnight',
    confirmBets: false,
    fontScale: Number.NaN,
    compact: true,
  });

  assert.equal(parsed.soundVolume, DEFAULT_WITS_SETTINGS.soundVolume);
  assert.equal(parsed.fontScale, DEFAULT_WITS_SETTINGS.fontScale);
  // 这两项是合法的，不能被连带丢弃
  assert.equal(parsed.theme, 'midnight');
  assert.equal(parsed.confirmBets, false);
  assert.equal(parsed.compact, true);
});

test('witsSettings: 数值越界被夹到合法区间', () => {
  assert.equal(parseWitsSettings({ soundVolume: 5 }).soundVolume, 1);
  assert.equal(parseWitsSettings({ soundVolume: -2 }).soundVolume, 0);
  assert.equal(parseWitsSettings({ fontScale: 9 }).fontScale, MAX_FONT_SCALE);
  assert.equal(parseWitsSettings({ fontScale: 0.1 }).fontScale, MIN_FONT_SCALE);
});

test('witsSettings: 未登记的主题回落默认', () => {
  assert.equal(parseWitsSettings({ theme: 'neon-pink' }).theme, DEFAULT_WITS_SETTINGS.theme);
});

test('witsSettings: 读写往返保真', () => {
  const storage = fakeStorage();
  const settings = { ...DEFAULT_WITS_SETTINGS, theme: 'walnut' as const, compact: true };
  writeWitsSettings(settings, storage);
  assert.deepEqual(readWitsSettings(storage), settings);
});

test('witsSettings: 存储为空或内容非法时返回默认', () => {
  assert.deepEqual(readWitsSettings(fakeStorage()), DEFAULT_WITS_SETTINGS);
  assert.deepEqual(
    readWitsSettings(fakeStorage({ [WITS_SETTINGS_STORAGE_KEY]: '{broken' })),
    DEFAULT_WITS_SETTINGS,
  );
});

test('fitToDeadline: 无截止时间时按计划时长播放', () => {
  assert.equal(fitToDeadline(4000, null, 1_000), 4000);
});

test('fitToDeadline: 预算充足时不压缩', () => {
  // deadline 还有 8 秒，预留 1.5 秒后仍够 4 秒演出
  assert.equal(fitToDeadline(4000, 9_000, 1_000), 4000);
});

test('fitToDeadline: 预算不足时压缩到可用窗口', () => {
  // deadline 只剩 4 秒，预留 1.5 秒 → 只能演 2.5 秒
  assert.equal(fitToDeadline(8000, 5_000, 1_000), 2500);
});

test('fitToDeadline: 已过截止或窗口耗尽时直接落终态', () => {
  assert.equal(fitToDeadline(4000, 1_200, 1_000), 0);
  assert.equal(fitToDeadline(4000, 500, 1_000), 0);
});

test('legDuration: 单笔收付不独吞整段预算', () => {
  // 只有一笔时若把 2600ms 全给它，筹码落袋后要干等两秒，看起来像卡住
  assert.equal(legDuration(2600, 1, 560), 560);
});

test('legDuration: 多笔时按笔数摊分', () => {
  assert.equal(legDuration(2400, 6, 560), 400);
  // 笔数很多时压到下限，宁可紧凑也不超出服务端阶段时长
  assert.equal(legDuration(2400, 40, 560), 160);
});

test('legDuration: 无预算或无收付时不播放', () => {
  assert.equal(legDuration(0, 3, 560), 0);
  assert.equal(legDuration(2400, 0, 560), 0);
});
