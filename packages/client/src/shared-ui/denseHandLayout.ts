/**
 * 稠密手牌布局（UNO 专用策略）。
 *
 * 通用 CardFanEngine 的等距扇形在手牌 ≥14 张时每张只露 24%，22 张后横向溢出。
 * UNO 的 +2/+4 连环罚牌很容易把手牌堆到 20 张以上，所以需要专门的策略：
 *
 * A · 可出牌前置抬升（主策略）
 *    UNO 决策只关心「现在能出的那几张」（playableCardIds 视图里已给）。
 *    不可出的牌压到很窄只留色条，可出的牌保留全宽并抬升——视觉焦点自然落在决策点上，
 *    单击即出。手牌多时通常只有 1~3 张能出，这覆盖了绝大多数局面。
 *
 * B · 双排兜底
 *    连 A 也放不下时（罚牌链把手牌堆到 20+），拆成两道弧。全部可见、保留扇形手感，
 *    代价是底栏变高。只在 A 撑不住时触发，普通局面永远是一排。
 *
 * 纯函数，无 DOM 依赖，方便几何回归。
 */

export interface DenseCard {
  readonly id: string;
  readonly playable: boolean;
}

export interface DensePlacement {
  readonly id: string;
  /** 相对容器中心的横向偏移（px） */
  readonly x: number;
  /** 0 = 前排，1 = 后排（仅双排模式） */
  readonly row: 0 | 1;
  /** 可出牌抬升量（px，正值向上） */
  readonly lift: number;
  /** 扇形角度（度） */
  readonly angle: number;
  readonly playable: boolean;
}

export interface DenseLayout {
  readonly placements: DensePlacement[];
  /** 'fan' = 普通扇形（交回通用引擎）；'dense' = A；'double' = B */
  readonly mode: 'fan' | 'dense' | 'double';
  /** 双排时后排相对前排的纵向偏移（px） */
  readonly rowOffsetY: number;
  /** 是否有可出牌被抬升 */
  readonly hasLifted: boolean;
}

export interface DenseLayoutOptions {
  readonly cardWidth: number;
  readonly containerWidth: number;
  /** 超过此张数才启用稠密策略，之下交回通用扇形 */
  readonly denseThreshold?: number;
  /** 不可出牌的最小露出宽度（px） */
  readonly minDisabledStep?: number;
  /** 可出牌的露出宽度（px），应接近牌宽以便完整可读 */
  readonly playableStep?: number;
  /** 可出牌抬升量（px） */
  readonly playableLift?: number;
  /** 双排时后排纵向上移（px） */
  readonly doubleRowOffsetY?: number;
}

const DEFAULTS = {
  denseThreshold: 12,
  minDisabledStep: 9,
  /** 可出牌露出宽度：牌宽 76 时约 79%，足以读出颜色 + 数字 */
  playableStep: 60,
  playableLift: 18,
  doubleRowOffsetY: -46,
} as const;

/**
 * 单排稠密布局：可出牌占 playableStep，不可出牌尽量占 minDisabledStep，
 * 若总跨度仍超出可用宽度，则按比例压缩不可出牌步进（不低于 minDisabledStep 的 60%）。
 * 返回 null 表示单排放不下。
 */
function layoutSingleRow(
  cards: readonly DenseCard[],
  cardWidth: number,
  usable: number,
  o: Required<DenseLayoutOptions>,
): DensePlacement[] | null {
  const playableCount = cards.filter((c) => c.playable).length;
  const disabledCount = cards.length - playableCount;
  // 相邻两张的中心距之和 = 总跨度；最后一张还要加上自身宽度
  const idealSpan = playableCount * o.playableStep + disabledCount * o.minDisabledStep;
  const available = usable - cardWidth;

  let disabledStep = o.minDisabledStep;
  let playableStep = o.playableStep;
  if (idealSpan > available) {
    // 先压不可出牌，最低到 minDisabledStep 的 60%
    const floor = o.minDisabledStep * 0.6;
    const needFromDisabled = idealSpan - available;
    const canSqueeze = disabledCount * (o.minDisabledStep - floor);
    if (needFromDisabled <= canSqueeze) {
      disabledStep = o.minDisabledStep - needFromDisabled / Math.max(disabledCount, 1);
    } else {
      // 不可出牌压到底仍不够：再压可出牌。但可出牌是决策点，必须保持基本完整可读，
      // 压到牌宽 72% 以下就认为 A 策略已失效，交给 B（双排）而不是继续硬挤。
      disabledStep = floor;
      const remaining = needFromDisabled - canSqueeze;
      const playableFloor = cardWidth * 0.72;
      const canSqueezePlayable = playableCount * (o.playableStep - playableFloor);
      if (playableCount > 0 && remaining <= canSqueezePlayable) {
        playableStep = o.playableStep - remaining / playableCount;
      } else {
        return null;
      }
    }
  }

  // 按顺序摆放，累计 x
  const steps = cards.map((c) => (c.playable ? playableStep : disabledStep));
  const totalSpan = steps.slice(0, -1).reduce((a, b) => a + b, 0);
  const out: DensePlacement[] = [];
  let x = -totalSpan / 2;
  const n = cards.length;
  cards.forEach((c, i) => {
    // 轻微扇形角：从 -8° 到 +8°，避免完全平铺显得死板
    const angle = n > 1 ? -8 + (16 * i) / (n - 1) : 0;
    out.push({
      id: c.id,
      x,
      row: 0,
      lift: c.playable ? o.playableLift : 0,
      angle,
      playable: c.playable,
    });
    if (i < n - 1) x += steps[i]!;
  });
  return out;
}

