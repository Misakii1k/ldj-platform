import type { ChipId } from '../types.ts';

export interface WitsChipProps {
  readonly chipId: ChipId;
  /** 附加注数额，0 表示只押了免费筹码本身 */
  readonly extraStake?: number;
  readonly size?: number;
  /** 半透明预览：草稿未保存时用来和已确认筹码区分 */
  readonly pending?: boolean;
  readonly ownerId?: string;
  readonly className?: string;
}

const CHIP_COLORS: Record<ChipId, { rim: string; face: string; edge: string; ink: string }> = {
  A: { rim: '#c23616', face: '#e8593a', edge: '#8c240d', ink: '#ffffff' },
  B: { rim: '#115665', face: '#2b8ba3', edge: '#0b3741', ink: '#ffffff' },
};

/**
 * 实体筹码。内联 SVG 而非图片：颜色要随主题走，而且飞行动画里
 * 需要对同一个节点做 transform，避免位图缩放糊边。
 */
export function WitsChip({
  chipId,
  extraStake = 0,
  size = 44,
  pending = false,
  ownerId,
  className = '',
}: WitsChipProps) {
  const color = CHIP_COLORS[chipId];
  const label = extraStake > 0 ? `+${extraStake}` : chipId;

  return (
    <span
      className={`ww-chip ${pending ? 'ww-chip--pending' : ''} ${className}`.trim()}
      data-chip-id={chipId}
      data-chip-owner={ownerId}
      style={{ width: size, height: size }}
      aria-label={`筹码 ${chipId}${extraStake > 0 ? `，附加 ${extraStake} 分` : ''}`}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
        {/* 侧壁：让筹码看起来有厚度 */}
        <ellipse cx="24" cy="27" rx="21" ry="20" fill={color.edge} />
        <ellipse cx="24" cy="24" rx="21" ry="20" fill={color.rim} />
        {/* 边缘分色块，转动时的识别特征 */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="22.5"
            y="3"
            width="3"
            height="7"
            rx="1.2"
            fill="#ffffff"
            opacity="0.82"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
        <ellipse cx="24" cy="24" rx="15" ry="14.2" fill={color.face} />
        <ellipse cx="24" cy="24" rx="15" ry="14.2" fill="none" stroke={color.edge} strokeWidth="1.2" />
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color.ink}
          fontSize={extraStake > 0 ? 13 : 16}
          fontWeight="800"
          fontFamily="inherit"
        >
          {label}
        </text>
      </svg>
    </span>
  );
}
