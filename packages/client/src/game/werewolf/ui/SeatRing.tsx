import type { CSSProperties } from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import type { WerewolfMood, WerewolfSeatModel } from '../presentation.ts';

interface SeatRingProps {
  readonly seats: readonly WerewolfSeatModel[];
  readonly mood: WerewolfMood;
}

/** dense 起始人数：≥9 时启用紧凑席位卡（仅控制卡片尺寸，见 styles.css .is-dense）。 */
const DENSE_MIN_COUNT = 9;

interface HorseshoeSplit {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * 审判席马蹄形分列：自左上起顺时针——顶列、右列（自上而下）、底列、左列
 *（自下而上）。任何人数（6–12）与窗口高度下，相邻席位中心距都大于席位
 * 宽度（e2e 几何门），且全部席位始终完整落在判厅场地内。
 */
function splitHorseshoe(count: number): HorseshoeSplit {
  const bottom = 2;
  const top = Math.min(4, Math.max(2, Math.ceil((count - bottom) / 3)));
  const sideSeats = count - bottom - top;
  const left = Math.ceil(sideSeats / 2);
  const right = sideSeats - left;
  return { top, right, bottom, left };
}

function horseshoePosition(index: number, count: number): CSSProperties {
  const { top, right, bottom, left } = splitHorseshoe(count);
  if (index < top) {
    return { left: `${50 + (index - (top - 1) / 2) * 18}%`, top: '8%' };
  }
  if (index < top + right) {
    const span = right > 1 ? 52 / (right - 1) : 0;
    return { left: '88%', top: `${(18 + span * (index - top)).toFixed(2)}%` };
  }
  if (index < top + right + bottom) {
    // 底列自右向左衔接右列与左列，下移避开中央角色身份卡
    const order = index - (top + right);
    return { left: `${58 - order * 18}%`, top: '86%' };
  }
  const k = index - top - right - bottom;
  const span = left > 1 ? 52 / (left - 1) : 0;
  return { left: '12%', top: `${(70 - span * k).toFixed(2)}%` };
}

export function SeatChip({ seat, style }: { seat: WerewolfSeatModel; style?: CSSProperties }) {
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
      <div className="seat-chip__head">
        <div className="seat-chip__head-left">
          <UserAvatar
            avatar={seat.avatar ?? 'preset:fox'}
            nickname={seat.name}
            size={20}
            className="seat-chip__avatar"
          />
          <span className="seat-chip__seat">{seat.seatLabel}</span>
        </div>
        <div className="seat-chip__head-badges">
          {seat.isSelf && <span className="seat-chip__badge seat-chip__badge--self">你</span>}
          {seat.isWolfTeammate && (
            <span className="seat-chip__badge seat-chip__badge--ally">同伴</span>
          )}
        </div>
      </div>

      <div className="seat-chip__body">
        <span className="seat-chip__name" title={seat.name}>
          {seat.name}
        </span>
        <div className="seat-chip__status-line">
          <span className="seat-chip__status">
            <span className="seat-chip__mark" aria-hidden="true">
              {seat.alive ? '◆' : '✕'}
            </span>
            {seat.statusLabel}
          </span>
          {seat.revealedRoleLabel && (
            <span className="seat-chip__role">{seat.revealedRoleLabel}</span>
          )}
        </div>
      </div>

      {seat.isSpeaking && (
        <div className="seat-chip__speaking-strip">
          <span className="seat-chip__badge seat-chip__badge--speaking">发言中 🎙️</span>
        </div>
      )}
    </li>
  );
}

export function SeatRing({ seats, mood, className = '' }: SeatRingProps & { className?: string }) {
  const count = seats.length;
  const dense = count >= DENSE_MIN_COUNT;
  return (
    <section
      className={`seat-ring${dense ? ' is-dense' : ''} ${className}`.trim()}
      data-mood={mood}
      aria-label={`审判桌，共 ${count} 个席位`}
    >
      <ol className="seat-ring__list">
        {seats.map((seat, index) => {
          const style = horseshoePosition(index, count);
          return <SeatChip key={seat.playerId} seat={seat} style={style} />;
        })}
      </ol>
    </section>
  );
}
