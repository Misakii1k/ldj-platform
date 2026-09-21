/**
 * FLIP 飞行工具（Web Animations API）。
 *
 * 为什么不用 framer-motion 的 layoutId：飞行的起终点跨越不同 DOM 子树
 * （底部托盘 ↔ 毡面槽位 ↔ 顶部座位条 ↔ 银行），而毡面是 preserve-3d 容器，
 * 布局动画在 3D 上下文里落点会偏。这里改为在 3D 子树之外用 fixed 幽灵层飞，
 * 起终点都取 getBoundingClientRect 的屏幕投影，落点稳定且天然可 abort。
 */

export interface FlightOptions {
  readonly durationMs?: number;
  readonly easing?: string;
  readonly delayMs?: number;
  /** 抛物线拱高（px），0 为直线 */
  readonly arc?: number;
  readonly signal?: AbortSignal;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function measure(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** 按锚点属性查找舞台元素。 */
export function measureAnchor(root: ParentNode | null, anchor: string): Rect | null {
  if (!root) return null;
  return measure(root.querySelector(`[data-ww-anchor="${CSS.escape(anchor)}"]`));
}

function center(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * 让一个已存在于 DOM 的幽灵节点从 from 飞到 to。
 *
 * 节点必须是 position:fixed 且不在任何 transform 祖先内，否则 fixed 会退化为相对定位。
 * 返回的 Promise 在动画结束或被 abort 时 resolve —— abort 不 reject，
 * 因为中断演出是正常流程（换轮、阶段跳变），调用方不该为此写 try/catch。
 */
export function flyGhost(
  ghost: HTMLElement,
  from: Rect,
  to: Rect,
  options: FlightOptions = {},
): Promise<void> {
  const {
    durationMs = 420,
    easing = 'cubic-bezier(0.2, 0, 0.1, 1)',
    delayMs = 0,
    arc = 0,
    signal,
  } = options;

  if (signal?.aborted || durationMs <= 0) {
    return Promise.resolve();
  }

  const a = center(from);
  const b = center(to);
  const scale = from.width > 0 ? Math.min(1.6, Math.max(0.4, to.width / from.width)) : 1;

  ghost.style.position = 'fixed';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.willChange = 'transform';

  const originX = a.x - from.width / 2;
  const originY = a.y - from.height / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const keyframes: Keyframe[] = [
    { transform: `translate(${originX}px, ${originY}px) scale(1)`, offset: 0 },
  ];

  if (arc !== 0) {
    keyframes.push({
      transform: `translate(${originX + dx / 2}px, ${originY + dy / 2 - arc}px) scale(${(1 + scale) / 2})`,
      offset: 0.5,
    });
  }

  keyframes.push({
    transform: `translate(${originX + dx}px, ${originY + dy}px) scale(${scale})`,
    offset: 1,
  });

  const animation = ghost.animate(keyframes, {
    duration: durationMs,
    delay: delayMs,
    easing,
    fill: 'forwards',
  });

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      try {
        animation.cancel();
      } catch {
        // 动画可能已结束
      }
      finish();
    };

    animation.addEventListener('finish', finish);
    animation.addEventListener('cancel', finish);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 可被 abort 的等待，用于演出节拍之间的停顿。 */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 把一段演出的总时长压进 deadline 之内。
 *
 * 服务端的阶段展示时长是硬约束：演出只能压缩间隔，绝不能让阶段等动画。
 * 预留 reserveMs 给"落位后还要看一眼"的停顿。
 */
export function fitToDeadline(
  plannedMs: number,
  deadlineAt: number | null,
  now: number,
  reserveMs = 1500,
): number {
  if (deadlineAt === null) return plannedMs;
  const budget = deadlineAt - now - reserveMs;
  if (budget <= 0) return 0;
  return Math.min(plannedMs, budget);
}

/**
 * 每笔收付的节拍。
 *
 * 预算要摊给各笔，但单笔有上限：人少时若把整段预算都给一笔，
 * 筹码落袋后会干等一大截，看起来像卡住了。
 */
export function legDuration(
  budgetMs: number,
  legs: number,
  maxLegMs: number,
  minLegMs = 160,
): number {
  if (legs <= 0 || budgetMs <= 0) return 0;
  return Math.min(maxLegMs, Math.max(minLegMs, Math.floor(budgetMs / legs)));
}
