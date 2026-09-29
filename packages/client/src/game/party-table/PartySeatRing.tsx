import React, { useEffect, useState } from 'react';
import { PartySticker } from './PartySticker';

export interface PartySeatItem {
  id: string;
  name: string;
  avatar?: React.ReactNode;
  handCount: number;
  isActive?: boolean;
  isOne?: boolean;
  bubbleText?: string;
}

export interface PartySeatRingProps {
  seats: readonly PartySeatItem[];
  className?: string;
}

function useIsMobilePartyRing(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(max-width: 480px)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(max-width: 480px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  return isMobile;
}

export const PartySeatRing: React.FC<PartySeatRingProps> = ({
  seats,
  className,
}) => {
  const isMobile = useIsMobilePartyRing();

  // 手机竖屏（用户 2026-09-28 反馈后收紧）：椭圆纵向半径 244→190、张角 72°→80°，
  // 让贴纸贴着圆盘上沿与两肋围合（桌面端参数不变）
  const rx = isMobile ? 150 : 400;
  const ry = isMobile ? 190 : 280;
  const spread = isMobile ? 80 : 100;
  const centerY = isMobile ? 40 : 44;

  const count = seats.length;

  return (
    <div className={`pt-ring-seats ${className ?? ''}`}>
      {seats.map((seat, k) => {
        const angleDeg =
          count <= 1
            ? 0
            : -spread + (2 * spread * k) / (count - 1);
        const angleRad = (angleDeg * Math.PI) / 180;
        const xOffset = Math.sin(angleRad) * rx;
        const yOffset = -Math.cos(angleRad) * ry;
        const rotDeg = Number(
          ((k % 2 === 1 ? 1 : -1) * (1.5 + (k % 3))).toFixed(1)
        );

        return (
          <PartySticker
            key={seat.id}
            id={seat.id}
            name={seat.name}
            avatar={seat.avatar}
            handCount={seat.handCount}
            isActive={seat.isActive}
            isOne={seat.isOne}
            isOpponent={true}
            bubbleText={seat.bubbleText}
            rotDeg={rotDeg}
            className="uno-opponent-station"
            style={{
              left: `calc(50% + ${xOffset.toFixed(1)}px)`,
              top: `calc(${centerY}% + ${yOffset.toFixed(1)}px)`,
            }}
          />
        );
      })}
    </div>
  );
};
