import { useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '../../lib/utils';

interface FadeContentProps {
  children: ReactNode;
  blur?: boolean;
  duration?: number;
  initialOpacity?: number;
  threshold?: number;
  delay?: number;
  className?: string;
}

export function FadeContent({
  children,
  blur = false,
  duration = 1000,
  initialOpacity = 0,
  threshold = 0.1,
  delay = 0,
  className,
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: initialOpacity, filter: blur ? 'blur(10px)' : 'blur(0px)' }}
      animate={{
        opacity: inView ? 1 : initialOpacity,
        filter: inView ? 'blur(0px)' : blur ? 'blur(10px)' : 'blur(0px)',
      }}
      transition={{ duration: duration / 1000, delay: delay / 1000, ease: 'easeOut' }}
      className={cn('', className)}
    >
      {children}
    </motion.div>
  );
}
