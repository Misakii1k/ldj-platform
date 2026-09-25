import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { RollingNumber } from './RollingNumber.tsx';

export interface TabletopCountdownTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  readonly secondsLeft: number;
  /** ≤ 该秒数进入紧迫态（脉冲 + 变色）。 */
  readonly urgentAt?: number;
  readonly as?: ElementType;
  /**
   * 显示形态：
   * - `seconds`（默认）：`30s` 逐位滚动
   * - `clock`：`01:30` 分秒各自逐位滚动
   */
  readonly format?: 'seconds' | 'clock';
  /** 自定义内容。传入后不再使用内置滚动渲染。 */
  readonly children?: ReactNode;
}

/**
 * 倒计时文字：内置 RollingNumber 逐位滚动 + 紧迫态标注。
 *
 * 元素上挂 data-countdown-state = normal | urgent | expired，
 * 由 tabletop-game-motion.css 统一驱动最后几秒的脉冲与变色。
 */
export function TabletopCountdownText({
  secondsLeft,
  urgentAt = 5,
  as: Tag = 'strong',
  format = 'seconds',
  className,
  children,
  ...props
}: TabletopCountdownTextProps) {
  const seconds = Math.max(0, Math.ceil(secondsLeft));
  const state = seconds === 0 ? 'expired' : seconds <= urgentAt ? 'urgent' : 'normal';

  let content: ReactNode;
  if (children !== undefined) {
    content = children;
  } else if (format === 'clock') {
    content = (
      <>
        <RollingNumber value={Math.floor(seconds / 60)} padTo={2} />
        <span className="rolling-number__sep">:</span>
        <RollingNumber value={seconds % 60} padTo={2} />
      </>
    );
  } else {
    content = <RollingNumber value={seconds} suffix="s" />;
  }

  return (
    <Tag
      {...props}
      className={['tabletop-countdown-text', className].filter(Boolean).join(' ')}
      data-countdown-state={state}
      data-countdown-seconds={seconds}
    >
      {content}
    </Tag>
  );
}
