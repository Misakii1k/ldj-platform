import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '../../lib/utils';

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  onAnimationComplete?: () => void;
}

export function BlurText({
  text,
  delay = 200,
  className,
  animateBy = 'words',
  direction = 'top',
  onAnimationComplete,
}: BlurTextProps) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (isInView) {
      // Small delay before starting
      const timer = setTimeout(() => {
        setInView(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isInView, delay]);

  const defaultVariants = {
    hidden: { filter: 'blur(10px)', opacity: 0, y: direction === 'top' ? -20 : 20 },
    visible: { filter: 'blur(0px)', opacity: 1, y: 0 },
  };

  return (
    <p ref={ref} className={cn('inline-flex flex-wrap', className)}>
      {elements.map((element, index) => (
        <motion.span
          key={index}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          variants={defaultVariants}
          transition={{
            duration: 0.3,
            delay: index * 0.05,
            ease: 'easeOut',
          }}
          onAnimationComplete={
            index === elements.length - 1 ? onAnimationComplete : undefined
          }
          className="inline-block"
        >
          {element === ' ' ? '\u00A0' : element}
          {animateBy === 'words' && index < elements.length - 1 && '\u00A0'}
        </motion.span>
      ))}
    </p>
  );
}
