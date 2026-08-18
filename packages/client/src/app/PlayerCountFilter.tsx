import type { CSSProperties, ChangeEvent } from 'react';
import { PLAYER_COUNT_OPTIONS, type PlayerCount } from '@ldj/shared';
import { LayoutGrid } from 'lucide-react';

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
        <p className="player-filter__eyebrow">按人数筛选</p>
        <h2 id="player-filter-title">今天有几位玩家？</h2>
      </div>

      <div className="player-filter__control">
        <div className="player-filter__readout" aria-live="polite" aria-atomic="true">
          <span>当前</span>
          <strong key={selectedCount ?? 'all'}>{selectedCount ?? '全部'}</strong>
          <em>{selectedCount === null ? '玩法' : '人局'}</em>
          <button
            type="button"
            className="player-filter__reset"
            aria-pressed={selectedCount === null}
            onClick={() => onChange(null)}
            title="显示全部玩法"
          >
            <LayoutGrid size={14} strokeWidth={2.5} aria-hidden="true" />
            全部
          </button>
        </div>
        <label className="sr-only" htmlFor="player-count-range">
          拖动选择人数
        </label>
        <div className="player-filter__range-track-wrapper" style={rangeStyle}>
          {/* 未筛选时不显示滑块 tooltip，避免「当前 5 人」误导（列表实际显示全部） */}
          {selectedCount !== null && (
            <span className="player-filter__thumb-tooltip">
              {`${selectedCount} 人局`}
            </span>
          )}
          <input
            id="player-count-range"
            className="player-filter__range"
            type="range"
            min={MIN_PLAYER_COUNT}
            max={MAX_PLAYER_COUNT}
            step={1}
            value={sliderValue}
            onChange={handleSliderChange}
            aria-label="拖动选择人数"
            aria-valuetext={selectedCount === null ? '全部玩法，滑块当前停在 5 人' : `${selectedCount} 人`}
          />
        </div>
        <div className="player-filter__ticks" role="group" aria-label="直接选择玩家人数">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <button
              type="button"
              key={count}
              className={`player-filter__tick-btn ${selectedCount === count ? 'is-active' : ''}`}
              onClick={() => onChange(count)}
              aria-label={`${count} 人`}
              aria-pressed={selectedCount === count}
              title={`切至 ${count} 人玩法`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
