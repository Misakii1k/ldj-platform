import { useBackground } from './BackgroundContext.tsx';
import { BackgroundCanvas } from './BackgroundCanvas.tsx';
import { BackgroundVideo } from './BackgroundVideo.tsx';
import { useMotion } from '../motion/MotionContext.tsx';

interface BackgroundManagerProps {
  children?: React.ReactNode;
}

export function BackgroundManager({ children }: BackgroundManagerProps) {
  const { bgMode } = useBackground();
  const { level } = useMotion();
  const canvasQuality = level === 'full' || level === 'reduced' ? level : null;

  return (
    <div className={`app-background-root bg-mode--${bgMode}`}>
      {bgMode === 'particles' && canvasQuality && <BackgroundCanvas quality={canvasQuality} />}
      {bgMode === 'video' && canvasQuality && <BackgroundVideo quality={canvasQuality} />}
      {children}
    </div>
  );
}
