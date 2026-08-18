import React, { useEffect, useState, useRef } from 'react';
import type { WerewolfMood } from '../presentation.ts';

interface EyeBlinkTransitionProps {
  readonly mood: WerewolfMood;
}

export function EyeBlinkTransition({ mood }: EyeBlinkTransitionProps) {
  const [blinking, setBlinking] = useState(false);
  const prevMoodRef = useRef<WerewolfMood>(mood);

  useEffect(() => {
    if (prevMoodRef.current !== mood) {
      prevMoodRef.current = mood;
      setBlinking(true);
      const timer = setTimeout(() => {
        setBlinking(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  if (!blinking) return null;

  return (
    <div className="wc-eye-blink" aria-hidden="true">
      <div className="wc-eye-blink__lid wc-eye-blink__lid--top" />
      <div className="wc-eye-blink__center-focus">
        <span className="wc-eye-blink__glyph">
          {mood === 'night' ? '☾' : mood === 'dawn' ? '🌄' : mood === 'day' ? '☼' : '⚖️'}
        </span>
      </div>
      <div className="wc-eye-blink__lid wc-eye-blink__lid--bottom" />
    </div>
  );
}
