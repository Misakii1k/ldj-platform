import { useCallback, useEffect, useRef, useState } from 'react';

interface DragPanelOptions {
  /** 面板可向上拖动的最大像素（正值，等于底边可上移距离）。 */
  maxUp?: number;
  /** 松手吸附档位（像素，0 = 完全展开底部，负值越大越收起）。 */
  snapPoints?: number[];
}

interface DragHandle {
  /** 绑定到拖动手柄元素的 pointerdown 事件。 */
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  /** 当前垂直偏移（px），负 = 上移，供 CSS transform 使用。 */
  offsetY: number;
  /** 是否正在拖拽中（拖拽时关闭过渡动画以跟手）。 */
  dragging: boolean;
  /** 重置到默认位置（如重新打开时）。 */
  reset: () => void;
}

/**
 * 浮动面板拖拽 hook：以手柄为起点上下拖动，松手吸附到最近档位。
 * 用 Pointer Events + setPointerCapture，兼容鼠标/触摸/触控笔。
 */
export function useDragPanel(options: DragPanelOptions = {}): DragHandle {
  const { maxUp = 0, snapPoints = [0] } = options;
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const clamp = useCallback(
    (value: number) => {
      const min = -Math.max(0, maxUp);
      return Math.min(0, Math.max(min, value));
    },
    [maxUp],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (pointerIdRef.current === null) return;
      const delta = event.clientY - startRef.current;
      setOffsetY(clamp(baseRef.current + delta));
    },
    [clamp],
  );

  const handlePointerUp = useCallback(
    (_event: PointerEvent) => {
      if (pointerIdRef.current === null) return;
      pointerIdRef.current = null;
      elementRef.current = null;
      setDragging(false);
      // 吸附到最近档位
      setOffsetY((current) => {
        if (snapPoints.length === 0) return clamp(0);
        if (snapPoints.length === 1) return clamp(snapPoints[0] ?? 0);
        let best = snapPoints[0] ?? 0;
        let bestDist = Math.abs(current - best);
        for (const point of snapPoints.slice(1)) {
          const dist = Math.abs(current - point);
          if (dist < bestDist) {
            best = point;
            bestDist = dist;
          }
        }
        return clamp(best);
      });
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    },
    [clamp, handlePointerMove, snapPoints],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // 排除对手柄内交互控件（关闭按钮等）的点击
      const target = event.target as HTMLElement;
      if (target.closest('button, input, textarea, a, select')) return;
      event.preventDefault();
      pointerIdRef.current = event.pointerId;
      elementRef.current = event.currentTarget;
      startRef.current = event.clientY;
      baseRef.current = offsetY;
      setDragging(true);
      // 在 document 监听 move/up（不使用 setPointerCapture，避免事件被捕获元素独占而不冒泡）
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, offsetY],
  );

  const reset = useCallback(() => {
    setOffsetY(0);
    setDragging(false);
    pointerIdRef.current = null;
    elementRef.current = null;
  }, []);

  // 卸载时清理监听
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return { onPointerDown, offsetY, dragging, reset };
}
