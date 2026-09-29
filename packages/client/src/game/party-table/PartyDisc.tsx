import React, { useEffect, useRef } from 'react';

export interface PartyDiscProps {
  direction?: 'cw' | 'ccw';
  children?: React.ReactNode;
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

export const PartyDisc: React.FC<PartyDiscProps> = ({
  direction = 'cw',
  children,
  className,
}) => {
  const ringRef = useRef<HTMLDivElement>(null);
  const prevDirRef = useRef(direction);

  useEffect(() => {
    if (prevDirRef.current !== direction) {
      prevDirRef.current = direction;
      const motion = getMotionLevel();
      if (motion !== 'minimal' && motion !== 'off' && ringRef.current) {
        ringRef.current.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)' },
            { transform: 'translate(-50%, -50%) scale(1.2)' },
            { transform: 'translate(-50%, -50%) scale(1)' },
          ],
          { duration: 480, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
        );
      }
    }
  }, [direction]);

  return (
    <>
      <div className={`pt-disc ${className ?? ''}`} />
      <div
        ref={ringRef}
        className={`pt-dir-ring ${direction === 'ccw' ? 'ccw' : ''}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="94" />
          <path d="M100 0 l12 6 -12 6 z" />
          <path d="M100 200 l-12 -6 12 -6 z" />
          <path d="M0 100 l6 -12 6 12 z" />
          <path d="M200 100 l-6 12 -6 -12 z" />
        </svg>
      </div>
      {children ? <div className="pt-core">{children}</div> : null}
    </>
  );
};
