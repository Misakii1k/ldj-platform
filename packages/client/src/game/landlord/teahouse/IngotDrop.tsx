import React from 'react';

export interface IngotDropProps {
  /** 落点（页面坐标，绝对定位在茶馆根节点内） */
  top: number;
  left: number;
  className?: string;
}

/**
 * 金元宝落定：地主诞生时从上方落到地主名牌上。
 *
 * 契约：contracts/landlord.md §4.1 / §5（900ms 弹簧落下，reduced 400ms 直线，
 * minimal/off 直接出现）——形状照搬 r2/_teahouse.js 的 INGOT SVG。
 * 动画本身在 teahouse.css 的 .th-ingot-drop / th-crown-drop 上。
 */
export function IngotDrop({ top, left, className = '' }: IngotDropProps) {
  return (
    <svg
      className={`th-ingot-drop ${className}`.trim()}
      style={{ top, left }}
      viewBox="0 0 44 30"
      aria-hidden="true"
    >
      <path
        d="M2 15 Q6 28 22 28 Q38 28 42 15 L33 15 Q31 4 22 4 Q13 4 11 15 Z"
        fill="var(--gp-yellow)"
        stroke="var(--gp-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M15 12 Q22 8 29 12"
        stroke="var(--th-win-bg-start)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
