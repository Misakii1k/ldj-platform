export interface DeskBellProps {
  /** 抢铃窗口开着：铃高亮 + 声波涟漪 */
  readonly open: boolean;
  /** 正被按下：铃体下沉，投影压扁 */
  readonly pressing?: boolean;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onRing: () => void;
}

/**
 * 案台铃。
 *
 * 实体半球：硬投影 0 7px 0 交代离桌高度，按压时压到 0 1px。
 * 原先是三层 div 堆的假 3D，现在改成「一枚有厚度的按钮」——
 * 在 3D 毡面上它必须看起来是真的能按下去。
 */
export function DeskBell({ open, pressing = false, label, disabled = false, onRing }: DeskBellProps) {
  return (
    <button
      type="button"
      className="bc-bell"
      data-stage-anchor="bell"
      data-open={open ? 'true' : undefined}
      data-pressing={pressing ? 'true' : undefined}
      onClick={onRing}
      disabled={disabled}
      title={open ? '有人触发口令！立即拍铃！' : '按铃抢夺出牌权'}
    >
      {/* 声波：只在窗口开着时扩散 */}
      {open && <span className="bc-bell__ripple" aria-hidden="true" />}
      <span className="bc-bell__dome" aria-hidden="true">
        <span className="bc-bell__plunger" />
      </span>
      <span className="bc-bell__base" aria-hidden="true" />
      <span className="bc-bell__label">{label}</span>
    </button>
  );
}
