import React, { useEffect, useRef, useState } from 'react';

export type PartySlamKind =
  | 'draw4'
  | 'draw2'
  | 'reverse'
  | 'skip'
  | 'uno'
  | 'ding'
  | 'phrase'
  | 'miss'
  | '';

export interface PartySlamProps {
  text?: string;
  kind?: PartySlamKind;
  ghostCard?: React.ReactNode;
  triggerKey?: string | number;
  className?: string;
}

function getMotionLevel(): 'full' | 'reduced' | 'minimal' | 'off' {
  if (typeof document === 'undefined') return 'full';
  const level = document.documentElement.getAttribute('data-motion-level');
  if (level === 'reduced' || level === 'minimal' || level === 'off') {
    return level;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return 'reduced';
  }
  return 'full';
}

export const PartySlam: React.FC<PartySlamProps> = ({
  text,
  kind = '',
  ghostCard,
  triggerKey,
  className,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text && !ghostCard) {
      setIsPlaying(false);
      return;
    }

    const motion = getMotionLevel();
    // minimal / off 档不渲染冲屏大字与残影（阶段牌由外部接管）
    if (motion === 'minimal' || motion === 'off') {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(false);
    const frame = requestAnimationFrame(() => {
      setIsPlaying(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setIsPlaying(false);
        timerRef.current = null;
      }, 950);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [triggerKey, text, ghostCard]);

  const motion = getMotionLevel();
  if (motion === 'minimal' || motion === 'off') {
    return null;
  }

  // 只有播放窗口内才挂载：防止调用方持有过期 text 导致冲屏字永久残留
  if (!isPlaying) {
    return null;
  }

  return (
    <>
      {ghostCard ? (
        <div
          className={`pt-ghost-big ${isPlaying ? 'run' : ''}`}
          aria-hidden="true"
        >
          {ghostCard}
        </div>
      ) : null}
      {text ? (
        <div
          className={`pt-slam-fx ${isPlaying ? 'run' : ''} ${className ?? ''}`}
          data-kind={kind}
          aria-live="polite"
        >
          <span className="word">{text}</span>
        </div>
      ) : null}
    </>
  );
};
