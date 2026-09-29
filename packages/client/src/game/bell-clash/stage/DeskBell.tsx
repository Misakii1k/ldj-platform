import React from 'react';

export interface DeskBellProps {
  /** 铃被拍响（播放压扁 + 弹跳 + 声波扩散） */
  readonly isHit?: boolean;
  /** 拍错或无牌错按（变灰并左右晃动） */
  readonly isMiss?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

/**
 * 盘心实体大铃。
 *
 * 结构：底座（base）/ 铃边（rim）/ 铃身（dome）/ 顶钮（knob）+ 双圈声波（wave）。
 * 视觉对齐 docs/ui-preview/cards-trio/r2/_ding.css。
 */
export const DeskBell: React.FC<DeskBellProps> = ({
  isHit = false,
  isMiss = false,
  disabled = false,
  onClick,
  className = '',
  style,
}) => {
  const classes = [
    'bc-bell',
    isHit && 'bc-bell--hit',
    isMiss && 'bc-bell--miss',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      data-stage-anchor="bell"
      id="bell"
      disabled={disabled}
      onClick={onClick}
      style={style}
      aria-label="拍铃"
      title="随时可拍铃"
    >
      <span className="bc-bell__wave" aria-hidden="true" />
      <span className="bc-bell__wave" aria-hidden="true" />
      <span className="bc-bell__base" aria-hidden="true" />
      <span className="bc-bell__rim" aria-hidden="true" />
      <span className="bc-bell__dome" aria-hidden="true" />
      <span className="bc-bell__knob" aria-hidden="true" />
    </button>
  );
};
