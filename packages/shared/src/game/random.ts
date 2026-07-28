/**
 * 种子化随机源（SPEC §8.5 GameContext.random）。
 * 由持久化种子 + 抽取游标驱动：相同 (seed, cursor) 序列完全一致，
 * 恢复时以已持久化的 cursor 快进即可续接（确定性重放的基础）。
 */
import type { RandomSource } from './contract.ts';

/** FNV-1a 32 位字符串散列，把任意种子字符串折叠为 u32 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：小而稳定的 PRNG，足够游戏洗牌用途（非密码学） */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRandom extends RandomSource {
  /** 当前抽取游标；持久化后可用于恢复续接 */
  getCursor(): number;
}

export function createSeededRandom(seed: string, cursor = 0): SeededRandom {
  const next = mulberry32(hashSeed(seed));
  let used = 0;
  // 快进到指定游标
  for (; used < cursor; used++) next();

  const draw = (): number => {
    used += 1;
    return next();
  };

  return {
    nextInt(minInclusive, maxExclusive) {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive))
        throw new RangeError('nextInt 需要整数边界');
      if (maxExclusive <= minInclusive) throw new RangeError('nextInt 区间为空');
      return minInclusive + Math.floor(draw() * (maxExclusive - minInclusive));
    },
    shuffle(items) {
      // Fisher–Yates；对 n 个元素固定消耗 n-1 次抽取，保证游标可预测
      const arr = [...items];
      for (let i = arr.length - 1; i >= 1; i--) {
        const j = minInt0(draw(), i + 1);
        // i、j 均在界内，非空断言绕过 noUncheckedIndexedAccess
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      return arr;
    },
    getCursor() {
      return used;
    },
  };
}

function minInt0(unit: number, maxExclusive: number): number {
  return Math.floor(unit * maxExclusive);
}
