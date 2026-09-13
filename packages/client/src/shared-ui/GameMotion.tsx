import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from 'react';

export type GameMotionLevel = 'full' | 'reduced' | 'minimal' | 'off';
export type GamePhaseKey = string | number;
export type GameActionFeedbackVariant = 'success' | 'error' | 'warning' | 'info';

export interface GameMotionRootProps extends HTMLAttributes<HTMLDivElement> {
  readonly level?: GameMotionLevel;
  readonly children: ReactNode;
}

export interface GamePhaseTransitionProps extends HTMLAttributes<HTMLDivElement> {
  readonly phaseKey: GamePhaseKey;
  readonly durationMs?: number;
  readonly level?: GameMotionLevel;
  readonly onComplete?: () => void;
  readonly children?: ReactNode;
}

export interface GameActionFeedbackProps extends HTMLAttributes<HTMLDivElement> {
  readonly active?: boolean;
  readonly feedbackKey?: GamePhaseKey;
  readonly level?: GameMotionLevel;
  readonly variant?: GameActionFeedbackVariant;
  readonly children?: ReactNode;
}

export interface GameCountdownPulseProps extends HTMLAttributes<HTMLDivElement> {
  readonly secondsLeft: number;
  readonly maxSeconds?: number;
  readonly urgentAt?: number;
  readonly active?: boolean;
  readonly level?: GameMotionLevel;
  readonly children?: ReactNode;
}

const GameMotionContext = createContext<GameMotionLevel>('full');

function joinClassNames(...classNames: Array<string | undefined | false>): string | undefined {
  const result = classNames.filter(Boolean).join(' ');
  return result || undefined;
}

function normalizePhaseKey(phaseKey: GamePhaseKey): string {
  return String(phaseKey);
}

function resolveMotionLevel(
  contextLevel: GameMotionLevel,
  localLevel?: GameMotionLevel,
): GameMotionLevel {
  return localLevel ?? contextLevel;
}

export function shouldStartGamePhaseTransition(
  previousPhaseKey: GameMotionKey | null,
  nextPhaseKey: GameMotionKey,
): boolean {
  return previousPhaseKey === null || !Object.is(previousPhaseKey, nextPhaseKey);
}

type GameMotionKey = GamePhaseKey;

export function GameMotionRoot({
  level = 'full',
  className,
  children,
  ...props
}: GameMotionRootProps) {
  return (
    <GameMotionContext.Provider value={level}>
      <div
        {...props}
        className={joinClassNames('game-motion-root', className)}
        data-motion-level={level}
      >
        {children}
      </div>
    </GameMotionContext.Provider>
  );
}

export function GamePhaseTransition({
  phaseKey,
  durationMs = 420,
  level: localLevel,
  onComplete,
  className,
  children,
  ...props
}: GamePhaseTransitionProps) {
  const contextLevel = useContext(GameMotionContext);
  const level = resolveMotionLevel(contextLevel, localLevel);
  const normalizedKey = normalizePhaseKey(phaseKey);
  const [activePhaseKey, setActivePhaseKey] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const durationRef = useRef(durationMs);
  const completedPhaseKeyRef = useRef<string | null>(null);

  onCompleteRef.current = onComplete;
  durationRef.current = durationMs;

  const completePhase = () => {
    if (completedPhaseKeyRef.current === normalizedKey) return;
    completedPhaseKeyRef.current = normalizedKey;
    onCompleteRef.current?.();
  };

  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    if (levelRef.current === 'off') {
      setActivePhaseKey(null);
      completePhase();
      return;
    }

    setActivePhaseKey(normalizedKey);
    const timeoutId = window.setTimeout(() => {
      setActivePhaseKey((currentKey) => (currentKey === normalizedKey ? null : currentKey));
      completePhase();
    }, Math.max(0, durationRef.current));

    return () => window.clearTimeout(timeoutId);
  }, [normalizedKey]);

  useEffect(() => {
    if (level === 'off') setActivePhaseKey(null);
  }, [level]);

  const isActive = activePhaseKey === normalizedKey && level !== 'off';

  return (
    <div
      {...props}
      className={joinClassNames('game-motion-phase-transition', isActive && 'is-active', className)}
      data-motion-level={level}
      data-phase-key={normalizedKey}
      data-phase-active={isActive ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}

export function GameActionFeedback({
  active = false,
  feedbackKey,
  level: localLevel,
  variant = 'info',
  className,
  children,
  ...props
}: GameActionFeedbackProps) {
  const contextLevel = useContext(GameMotionContext);
  const level = resolveMotionLevel(contextLevel, localLevel);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!active || level === 'off') {
      setIsPulsing(false);
      return;
    }

    setIsPulsing(false);

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setIsPulsing(true);
      return;
    }

    const frameId = window.requestAnimationFrame(() => setIsPulsing(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [active, feedbackKey, level]);

  return (
    <div
      {...props}
      className={joinClassNames(
        'game-motion-action-feedback',
        active && 'is-active',
        isPulsing && 'is-pulsing',
        className,
      )}
      data-motion-level={level}
      data-feedback-variant={variant}
      role={props.role ?? 'status'}
    >
      {children}
    </div>
  );
}

export function GameCountdownPulse({
  secondsLeft,
  maxSeconds = 60,
  urgentAt = 5,
  active = true,
  level: localLevel,
  className,
  children,
  style,
  ...props
}: GameCountdownPulseProps) {
  const contextLevel = useContext(GameMotionContext);
  const level = resolveMotionLevel(contextLevel, localLevel);
  const displaySeconds = Math.max(0, Math.ceil(secondsLeft));
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!active || level === 'off') {
      setIsPulsing(false);
      return;
    }

    setIsPulsing(false);

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setIsPulsing(true);
      return;
    }

    const frameId = window.requestAnimationFrame(() => setIsPulsing(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [active, displaySeconds, level]);

  const boundedMaxSeconds = Math.max(1, maxSeconds);
  const progress = Math.min(1, displaySeconds / boundedMaxSeconds);
  const state = displaySeconds === 0 ? 'expired' : displaySeconds <= urgentAt ? 'urgent' : 'normal';
  const countdownStyle = {
    ...style,
    '--game-motion-countdown-progress': progress,
  } as CSSProperties;

  return (
    <div
      {...props}
      className={joinClassNames('game-motion-countdown-pulse', isPulsing && 'is-pulsing', className)}
      data-motion-level={level}
      data-countdown-state={state}
      data-countdown-seconds={displaySeconds}
      aria-live={props['aria-live'] ?? 'polite'}
      style={countdownStyle}
    >
      {children ?? displaySeconds}
    </div>
  );
}
