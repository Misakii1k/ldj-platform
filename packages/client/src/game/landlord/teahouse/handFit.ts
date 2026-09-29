/**
 * 斗地主茶馆手牌重叠度算法（纯函数）。
 *
 * 契约：contracts/landlord.md §4.5
 * 照搬 r2/_teahouse.js 的 fitHand：
 *   overlap = min(baseOverlap, -(cardWidth - (availableWidth - cardWidth) / (count - 1)))
 *
 * 典型参数：
 *   - 桌面：availableWidth = 900, baseOverlap = -38
 *   - 手机横屏：availableWidth = 400（叫分阶段 340），baseOverlap = -24
 */

export interface TeahouseHandOverlapParams {
  count: number;
  cardWidth: number;
  availableWidth: number;
  baseOverlap?: number;
}

/**
 * 计算手牌负边距（重叠值）。
 *
 * @returns 负数（如 -38px），表示每张牌（除首张外）向左偏移的 margin-left 像素。
 */
export function computeTeahouseHandOverlap({
  count,
  cardWidth,
  availableWidth,
  baseOverlap = -38,
}: TeahouseHandOverlapParams): number {
  if (count <= 1 || cardWidth <= 0) return 0;
  const avail = Math.max(cardWidth, availableWidth);
  const need = -(cardWidth - (avail - cardWidth) / (count - 1));
  return Math.min(baseOverlap, need);
}

/**
 * 计算整排手牌在指定张数、牌宽和重叠值下的实际总宽度。
 */
export function computeTeahouseHandTotalWidth(
  count: number,
  cardWidth: number,
  overlap: number,
): number {
  if (count <= 0 || cardWidth <= 0) return 0;
  if (count === 1) return cardWidth;
  const step = cardWidth + overlap;
  return cardWidth + (count - 1) * step;
}
