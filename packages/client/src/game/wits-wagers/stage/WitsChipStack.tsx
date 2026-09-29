import type { ChipId } from '../types.ts';
import { WitsChip } from './WitsChip.tsx';

/** 一格里的一枚筹码：谁的（颜色）、哪枚永久筹码（A/B）、加了多少 */
export interface WitsChipStackItem {
  readonly key: string;
  readonly color: string;
  readonly label: string;
  readonly chipId?: ChipId;
  readonly extraStake?: number;
  readonly pending?: boolean;
}

export interface WitsChipStackProps {
  readonly items: readonly WitsChipStackItem[];
  /** 单枚直径（px），默认 34；手机由 CSS 媒体查询统一缩 */
  readonly size?: number;
  readonly className?: string;
}

/**
 * 一格里的一摞筹码（01-CONTRACT.md §4.4，A2 的 .chips）。
 *
 * 后一枚压前一枚：负 margin 叠放（桌面 -18px / 手机 -15px，见 wits-lounge.css），
 * 不换行、不溢出格子。有加注的筹码底部挂金色「+N」小签。
 * 插入新筹码时的 FLIP 让位由演出编排负责，本组件只画终态。
 */
export function WitsChipStack({ items, size = 34, className = '' }: WitsChipStackProps) {
  if (items.length === 0) return null;

  return (
    <span
      className={`ww-chip-stack ${className}`.trim()}
      role="group"
      aria-label={`${items.length} 枚筹码`}
    >
      {items.map((item) => (
        <WitsChip
          key={item.key}
          color={item.color}
          label={item.label}
          extraStake={item.extraStake}
          size={size}
          pending={item.pending}
        />
      ))}
    </span>
  );
}