/**
 * 双排布局：奇偶交错分到两排，各排内部用与单排相同的压缩逻辑。
 * 后排整体上移 doubleRowOffsetY，前排压住后排的下半段。
 */
function layoutDoubleRow(
  cards: readonly DenseCard[],
  cardWidth: number,
  usable: number,
  o: Required<DenseLayoutOptions>,
): DensePlacement[] {
  const front: DenseCard[] = [];
  const back: DenseCard[] = [];
  cards.forEach((c, i) => (i % 2 === 0 ? front : back).push(c));

  const place = (row: DenseCard[], rowIdx: 0 | 1): DensePlacement[] => {
    const single = layoutSingleRow(row, cardWidth, usable, o);
    if (single) return single.map((p) => ({ ...p, row: rowIdx }));
    // 双排的单排仍放不下：等距硬压到可用宽度
    const n = row.length;
    const step = n > 1 ? Math.max((usable - cardWidth) / (n - 1), 6) : 0;
    const start = -((n - 1) * step) / 2;
    return row.map((c, i) => ({
      id: c.id,
      x: start + i * step,
      row: rowIdx,
      lift: c.playable ? o.playableLift : 0,
      angle: n > 1 ? -8 + (16 * i) / (n - 1) : 0,
      playable: c.playable,
    }));
  };

  // 保持原始手牌顺序，便于引擎按 id 找回位置
  const byId = new Map<string, DensePlacement>();
  for (const p of place(front, 0)) byId.set(p.id, p);
  for (const p of place(back, 1)) byId.set(p.id, p);
  return cards.map((c) => byId.get(c.id)!);
}

export function computeDenseHandLayout(
  cards: readonly DenseCard[],
  options: DenseLayoutOptions,
): DenseLayout {
  // 注意用 ?? 逐项取：展开语法下 options 里显式的 undefined 会覆盖掉 DEFAULTS
  const o: Required<DenseLayoutOptions> = {
    cardWidth: options.cardWidth,
    containerWidth: options.containerWidth,
    denseThreshold: options.denseThreshold ?? DEFAULTS.denseThreshold,
    minDisabledStep: options.minDisabledStep ?? DEFAULTS.minDisabledStep,
    playableStep: options.playableStep ?? DEFAULTS.playableStep,
    playableLift: options.playableLift ?? DEFAULTS.playableLift,
    doubleRowOffsetY: options.doubleRowOffsetY ?? DEFAULTS.doubleRowOffsetY,
  };
  const { cardWidth, containerWidth } = o;
  const usable = Math.max(140, Math.min(containerWidth - 16, 760));

  if (cards.length <= o.denseThreshold) {
    return { placements: [], mode: 'fan', rowOffsetY: 0, hasLifted: false };
  }

  const single = layoutSingleRow(cards, cardWidth, usable, o);
  if (single) {
    return {
      placements: single,
      mode: 'dense',
      rowOffsetY: 0,
      hasLifted: single.some((p) => p.lift > 0),
    };
  }

  const double = layoutDoubleRow(cards, cardWidth, usable, o);
  return {
    placements: double,
    mode: 'double',
    rowOffsetY: o.doubleRowOffsetY,
    hasLifted: double.some((p) => p.lift > 0),
  };
}
