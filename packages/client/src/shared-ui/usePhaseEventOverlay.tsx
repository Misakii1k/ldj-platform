import { useEffect, useRef, useState } from 'react';
import { TabletopEventOverlay, type TabletopEventVariant } from './TabletopEventOverlay.tsx';

export interface PhaseEventSpec {
  readonly label: string;
  readonly sublabel?: string;
  readonly variant?: TabletopEventVariant;
  readonly durationMs?: number;
}

/**
 * 阶段切换盖印：给定「阶段 → 文案」映射，阶段值变化且命中映射时弹一次全屏反馈。
 * 首次挂载（刷新 / 重连恢复）不触发，避免进场就被浮层遮住。
 */
export function usePhaseEventOverlay<TPhase extends string>(
  phase: TPhase,
  resolve: (phase: TPhase, previous: TPhase | null) => PhaseEventSpec | null,
): { overlay: React.ReactNode } {
  const [event, setEvent] = useState<PhaseEventSpec | null>(null);
  const prevRef = useRef<TPhase | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    const previous = prevRef.current;
    prevRef.current = phase;
    if (previous === null || previous === phase) return;
    const spec = resolveRef.current(phase, previous);
    if (spec) setEvent(spec);
  }, [phase]);

  const overlay = (
    <TabletopEventOverlay
      open={event !== null}
      variant={event?.variant ?? 'stamp'}
      label={event?.label ?? ''}
      sublabel={event?.sublabel}
      durationMs={event?.durationMs ?? 1400}
      onComplete={() => setEvent(null)}
    />
  );

  return { overlay };
}
