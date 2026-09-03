import { GameCountdownPulse } from '../../../shared-ui/GameMotion.tsx';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import type { WerewolfMood } from '../presentation.ts';

const MOON_GLYPHS: Record<WerewolfMood, string> = {
  dusk: '🌅',
  night: '🌙',
  dawn: '🌄',
  day: '☀️',
  verdict: '⚖️',
};

interface MoonPhaseHeaderProps {
  readonly dayLabel: string;
  readonly phaseLabel: string;
  readonly narrative: string;
  readonly mood: WerewolfMood;
  readonly deadlineAt: number | null;
  readonly spectator: boolean;
  readonly overrideSeconds?: number | null;
}

export function MoonPhaseHeader({
  dayLabel,
  phaseLabel,
  narrative,
  mood,
  deadlineAt,
  spectator,
  overrideSeconds,
}: MoonPhaseHeaderProps) {
  const countdown = useCountdown(deadlineAt);
  const seconds = overrideSeconds !== undefined && overrideSeconds !== null
    ? overrideSeconds
    : (deadlineAt === null ? null : Math.max(0, countdown.secondsLeft));

  return (
    <header className="moon-header" data-mood={mood}>
      <div className="moon-header__dial" aria-hidden="true">
        <span className="moon-header__glyph">{MOON_GLYPHS[mood]}</span>
      </div>
      <div className="moon-header__copy">
        <span className="moon-header__eyebrow">{dayLabel}</span>
        <h1>{phaseLabel}</h1>
        <p>{narrative}</p>
      </div>
      <div className="moon-header__side">
        {spectator && <span className="moon-header__tag">观战</span>}
        {seconds === null ? (
          <span className="moon-header__timer moon-header__timer--idle">无限时</span>
        ) : (
          <GameCountdownPulse
            secondsLeft={seconds}
            urgentAt={5}
            className="focused-game-countdown"
            aria-live="off"
          >
            <span className={`moon-header__timer ${seconds <= 5 ? 'is-urgent' : ''}`} role="timer">
              <strong>{seconds}</strong>
              <small>秒</small>
            </span>
          </GameCountdownPulse>
        )}
      </div>
    </header>
  );
}
