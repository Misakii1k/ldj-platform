import { useEffect, useRef } from 'react';

interface BackgroundVideoProps {
  quality: 'full' | 'reduced';
}

export function BackgroundVideo({ quality }: BackgroundVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameInterval = 1000 / (quality === 'full' ? 60 : 30);
    const dprCap = quality === 'full' ? 1.5 : 1;
    let animId: number | null = null;
    let previousFrameAt = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let step = 0;

    const drawGradientMesh = (timeScale: number) => {
      step += 0.008 * timeScale;
      ctx.clearRect(0, 0, width, height);

      // Gradient Node 1: Deep Indigo / Violet
      const x1 = width * 0.3 + Math.sin(step * 0.7) * (width * 0.2);
      const y1 = height * 0.3 + Math.cos(step * 0.5) * (height * 0.2);
      const r1 = Math.max(width, height) * 0.55;
      const g1 = ctx.createRadialGradient(x1, y1, 10, x1, y1, r1);
      g1.addColorStop(0, 'rgba(79, 70, 229, 0.45)');
      g1.addColorStop(0.5, 'rgba(124, 58, 237, 0.2)');
      g1.addColorStop(1, 'rgba(15, 23, 42, 0)');

      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      // Gradient Node 2: Mysterious Magenta / Amber Glow
      const x2 = width * 0.7 + Math.cos(step * 0.6) * (width * 0.25);
      const y2 = height * 0.7 + Math.sin(step * 0.8) * (height * 0.25);
      const r2 = Math.max(width, height) * 0.6;
      const g2 = ctx.createRadialGradient(x2, y2, 20, x2, y2, r2);
      g2.addColorStop(0, 'rgba(236, 72, 153, 0.35)');
      g2.addColorStop(0.6, 'rgba(245, 158, 11, 0.15)');
      g2.addColorStop(1, 'rgba(15, 23, 42, 0)');

      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);

      // Gradient Node 3: Cyber Cyan Ambient Wave
      const x3 = width * 0.5 + Math.sin(step * 0.4) * (width * 0.3);
      const y3 = height * 0.5 + Math.cos(step * 0.9) * (height * 0.3);
      const r3 = Math.max(width, height) * 0.5;
      const g3 = ctx.createRadialGradient(x3, y3, 10, x3, y3, r3);
      g3.addColorStop(0, 'rgba(14, 165, 233, 0.3)');
      g3.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, width, height);
    };

    const render = (now: number) => {
      animId = null;
      const elapsed = previousFrameAt === 0 ? frameInterval : now - previousFrameAt;
      if (elapsed + 0.5 >= frameInterval) {
        drawGradientMesh(Math.min(elapsed / (1000 / 60), 2));
        previousFrameAt = now;
      }
      if (!document.hidden) animId = requestAnimationFrame(render);
    };

    const start = () => {
      if (animId !== null || document.hidden) return;
      previousFrameAt = 0;
      animId = requestAnimationFrame(render);
    };

    const stop = () => {
      if (animId === null) return;
      cancelAnimationFrame(animId);
      animId = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    start();

    return () => {
      stop();
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [quality]);

  return (
    <div className="bg-video-wrapper" aria-hidden="true">
      <canvas ref={canvasRef} className="bg-video-canvas" />
      <div className="bg-video-overlay" />
    </div>
  );
}
