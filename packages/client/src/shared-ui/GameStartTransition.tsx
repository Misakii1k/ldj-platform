import React, { useEffect, useRef, useState } from 'react';
import { GAME_CATALOG } from '@ldj/shared';
import { useMotion } from '../motion/MotionContext.tsx';
import { plateFor, pickStartTransition, type StartTransitionKind } from './platformSkin.ts';
import { webAudio } from './WebAudioManager.ts';
import './gameStartTransition.css';

export interface GameStartTransitionProps {
  readonly active: boolean;
  readonly onComplete?: () => void;
  readonly gameId?: string | null;
  readonly origin?: 'dock' | 'room';
  readonly playerCount?: number;
}

export function GameStartTransition({
  active,
  onComplete,
  gameId = null,
  origin = 'dock',
  playerCount = 1,
}: GameStartTransitionProps) {
  const { level } = useMotion();
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);

  const [kind, setKind] = useState<StartTransitionKind>('sheet');
  const [phase, setPhase] = useState<string>('idle');
  const [shake, setShake] = useState(false);

  onCompleteRef.current = onComplete;

  const plate = plateFor(gameId);
  const gameEntry = GAME_CATALOG.find((g) => g.id === gameId);
  const displayName = gameEntry?.displayName ?? '聚乐桌游';

  const completeOnce = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  };

  useEffect(() => {
    if (!active) {
      completedRef.current = false;
      setPhase('idle');
      setShake(false);
      return;
    }

    if (level === 'off') {
      setPhase('finished');
      completeOnce();
      return;
    }

    const currentKind = pickStartTransition();
    setKind(currentKind);

    const scale = level === 'full' ? 1 : level === 'reduced' ? 0.62 : 0.3;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms * scale));
    };

    setPhase('go');

    if (currentKind === 'sheet') {
      // 0 go -> 380 name -> 1000 reveal -> 1420 finished
      schedule(() => {
        setPhase('name');
        webAudio.playCardFlip();
        if (level === 'full') {
          setShake(true);
          setTimeout(() => setShake(false), 260);
        }
      }, 380);

      schedule(() => {
        setPhase('reveal');
      }, 1000);

      schedule(() => {
        setPhase('finished');
        completeOnce();
      }, 1420);
    } else if (currentKind === 'curtain') {
      // 0 go -> 60 close -> 420 name -> 1050 open -> 1640 finished
      schedule(() => {
        setPhase('close');
      }, 60);

      schedule(() => {
        setPhase('name');
        webAudio.playCardFlip();
        if (level === 'full') {
          setShake(true);
          setTimeout(() => setShake(false), 260);
        }
      }, 420);

      schedule(() => {
        setPhase('open');
      }, 1050);

      schedule(() => {
        setPhase('finished');
        completeOnce();
      }, 1640);
    } else {
      // stripes: 0 go -> 40 in -> 480 name -> 1080 out -> 1720 finished
      schedule(() => {
        setPhase('in');
      }, 40);

      schedule(() => {
        setPhase('name');
        webAudio.playCardFlip();
      }, 480);

      schedule(() => {
        setPhase('out');
      }, 1080);

      schedule(() => {
        setPhase('finished');
        completeOnce();
      }, 1720);
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [active, level]);

  if (phase === 'idle' || phase === 'finished') return null;

  const namePlate = (
    <div className="gst-name">
      <span className="gst-name-ic">{plate.icon}</span>
      <span className="gst-name-nm">{displayName}</span>
      <span className="gst-name-sb">{playerCount} 人局</span>
    </div>
  );

  return (
    <div
      className={`gst-layer gst-layer--${kind} phase-${phase} ${shake ? 'gst-shake' : ''}`}
      data-kind={kind}
      data-skin={plate.skin}
      data-origin={origin}
      data-motion-level={level}
      style={
        {
          '--gst-a': plate.bars[0],
          '--gst-b': plate.bars[1],
          '--gst-c': plate.bars[2],
          '--gst-d': plate.bars[3],
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {/* T1 坞即幕布 */}
      {kind === 'sheet' && (
        <>
          <div className="gst-sheet-bg" />
          {namePlate}
          <div className="gst-sheet-half top">
            <div className="gst-half-inner">{namePlate}</div>
          </div>
          <div className="gst-sheet-half bot">
            <div className="gst-half-inner">{namePlate}</div>
          </div>
        </>
      )}

      {/* T2 合幕开幕 */}
      {kind === 'curtain' && (
        <>
          <div className="gst-curtain-panel l" />
          <div className="gst-curtain-panel r" />
          {plate.skin === 'dark' && <div className="gst-curtain-valance" />}
          {namePlate}
        </>
      )}

      {/* T3 主题色彩条 */}
      {kind === 'stripes' && (
        <>
          <div className="gst-stripes-wrap">
            <div className="gst-stripes-bar" data-title={displayName} />
            <div className="gst-stripes-bar" data-title={displayName} />
            <div className="gst-stripes-bar" data-title={displayName} />
            <div className="gst-stripes-bar" data-title={displayName} />
            <div className="gst-stripes-bar" data-title={displayName} />
          </div>
          {namePlate}
        </>
      )}
    </div>
  );
}
