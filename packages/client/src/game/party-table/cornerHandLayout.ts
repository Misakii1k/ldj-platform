/**
 * 派对桌（UNO / Ding）牌多角标收紧算法与颜色归堆纯函数
 * 规格契约：contracts/uno.md §4.3
 */

export interface CornerHandLayoutInput {
  /** 手牌总张数 */
  count: number;
  /** 单张牌宽（px） */
  cardWidth: number;
  /** 当前视口可用总宽（px，桌面通常 820，手机通常 350） */
  availableWidth: number;
  /** 基础重叠量（px，负数，桌面通常 -24，手机通常 -20） */
  baseOverlap: number;
}

export interface CornerHandLayoutResult {
  /** 计算出的单张重叠量（px，负数） */
  overlap: number;
  /** 是否进入紧凑角标模式（露出宽度 < 牌宽 × 0.42） */
  tight: boolean;
  /** 扇形单张倾斜度（紧凑模式收窄为 0.5deg，正常模式为 2.4deg） */
  tiltDeg: number;
  /** 排开后的整体总宽度（px） */
  totalWidth: number;
}

/**
 * 计算角标收紧重叠量与紧凑模式
 */
export function computeCornerHand(input: CornerHandLayoutInput): CornerHandLayoutResult {
  const { count, cardWidth, availableWidth, baseOverlap } = input;
  if (count <= 0) {
    return { overlap: baseOverlap, tight: false, tiltDeg: 2.4, totalWidth: 0 };
  }
  if (count === 1) {
    return { overlap: baseOverlap, tight: false, tiltDeg: 0, totalWidth: cardWidth };
  }

  // need = -(cardWidth - (availableWidth - cardWidth) / (count - 1))
  const need = -(cardWidth - (availableWidth - cardWidth) / (count - 1));
  const overlap = Math.min(baseOverlap, need);
  const exposedWidth = cardWidth + overlap;
  const tight = exposedWidth < cardWidth * 0.42;
  const tiltDeg = tight ? 0.5 : 2.4;
  const totalWidth = cardWidth + (count - 1) * (cardWidth + overlap);

  return { overlap, tight, tiltDeg, totalWidth };
}

const COLOR_ORDER: Record<string, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
};

/**
 * 手牌按颜色归堆：红 → 黄 → 绿 → 蓝 → 万能 / 其他
 * 同色内保持原有相对顺序（稳定排序）
 */
export function sortByColor<T>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    const colorA = (a as { color?: string }).color;
    const colorB = (b as { color?: string }).color;
    const orderA = colorA && colorA in COLOR_ORDER ? COLOR_ORDER[colorA]! : 99;
    const orderB = colorB && colorB in COLOR_ORDER ? COLOR_ORDER[colorB]! : 99;
    return orderA - orderB;
  });
}
