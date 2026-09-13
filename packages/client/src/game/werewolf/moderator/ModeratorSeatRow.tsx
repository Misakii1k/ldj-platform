/**
 * 法官控制台席位行：识别（座位号 + 头像 + 昵称）、角色、唯一状态列、行尾动作。
 * 动作文案随真实状态变化（存活→标记出局 / 已出局→撤销出局），点击后由调用方弹确认框。
 */
import type { ModeratorSeatModel } from './presentation.ts';
import { UserAvatar } from '../../../user/UserAvatar.tsx';

interface ModeratorSeatRowProps {
  readonly seat: ModeratorSeatModel;
  /** 该席位正在提交请求（只锁这一行） */
  readonly busy: boolean;
  /** 该席位最近一次失败原因 */
  readonly error: string | null;
  /** 对局已结束：不再允许改动出局状态 */
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
    <li
      className={`mod-seat ${seat.alive ? 'is-alive' : 'is-out'}`}
      data-player-id={seat.playerId}
    >
      <span className="mod-seat__number">{seat.seatLabel}</span>

      <UserAvatar avatar={seat.avatar} nickname={seat.name} size={40} />

      <div className="mod-seat__identity">
        <span className="mod-seat__name" title={seat.name}>
          {seat.name}{seat.isSelf ? '（我）' : ''}
        </span>
        <span className="mod-seat__role" data-camp={seat.camp ?? 'unknown'}>
          {seat.roleLabel ?? '身份未知'}
        </span>
      </div>

      <div className="mod-seat__state">
        <span className={`mod-seat__status ${seat.alive ? 'is-alive' : 'is-out'}`}>
          {seat.statusLabel}
        </span>
        {seat.offline && <span className="mod-seat__offline">离线</span>}
      </div>

      <button
        type="button"
        className="confirm-btn confirm-btn--cancel mod-seat__action"
        disabled={busy || locked}
        onClick={() => onRequestToggle(seat)}
      >
        {busy ? '处理中…' : seat.alive ? '标记出局' : '撤销出局'}
      </button>

      {error !== null && (
        <p className="mod-seat__error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
