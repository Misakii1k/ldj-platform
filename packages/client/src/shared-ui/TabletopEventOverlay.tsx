import React, { useEffect, useRef, useState } from 'react';
import { useMotion } from '../motion/MotionContext.tsx';

/**
 * 关键瞬间的全屏反馈层：拍铃、质疑判决、阵营揭示、投票揭晓、UNO 喊牌。
 *
 * 统一「大事件」的呈现与降级：full 档播放盖印/爆裂动效，reduced 以下直接静态横幅，
 * off 档只保留文字（仍然可见、可读，因为它是信息而不是装饰）。
 */
export type TabletopEventVariant = 'stamp' | 'burst' | 'reveal' | 'warning';

export interface TabletopEventOverlayProps {
  readonly open: boolean;
  readonly variant?: TabletopEventVariant;
  readonly label: React.ReactNode;
  readonly sublabel?: React.ReactNode;
  /** 自动关闭时长；给 0 表示由调用方自己关闭。 */
  readonly durationMs?: number;
  readonly onComplete?: () => void;
}

export function TabletopEventOverlay({
  open,
  variant = 'stamp',
  label,
  sublabel,
  durationMs = 1400,
  onComplete,
}: TabletopEventOverlayProps) {
  const { level } = useMotion();
  const [visible, setVisible] = useState(open);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }
    setVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open || durationMs <= 0) return;
    const timerId = window.setTimeout(() => {
      setVisible(false);
      onCompleteRef.current?.();
    }, durationMs);
    return () => window.clearTimeout(timerId);
  }, [open, durationMs, label]);

  if (!visible) return null;

  return (
    <div
      className="tabletop-event-overlay"
      data-motion-level={level}
      data-variant={variant}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="tabletop-event-overlay__card">
        <p className="tabletop-event-overlay__label">{label}</p>
        {sublabel !== undefined && <p className="tabletop-event-overlay__sub">{sublabel}</p>}
      </div>
    </div>
  );
}
