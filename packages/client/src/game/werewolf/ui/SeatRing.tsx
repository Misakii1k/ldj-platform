import type { CSSProperties } from 'react';
import type { WerewolfMood, WerewolfSeatModel } from '../presentation.ts';

interface SeatRingProps {
  readonly seats: readonly WerewolfSeatModel[];
  readonly mood: WerewolfMood;
}

/** dense 模式席位固定足迹（与 styles.css .is-dense 的 width/min-height 一致）。 */
const DENSE_CHIP_WIDTH = 108;
const DENSE_CHIP_GAP = 16;
/** dense 起始人数：≥9 时启用紧凑布局。 */
const DENSE_MIN_COUNT = 9;

/**
 * dense 模式环形半径（CSS px）：相邻席位中心弦距 ≥ 席位宽度 + 间隙，保证任何
 * 人数（9–12）下席位互不交叠。公式：r ≥ (width + gap) / (2·sin(π/n))，
 * 再乘安全系数吸收字体/徽标溢出。
 */
function denseRadius(count: number): number {
  const chord = DENSE_CHIP_WIDTH + DENSE_CHIP_GAP;
  const base = chord / (2 * Math.sin(Math.PI / count));
  return Math.ceil(base * 1.08);
}

export function SeatRing({ seats, mood }: SeatRingProps) {
  const count = seats.length;
  const dense = count >= DENSE_MIN_COUNT;
  return (
    <section
      className={`seat-ring${dense ? ' is-dense' : ''}`}
      data-mood={mood}
      aria-label={`审判桌，共 ${count} 个席位`}
    >
      <div className="seat-ring__table" aria-hidden="true">
        <span className="seat-ring__moon">☾</span>
        <strong>审判桌</strong>
        <small>{count} 人局</small>
      </div>
      <ol className="seat-ring__list">
        {seats.map((seat, index) => {
          const style = {
            '--seat-index': index,
            '--seat-count': count,
            ...(dense ? { '--seat-radius': `${denseRadius(count)}px` } : {}),
          } as CSSProperties;
          return (
            <li
              key={seat.playerId}
              className={[
                'seat-chip',
                seat.alive ? 'is-alive' : 'is-out',
                seat.isSelf ? 'is-self' : '',
                seat.isSpeaking ? 'is-speaking' : '',
                seat.isWolfTeammate ? 'is-ally' : '',
              ].filter(Boolean).join(' ')}
              style={style}
              aria-current={seat.isSpeaking ? 'step' : undefined}
            >
              <span className="seat-chip__seat">{seat.seatLabel}</span>
              <span className="seat-chip__name">{seat.name}</span>
              <span className="seat-chip__status">
                <span className="seat-chip__mark" aria-hidden="true">{seat.alive ? '◆' : '✕'}</span>
                {seat.statusLabel}
              </span>
              {seat.revealedRoleLabel && <span className="seat-chip__role">{seat.revealedRoleLabel}</span>}
              <span className="seat-chip__badges">
                {seat.isSelf && <span className="seat-chip__badge">你</span>}
                {seat.isWolfTeammate && <span className="seat-chip__badge seat-chip__badge--ally">同伴</span>}
                {seat.isSpeaking && <span className="seat-chip__badge seat-chip__badge--speaking">发言中</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
