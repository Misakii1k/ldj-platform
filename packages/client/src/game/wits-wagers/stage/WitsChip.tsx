/**
 * 真筹码（01-CONTRACT.md §4.4，像素参照 A2-casino-lounge.html 的 .chip）。
 *
 * 俯视圆筹码：玩家色本体 + 边缘白色镶片（repeating-conic-gradient）
 * + 中心象牙嵌片 + 衬线字；底部三层下投影做厚度。
 * 加注时底部挂一枚金色「+N」小签（减注差额飞行时显示负数）。
 *
 * 纯展示组件：颜色由调用方给（seats.ts 的 playerColorFor），组件不查成员。
 */
export interface WitsChipProps {
  /** 玩家色（写进 --ww-chip-color） */
  readonly color: string;
  /** 筹码面文字：'A' / 'B' / 座位号；空串表示无字面（差额飞行物） */
  readonly label: string;
  /** 附加注：>0 挂「+N」签，<0 挂「−N」签，0 不挂 */
  readonly extraStake?: number;
  /** 直径（px），默认 34（桌面格内） */
  readonly size?: number;
  /** 草稿未保存的半透明预览 */
  readonly pending?: boolean;
  readonly className?: string;
}

export function WitsChip({
  color,
  label,
  extraStake = 0,
  size = 34,
  pending = false,
  className = '',
}: WitsChipProps) {
  const tag = extraStake !== 0 ? `${extraStake > 0 ? '+' : '−'}${Math.abs(extraStake)}` : null;

  return (
    <span
      className={`ww-chip ${pending ? 'ww-chip--pending' : ''} ${className}`.trim()}
      style={{
        ['--ww-chip-color' as string]: color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.32),
      }}
      data-l={label}
      role="img"
      aria-label={
        label
          ? `筹码 ${label}${extraStake > 0 ? `，加注 ${extraStake} 分` : ''}`
          : `${Math.abs(extraStake)} 分筹码`
      }
    >
      {tag !== null && <em className="ww-chip__extra">{tag}</em>}
    </span>
  );
}
