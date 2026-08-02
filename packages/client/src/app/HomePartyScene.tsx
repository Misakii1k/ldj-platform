import type { CSSProperties } from 'react';
import type { PlayerCount } from '@ldj/shared';

interface HomePartySceneProps {
  selectedCount: PlayerCount | null;
}

const PERSON_POSITIONS = [
  { left: '20%', top: '42%', rotate: '-13deg', color: '#ef4d39' },
  { left: '29%', top: '18%', rotate: '-7deg', color: '#0c715d' },
  { left: '43%', top: '8%', rotate: '4deg', color: '#e4a829' },
  { left: '58%', top: '8%', rotate: '10deg', color: '#7960a5' },
  { left: '73%', top: '22%', rotate: '14deg', color: '#237c93' },
  { left: '82%', top: '43%', rotate: '18deg', color: '#ef4d39' },
  { left: '76%', top: '66%', rotate: '13deg', color: '#0c715d' },
  { left: '61%', top: '80%', rotate: '7deg', color: '#e4a829' },
  { left: '45%', top: '84%', rotate: '-4deg', color: '#7960a5' },
  { left: '30%', top: '76%', rotate: '-10deg', color: '#237c93' },
  { left: '17%', top: '63%', rotate: '-16deg', color: '#ef4d39' },
  { left: '9%', top: '42%', rotate: '-20deg', color: '#0c715d' },
] as const;

function getSceneStage(count: PlayerCount | null): 'small' | 'cozy' | 'lively' | 'full' {
  if (count !== null && count <= 4) return 'small';
  if (count === null || count <= 5) return 'cozy';
  if (count <= 8) return 'lively';
  return 'full';
}

export function HomePartyScene({ selectedCount }: HomePartySceneProps) {
  const visiblePeople = selectedCount ?? 5;
  const stage = getSceneStage(selectedCount);

  return (
    <div
      className={`home-party-scene home-party-scene--${stage}`}
      data-player-count={selectedCount ?? 'all'}
      data-scene-stage={stage}
      aria-hidden="true"
    >
      <span className="home-party-scene__glow" />
      <span className="home-party-scene__rug" />
      <span className="home-party-scene__garland home-party-scene__garland--one" />
      <span className="home-party-scene__garland home-party-scene__garland--two" />
      <span className="home-party-scene__sofa home-party-scene__sofa--left"><i /></span>
      <span className="home-party-scene__sofa home-party-scene__sofa--right"><i /></span>
      <span className="home-party-scene__table"><i /></span>
      <span className="home-party-scene__lamp"><i /></span>
      <span className="home-party-scene__plant"><i /><i /><i /></span>
      {PERSON_POSITIONS.map((person, index) => {
        const isVisible = index < visiblePeople;
        return (
          <span
            key={index}
            className={`home-party-scene__person ${isVisible ? 'is-visible' : ''}`}
            style={{
              '--person-index': index,
              '--person-left': person.left,
              '--person-top': person.top,
              '--person-rotate': person.rotate,
              '--person-color': person.color,
            } as CSSProperties}
          >
            <i className="home-party-scene__person-body" />
          </span>
        );
      })}
      <span className="home-party-scene__spark home-party-scene__spark--one">✦</span>
      <span className="home-party-scene__spark home-party-scene__spark--two">✦</span>
      <span className="home-party-scene__spark home-party-scene__spark--three">·</span>
    </div>
  );
}
