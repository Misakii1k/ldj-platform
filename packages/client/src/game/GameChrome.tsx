import type { ReactNode } from 'react';
import type { UndercoverPlayerView } from './types.ts';

const PHASES = [
  { key: 'word', label: '查词', short: '1' },
  { key: 'speak', label: '描述', short: '2' },
  { key: 'vote', label: '投票', short: '3' },
  { key: 'result', label: '揭晓', short: '4' },
] as const;

function phaseIndex(phase: UndercoverPlayerView['phase']): number {
  switch (phase) {
    case 'word_reveal': return 0;
    case 'speaking': return 1;
    case 'voting':
    case 'runoff_voting': return 2;
    case 'vote_result':
    case 'game_over': return 3;
  }
}

export function GamePhaseRail({ phase }: { phase: UndercoverPlayerView['phase'] }) {
  const activeIndex = phaseIndex(phase);
  return (
    <nav className="game-phase-rail" aria-label="对局阶段">
      {PHASES.map((item, index) => (
        <div
          key={item.key}
          className={`game-phase-step ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'done' : ''}`}
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span className="phase-step-dot">{index < activeIndex ? '✓' : item.short}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  );
}

export function PhaseLead({ eyebrow, title, description, aside }: {
  eyebrow?: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="phase-lead">
      <div className="phase-lead-copy">
        {eyebrow && <span className="phase-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {aside}
    </div>
  );
}

export function GameCountdown({ seconds, label = '剩余时间' }: { seconds: number; label?: string }) {
  const ended = seconds <= 0;
  const urgent = seconds > 0 && seconds <= 5;
  return (
    <div className={`game-countdown ${urgent ? 'urgent' : ''} ${ended ? 'ended' : ''}`} role="timer" aria-live="off">
      <span className="countdown-label">{ended ? '阶段切换' : label}</span>
      <strong>{ended ? '…' : seconds}</strong>
      <span className="countdown-unit">{ended ? '请稍候' : '秒'}</span>
    </div>
  );
}
