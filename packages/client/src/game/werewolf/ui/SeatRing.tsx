import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import type { WerewolfMood, WerewolfSeatModel } from '../presentation.ts';

interface SeatRingProps {
  readonly seats: readonly WerewolfSeatModel[];
  readonly mood: WerewolfMood;
}

/** dense 起始人数：≥9 时启用紧凑席位卡（仅控制卡片尺寸，见 styles.css .is-dense）。 */
const DENSE_MIN_COUNT = 9;

/**
 * 马蹄席位环的逻辑画布（px）：席位 left/top 百分比全部映射到这块固定画布，
 * 整环再按宿主（werewolf-arena）可用空间等比缩放——底部面板开合、设备尺寸
 * 变化时，席位相对几何恒定，只会整桌平滑缩放，不会互相挤压漂移。
 */
const RING_CANVAS_W = 924;
const RING_CANVAS_H = 450;
/** 大屏放大上限：避免席位卡随画布放大到过大。 */
const RING_MAX_SCALE = 1.35;

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
    // 顶行 12%：居中锚定下为半张席位卡留出上缘余量，短横屏（arena≈450px 高）也不出界
    return { left: `${50 + (index - (top - 1) / 2) * 18}%`, top: '12%' };
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

export function SeatChip({
  seat,
  style,
  onSelectTarget,
  isTargetSelected = false,
}: {
  seat: WerewolfSeatModel;
  style?: CSSProperties;
  /** 该席位有点选动作时回调（点击头像后就地选择目标），参数为席位与卡片位置。 */
  onSelectTarget?: (seat: WerewolfSeatModel, rect: DOMRect) => void;
  isTargetSelected?: boolean;
}) {
  const targetable = onSelectTarget !== undefined && seat.targetActions.length > 0;
  return (
    <li
      key={seat.playerId}
      className={[
        'seat-chip',
        seat.alive ? 'is-alive' : 'is-out',
        seat.isSelf ? 'is-self' : '',
        seat.isSpeaking ? 'is-speaking' : '',
        seat.isWolfTeammate ? 'is-ally' : '',
        targetable ? 'is-targetable' : '',
        targetable && isTargetSelected ? 'is-target-selected' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-current={seat.isSpeaking ? 'step' : undefined}
      onClick={targetable ? (event) => onSelectTarget(seat, event.currentTarget.getBoundingClientRect()) : undefined}
      onKeyDown={targetable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectTarget(seat, event.currentTarget.getBoundingClientRect());
        }
      } : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
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
          <span className="seat-chip__badge seat-chip__badge--speaking">发言中</span>
        </div>
      )}
    </li>
  );
}

export function SeatRing({
  seats,
  mood,
  className = '',
  onSelectTarget,
  selectedPlayerId,
}: SeatRingProps & {
  className?: string;
  onSelectTarget?: (seat: WerewolfSeatModel, rect: DOMRect) => void;
  selectedPlayerId?: string | null;
}) {
  const count = seats.length;
  const dense = count >= DENSE_MIN_COUNT;
  const ringRef = useRef<HTMLElement | null>(null);

  // 观测宿主（werewolf-arena）可用空间，把固定逻辑画布等比缩放进去：
  // 底部面板开合只让整桌平滑缩放，席位相对几何恒定。
  useLayoutEffect(() => {
    const section = ringRef.current;
    const host = section?.parentElement;
    if (!section || !host) return;
    const apply = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scale = Math.min(rect.width / RING_CANVAS_W, rect.height / RING_CANVAS_H, RING_MAX_SCALE);
      section.style.setProperty('--ring-scale', scale.toFixed(4));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ringRef}
      className={`seat-ring${dense ? ' is-dense' : ''} ${className}`.trim()}
      data-mood={mood}
      aria-label={`审判桌，共 ${count} 个席位`}
    >
      <ol className="seat-ring__list">
        {seats.map((seat, index) => {
          const style = horseshoePosition(index, count);
          return (
            <SeatChip
              key={seat.playerId}
              seat={seat}
              style={style}
              onSelectTarget={onSelectTarget}
              isTargetSelected={selectedPlayerId === seat.playerId}
            />
          );
        })}
      </ol>
    </section>
  );
}
