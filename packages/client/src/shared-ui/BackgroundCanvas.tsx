import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  fadeSpeed: number;
  color: string;
  symbol?: string;
  size: number;
}

const SYMBOLS: string[] = ['♠', '♥', '♣', '♦', '✦', '·'];
const COLORS: string[] = [
  'rgba(99, 102, 241, ',   // Indigo
  'rgba(168, 85, 247, ',   // Purple
  'rgba(236, 72, 153, ',   // Pink
  'rgba(59, 130, 246, ',   // Blue
  'rgba(245, 158, 11, ',   // Amber
];

interface BackgroundCanvasProps {
  quality: 'full' | 'reduced';
}

export function BackgroundCanvas({ quality }: BackgroundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameInterval = 1000 / (quality === 'full' ? 60 : 30);
    const dprCap = quality === 'full' ? 1.5 : 1;
    const particleLimit = quality === 'full' ? 40 : 16;
    const symbolShadowBlur = quality === 'full' ? 10 : 4;
    const particleShadowBlur = quality === 'full' ? 12 : 5;
    let animFrameId: number | null = null;
    let previousFrameAt = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const particles: Particle[] = [];

    const createParticle = (randomY = false): Particle => {
      const isSymbol = Math.random() > 0.6;
      const defaultColor = COLORS[0] ?? 'rgba(99, 102, 241, ';
      const defaultSymbol = SYMBOLS[0] ?? '✦';
      const chosenColor = COLORS[Math.floor(Math.random() * COLORS.length)] ?? defaultColor;
      const chosenSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] ?? defaultSymbol;
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : height + 20,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        radius: Math.random() * 3 + 1,
        alpha: Math.random() * 0.5 + 0.2,
        fadeSpeed: 0.002 + Math.random() * 0.003,
        color: chosenColor,
        symbol: isSymbol ? chosenSymbol : undefined,
        size: Math.floor(Math.random() * 12 + 10),
      };
    };

    let mouseX = width / 2;
    let mouseY = height / 2;

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const particleCount = Math.min(Math.floor((width * height) / 25000), particleLimit);
      while (particles.length > particleCount) particles.pop();
      while (particles.length < particleCount) particles.push(createParticle(true));
      if (quality === 'reduced') {
        mouseX = width / 2;
        mouseY = height / 2;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const draw = (timeScale: number) => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle background ambient radial glows
      const bgGrad1 = ctx.createRadialGradient(
        mouseX,
        mouseY,
        10,
        mouseX,
        mouseY,
        Math.max(width, height) * 0.6
      );
      bgGrad1.addColorStop(0, 'rgba(99, 102, 241, 0.07)');
      bgGrad1.addColorStop(0.5, 'rgba(168, 85, 247, 0.03)');
      bgGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = bgGrad1;
      ctx.fillRect(0, 0, width, height);

      // Update & render particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;

        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;

        if (p.y < -30 || p.x < -30 || p.x > width + 30) {
          particles[i] = createParticle(false);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;

        if (p.symbol) {
          ctx.font = `${p.size}px sans-serif`;
          ctx.fillStyle = p.color + '0.8)';
          ctx.shadowColor = p.color + '0.5)';
          ctx.shadowBlur = symbolShadowBlur;
          ctx.fillText(p.symbol, p.x, p.y);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color + '0.9)';
          ctx.shadowColor = p.color + '0.6)';
          ctx.shadowBlur = particleShadowBlur;
          ctx.fill();
        }

        ctx.restore();
      }
    };

    const render = (now: number) => {
      animFrameId = null;
      const elapsed = previousFrameAt === 0 ? frameInterval : now - previousFrameAt;
      if (elapsed + 0.5 >= frameInterval) {
        draw(Math.min(elapsed / (1000 / 60), 2));
        previousFrameAt = now;
      }
      if (!document.hidden) animFrameId = requestAnimationFrame(render);
    };

    const start = () => {
      if (animFrameId !== null || document.hidden) return;
      previousFrameAt = 0;
      animFrameId = requestAnimationFrame(render);
    };

    const stop = () => {
      if (animFrameId === null) return;
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (quality === 'full') window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    start();

    return () => {
      stop();
      window.removeEventListener('resize', resizeCanvas);
      if (quality === 'full') window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [quality]);

  return <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />;
}
