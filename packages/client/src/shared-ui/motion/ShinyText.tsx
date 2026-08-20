import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export function ShinyText({ text, disabled = false, speed = 3, className }: ShinyTextProps) {
  return (
    <motion.div
      className={cn(
        'text-transparent bg-clip-text inline-block',
        className
      )}
      style={{
        backgroundImage: 'linear-gradient(120deg, rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0) 60%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        animationDuration: `${speed}s`,
      }}
      initial={disabled ? {} : { backgroundPosition: '100% 0' }}
      animate={disabled ? {} : { backgroundPosition: '-100% 0' }}
      transition={
        disabled
          ? {}
          : {
              repeat: Infinity,
              ease: 'linear',
              duration: speed,
            }
      }
    >
      {text}
    </motion.div>
  );
}
