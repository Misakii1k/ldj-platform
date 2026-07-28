import type { CSSProperties, ChangeEvent } from 'react';
import { PLAYER_COUNT_OPTIONS, type PlayerCount } from '@ldj/shared';

interface PlayerCountFilterProps {
  selectedCount: PlayerCount | null;
  onChange: (count: PlayerCount | null) => void;
}

const MIN_PLAYER_COUNT: PlayerCount = PLAYER_COUNT_OPTIONS[0];
const MAX_PLAYER_COUNT: PlayerCount = PLAYER_COUNT_OPTIONS[PLAYER_COUNT_OPTIONS.length - 1]!;
const DEFAULT_SLIDER_COUNT: PlayerCount = 5;

function isPlayerCount(value: number): value is PlayerCount {
  return PLAYER_COUNT_OPTIONS.includes(value as PlayerCount);
}

export function PlayerCountFilter({ selectedCount, onChange }: PlayerCountFilterProps) {
  const sliderValue = selectedCount ?? DEFAULT_SLIDER_COUNT;
  const progress = ((sliderValue - MIN_PLAYER_COUNT) / (MAX_PLAYER_COUNT - MIN_PLAYER_COUNT)) * 100;
  const rangeStyle = { '--player-progress': `${progress}%` } as CSSProperties;

  function handleSliderChange(event: ChangeEvent<HTMLInputElement>) {
    const nextCount = Number(event.target.value);
    if (isPlayerCount(nextCount)) onChange(nextCount);
  }

  return (
    <section className="player-filter" aria-labelledby="player-filter-title">
      <div className="player-filter__copy">
        <div className="player-filter__copy-heading">
          <h2 id="player-filter-title">这桌有几个人？</h2>
          <span className="player-filter__gesture" aria-hidden="true">拖动看看</span>
        </div>
        <p>轻轻拖动滑块，人数和背景会一起热闹起来。</p>
      </div>

      <div className="player-filter__control">
        <div className="player-filter__readout" aria-live="polite" aria-atomic="true">
          <span>当前人数</span>
          <strong key={selectedCount ?? 'all'}>{selectedCount ?? '全部'}</strong>
          <em>{selectedCount === null ? '游戏' : '人'}</em>
        </div>
        <label className="player-filter__range-label" htmlFor="player-count-range">
          拖动选择人数
        </label>
        <input
          id="player-count-range"
          className="player-filter__range"
          type="range"
          min={MIN_PLAYER_COUNT}
          max={MAX_PLAYER_COUNT}
          step={1}
          value={sliderValue}
          style={rangeStyle}
          onChange={handleSliderChange}
          aria-label="拖动选择人数"
          aria-valuetext={selectedCount === null ? '全部游戏，滑块当前停在 5 人' : `${selectedCount} 人`}
        />
        <div className="player-filter__ticks" aria-hidden="true">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <span key={count} className={selectedCount === count ? 'is-active' : ''}>{count}</span>
          ))}
        </div>
        <button
          type="button"
          className="player-filter__reset"
          aria-pressed={selectedCount === null}
          onClick={() => onChange(null)}
        >
          {selectedCount === null ? '全部游戏' : '查看全部游戏'}
        </button>
      </div>
    </section>
  );
}