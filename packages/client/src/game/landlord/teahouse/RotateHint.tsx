import React from 'react';

export interface RotateHintProps {
  className?: string;
}

/**
 * 斗地主手机竖屏旋转横屏全屏提示组件。
 *
 * 契约：contracts/landlord.md §4.4
 * 当处于竖屏移动设备视口时，覆盖显示该提示，引导用户转为横屏模式。
 */
export function RotateHint({ className = '' }: RotateHintProps) {
  return (
    <div className={`th-rotate-hint ${className}`.trim()} aria-hidden="true">
      <div className="th-rotate-hint__phone">
        <i />
      </div>
      <b>请把手机横过来</b>
      <span>斗地主只做横屏：三家手牌和出牌区要一眼看全</span>
    </div>
  );
}
