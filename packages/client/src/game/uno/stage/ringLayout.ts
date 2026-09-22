/**
 * 椭圆弧环形席位定位。
 *
 * UNO 竖屏下需要把对手按座次环绕摆放，让「往哪个方向转、下一个是谁」由空间位置
 * 直接读出，而不是靠文字符号推断。三个要点：
 *
 * 1. 按弧长而非等角度均分 —— 椭圆 rx≠ry 时等角度并不等弧长，直接用角度均分会让
 *    视觉间隔明显不匀（中间密、两端疏）。
 * 2. 弧心对齐中央牌堆而非容器几何中心 —— 牌堆上下留白不对称，用容器中心会让底部
 *    两侧的站位正好压上去。
 * 3. 弧形参数在运行时按实际几何求解，不查固定表 —— 容器尺寸随视口/横竖屏变化很大
 *    （实测 364×521 与 343×414 都出现过），针对某一尺寸预算的参数换个视口就失效。
 *
 * 求解：在（张角 × 纵向压扁 × 横向收缩）的小网格里枚举，过滤掉重叠 / 出界 / 压牌堆
 * 的组合，剩下的按「相邻间距均匀优先、最小间距最大次之」排序取首。网格约 400 点，
 * 每点 O(n²) 碰撞检测，n≤5，单次求解远低于 1ms，只在 resize 时触发。
 */

export interface RingPoint {
  /** 容器内横坐标（px），站位盒中心；CSS 用负 margin 居中 */
  readonly left: number;
  /** 容器内纵坐标（px），站位盒中心 */
  readonly top: number;
  /**
   * 站位缩放比（0.6~1）。容器过窄时 5 个全尺寸站位在数学上放不下，
   * 此时整体缩小而不是让它们互相压盖。
   */
  readonly scale: number;
}

/** 中央牌堆相对容器的实测盒 */
export interface PileBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * 站位盒尺寸（与 .uno-opponent-station 的 CSS 对应）。
 * 高度是内容撑出来的（头像 + 名字 + 张数徽章，多局赛还多一行积分），
 * 真实浏览器量得 CSS 高约 111.6px —— 不能凭外观估成 96，否则求解器
 * 以为放得下、实际渲染出来仍然重叠。留一点余量取 114。
 */
export const RING_STATION_WIDTH = 70;
export const RING_STATION_HEIGHT = 114;

/** 站位之间 / 站位与牌堆之间的最小安全间距 */
const GAP = 8;
/** 站位到容器边缘的最小边距 */
const EDGE = 2;

/** 弧长积分的细分段数 */
const SUBDIVISIONS = 600;

interface Box { l: number; r: number; t: number; b: number }

function boxOf(cx: number, cy: number, w: number, h: number): Box {
  return { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
}

function hits(a: Box, b: Box, gap: number): boolean {
  return !(a.r + gap <= b.l || b.r + gap <= a.l || a.b + gap <= b.t || b.b + gap <= a.t);
}

/** 在指定椭圆弧上按弧长等距取 n 点 */
function sampleArc(
  count: number, cx: number, cy: number, rx: number, ry: number, spanDeg: number,
): { x: number; y: number }[] {
  const half = (spanDeg * Math.PI) / 360;
  const a0 = Math.PI / 2 + half;
  const a1 = Math.PI / 2 - half;
  const at = (t: number) => {
    const a = a0 + (a1 - a0) * t;
    return { x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) };
  };
  const cum: number[] = [0];
  let prev = at(0);
  for (let i = 1; i <= SUBDIVISIONS; i += 1) {
    const cur = at(i / SUBDIVISIONS);
    cum.push(cum[i - 1]! + Math.hypot(cur.x - prev.x, cur.y - prev.y));
    prev = cur;
  }
  const total = cum[SUBDIVISIONS]!;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < count; k += 1) {
    const target = (total * (k + 1)) / (count + 1);
    let lo = 0;
    let hi = SUBDIVISIONS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    out.push(at(lo / SUBDIVISIONS));
  }
  return out;
}

