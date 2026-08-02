import { useEffect, type RefObject } from 'react';

export function useHomeParallax(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!pointerQuery.matches) return;

    let frameId = 0;
    let x = 0;
    let y = 0;

    const applyPosition = () => {
      frameId = 0;
      root.style.setProperty('--motion-x', x.toFixed(3));
      root.style.setProperty('--motion-y', y.toFixed(3));
    };

    const schedulePosition = () => {
      if (frameId === 0 && !document.hidden) frameId = requestAnimationFrame(applyPosition);
    };

    const handlePointerMove = (event: PointerEvent) => {
      x = (event.clientX / window.innerWidth - 0.5) * 2;
      y = (event.clientY / window.innerHeight - 0.5) * 2;
      schedulePosition();
    };

    const handlePointerLeave = () => {
      x = 0;
      y = 0;
      schedulePosition();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      root.style.removeProperty('--motion-x');
      root.style.removeProperty('--motion-y');
    };
  }, [enabled, rootRef]);
}
