import React, { useEffect, useRef, useState } from 'react';

export type PartyColor = 'red' | 'yellow' | 'green' | 'blue';

export interface PartyClothProps {
  color: PartyColor;
  originRef?: React.RefObject<HTMLElement | null>;
  art?: string[];
  className?: string;
}

const DEFAULT_ART = ['7', '+2', '⇄', '★'];
const ART_LAYOUT = [
  { left: 4, top: 8, rot: -14 },
  { left: 80, top: 6, rot: 12 },
  { left: 8, top: 58, rot: 10 },
  { left: 78, top: 60, rot: -8 },
];

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

export const PartyCloth: React.FC<PartyClothProps> = ({
  color,
  originRef,
  art = DEFAULT_ART,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [floorColor, setFloorColor] = useState<PartyColor>(color);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeOrigin, setWipeOrigin] = useState<{ wx: string; wy: string }>({
    wx: '50%',
    wy: '44%',
  });
  const prevColorRef = useRef<PartyColor>(color);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevColorRef.current === color) {
      return;
    }
    prevColorRef.current = color;

    const motion = getMotionLevel();
    if (motion === 'minimal' || motion === 'off') {
      setFloorColor(color);
      setIsWiping(false);
      return;
    }

    // 计算泼色起点坐标（弃牌堆位置或默认 50%, 44%）
    let nextWx = '50%';
    let nextWy = '44%';
    if (originRef?.current && containerRef.current) {
      const originRect = originRef.current.getBoundingClientRect();
      const parentRect = containerRef.current.getBoundingClientRect();
      if (parentRect.width > 0 && parentRect.height > 0) {
        const ox = originRect.left + originRect.width / 2 - parentRect.left;
        const oy = originRect.top + originRect.height / 2 - parentRect.top;
        nextWx = `${((ox / parentRect.width) * 100).toFixed(1)}%`;
        nextWy = `${((oy / parentRect.height) * 100).toFixed(1)}%`;
      }
    }

    setWipeOrigin({ wx: nextWx, wy: nextWy });
    setIsWiping(false);

    // 下一帧触发动画
    const animFrame = requestAnimationFrame(() => {
      setIsWiping(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // 580ms 定时兜底：即便后台标签页未触发 animationend 也确保落色
      timerRef.current = setTimeout(() => {
        setFloorColor(color);
        setIsWiping(false);
        timerRef.current = null;
      }, 580);
    });

    return () => {
      cancelAnimationFrame(animFrame);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [color, originRef]);

  return (
    <div ref={containerRef} className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        className="pt-cloth"
        style={{ background: `var(--pt-${floorColor})` }}
      />
      <div
        className={`pt-wipe ${isWiping ? 'run' : ''}`}
        style={{
          background: `var(--pt-${color})`,
          ['--wx' as string]: wipeOrigin.wx,
          ['--wy' as string]: wipeOrigin.wy,
        }}
      />
      <div className="pt-cloth-art" aria-hidden="true">
        {art.slice(0, 4).map((symbol, idx) => {
          const layout = ART_LAYOUT[idx] ?? { left: 4, top: 8, rot: -14 };
          return (
            <span
              key={idx}
              style={{
                left: `${layout.left}%`,
                top: `${layout.top}%`,
                ['--r' as string]: `${layout.rot}deg`,
              }}
            >
              {symbol}
            </span>
          );
        })}
      </div>
    </div>
  );
};
