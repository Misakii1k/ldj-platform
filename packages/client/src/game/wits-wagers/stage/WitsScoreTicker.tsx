import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../../../motion/MotionContext.tsx';

export interface WitsScoreTickerProps {
  readonly value: number;
  readonly durationMs?: number;
  readonly className?: string;
}

/**
 * 积分滚动。低动效档位直接显示终值——这里的数字是真实积分，
 * 任何时刻显示的中间值都只是过渡，不能被当作结算结果。
 */
export function WitsScoreTicker({ value, durationMs = 640, className = '' }: WitsScoreTickerProps) {
  const { level } = useMotion();
  const animated = level === 'full' || level === 'reduced';
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (!animated || durationMs <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // easeOutCubic：起步快、落定稳，和筹码落位的节奏一致
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, animated, durationMs]);

  return (
    <span className={`ww-score-ticker ${className}`.trim()} data-value={value}>
      {display}
    </span>
  );
}
