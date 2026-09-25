/**
 * 法官控制台席位卡：1:1 对齐原型 moderator.html
 * 包含座位号、昵称、身份徽章、存活状态与「标记出局 / 撤销出局」操作按钮。
 */
import type { ModeratorSeatModel } from './presentation.ts';

interface ModeratorSeatRowProps {
  readonly seat: ModeratorSeatModel;
  readonly busy: boolean;
  readonly error: string | null;
  readonly locked?: boolean;
  readonly onRequestToggle: (seat: ModeratorSeatModel) => void;
}

export function ModeratorSeatRow({
  seat,
  busy,
  error,
  locked = false,
  onRequestToggle,
}: ModeratorSeatRowProps) {
  return (
    <div
      className={`mod-seat ${!seat.alive ? 'is-out' : ''}`}
      data-player-id={seat.playerId}
    >
      <span className="mod-seat__no mod-seat__number">{seat.seatLabel}</span>

      <div className="mod-seat__body">
        <span className="mod-seat__name" title={seat.name}>
          {seat.name}{seat.isSelf ? '（我）' : ''}
        </span>
        <div className="mod-seat__meta">
          <span className="mod-seat__role" data-camp={seat.camp ?? 'villager'}>
            {seat.roleLabel ?? '身份未知'}
          </span>
          <span className="mod-seat__state" data-out={!seat.alive}>
            {!seat.alive ? '● 已出局' : '· 存活'}
          </span>
          {seat.offline && <span style={{ fontSize: '10px', color: 'var(--detail)' }}>（离线）</span>}
        </div>
      </div>

      <button
        type="button"
        className="mod-seat__btn"
        disabled={busy || locked}
        onClick={() => onRequestToggle(seat)}
      >
        {busy ? '处理中…' : seat.alive ? '标记出局' : '撤销出局'}
      </button>

      {error !== null && (
        <p style={{ gridColumn: '1 / -1', margin: '4px 0 0', fontSize: '11px', color: '#ff9d84' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