interface Candidate {
  points: { x: number; y: number }[];
  spread: number;
  minGap: number;
}

/**
 * 计算 n 个站位在椭圆弧上的位置。
 *
 * @param count 对手数量
 * @param width 容器宽度（px）
 * @param height 容器高度（px）
 * @param pile 中央牌堆相对容器的实测盒；缺省按容器中心 160×112 估算
 */
export function computeRingPositions(
  count: number,
  width: number,
  height: number,
  pile?: PileBox,
): RingPoint[] {
  if (count <= 0 || width <= 0 || height <= 0) return [];

  const pileBox: Box = pile
    ? { l: pile.left, r: pile.right, t: pile.top, b: pile.bottom }
    : boxOf(width / 2, height / 2, 160, 112);
  const cx = width / 2;
  const cy = (pileBox.t + pileBox.b) / 2;

  // 单人放正上方即可，不必张开
  const spans = count === 1 ? [60] : [150, 180, 210, 240, 260, 280, 300, 320];
  const rxFactors = [1, 0.95, 0.9, 0.85, 0.8];
  const ryFactors = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
  // 从全尺寸开始试；容器放不下 n 个全尺寸站位时逐级缩小，
  // 而不是让它们互相压盖或压住牌堆
  const scales = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.65, 0.6];

  for (const scale of scales) {
    const sw = RING_STATION_WIDTH * scale;
    const sh = RING_STATION_HEIGHT * scale;
    const gap = GAP * scale;
    const maxRx = (width - sw) / 2 - EDGE;
    const maxRy = Math.max(cy - sh / 2 - EDGE, 0);
    let best: Candidate | null = null;

    for (const span of spans) {
      for (const rxF of rxFactors) {
        for (const ryF of ryFactors) {
          const rx = maxRx * rxF;
          const ry = maxRy * ryF;
          if (rx <= 0 || ry <= 0) continue;
          const points = sampleArc(count, cx, cy, rx, ry, span);
          const boxes = points.map((p) => boxOf(p.x, p.y, sw, sh));

          let ok = true;
          for (const bx of boxes) {
            if (bx.l < EDGE || bx.r > width - EDGE || bx.t < EDGE || bx.b > height - EDGE) { ok = false; break; }
            if (hits(bx, pileBox, gap)) { ok = false; break; }
          }
          if (!ok) continue;
          for (let a = 0; a < boxes.length && ok; a += 1) {
            for (let b = a + 1; b < boxes.length; b += 1) {
              if (hits(boxes[a]!, boxes[b]!, gap)) { ok = false; break; }
            }
          }
          if (!ok) continue;

          let minGap = Infinity;
          let maxGap = 0;
          for (let i = 0; i < points.length - 1; i += 1) {
            const d = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
            minGap = Math.min(minGap, d);
            maxGap = Math.max(maxGap, d);
          }
          if (points.length < 2) { minGap = Infinity; maxGap = 0; }
          const spread = maxGap - (minGap === Infinity ? 0 : minGap);

          const cand: Candidate = { points, spread, minGap };
          if (!best) { best = cand; continue; }
          // 间距均匀（极差 ≤4px）优先；同为均匀时取最小间距更大者；否则取极差更小者
          const bestEven = best.spread <= 4;
          const candEven = cand.spread <= 4;
          if (candEven && !bestEven) best = cand;
          else if (candEven === bestEven) {
            if (candEven ? cand.minGap > best.minGap : cand.spread < best.spread) best = cand;
          }
        }
      }
    }

    if (best) return best.points.map((p) => ({ left: p.x, top: p.y, scale }));
  }

  // 连最小缩放都放不下（极端窄矮容器）：退化为最紧凑上弧，保证不崩
  const scale = scales[scales.length - 1]!;
  const maxRx = (width - RING_STATION_WIDTH * scale) / 2 - EDGE;
  const maxRy = Math.max(cy - (RING_STATION_HEIGHT * scale) / 2 - EDGE, 0);
  return sampleArc(count, cx, cy, maxRx, maxRy, 180)
    .map((p) => ({ left: p.x, top: p.y, scale }));
}
