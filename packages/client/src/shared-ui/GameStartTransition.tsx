import React, { useEffect, useRef, useState } from 'react';
import { GameIcon } from './GameIcon.tsx';
import { useMotion } from '../motion/MotionContext.tsx';

interface GameStartTransitionProps {
  readonly active: boolean;
  readonly onComplete?: () => void;
}

/**
 * 房间开局全屏震撼转场特效：
 * 1. 底部绿色全员就绪胶囊瞬间向四周水波展开铺满全屏 (Ripple Blast)
 * 2. 倾斜彩色几何条纹百叶窗交错横扫 (Shutter Stripes Sweep)
 * 3. 中央呈现对局开启徽章，随后平滑淡出揭晓游戏界面
 */
export function GameStartTransition({ active, onComplete }: GameStartTransitionProps) {
  const { level } = useMotion();
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'expanding' | 'stripes' | 'reveal' | 'finished'>('idle');

  onCompleteRef.current = onComplete;

  const completeOnce = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  };

  useEffect(() => {
    if (!active) {
      completedRef.current = false;
      setPhase('idle');
      return;
    }

    if (level === 'off') {
      setPhase('finished');
      completeOnce();
      return;
    }

    const scale = level === 'full' ? 1 : level === 'reduced' ? 0.62 : 0.3;
    setPhase('expanding');

    const t1 = setTimeout(() => {
      setPhase('stripes');
    }, 380 * scale);

    const t2 = setTimeout(() => {
      setPhase('reveal');
    }, 950 * scale);

    const t3 = setTimeout(() => {
      setPhase('finished');
      completeOnce();
    }, 1300 * scale);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [active, level]);

  if (phase === 'idle' || phase === 'finished') return null;

  return (
    <div className={`game-start-transition-layer phase-${phase}`} data-motion-level={level} aria-hidden="true">
      {/* 底部绿色胶囊波纹向全屏极速扩散爆发 */}
      <div className="gst-ripple-blast" />

      {/* 交错倾斜红绿蓝黄细条百叶窗横扫扫屏 */}
      <div className="gst-stripes-container">
        <div className="gst-stripe s1" />
        <div className="gst-stripe s2" />
        <div className="gst-stripe s3" />
        <div className="gst-stripe s4" />
        <div className="gst-stripe s5" />
        <div className="gst-stripe s6" />
        <div className="gst-stripe s7" />
        <div className="gst-stripe s8" />
      </div>

      {/* 中央对局开启徽章 */}
      <div className="gst-emblem-box">
        <div className="gst-emblem-icon">
          <GameIcon name="cards_deck" size={48} />
        </div>
        <div className="gst-emblem-title">✦ 牌局开启 · 全力以赴 ✦</div>
        <div className="gst-emblem-subtitle">正在进入对决竞技场...</div>
      </div>
    </div>
  );
}
