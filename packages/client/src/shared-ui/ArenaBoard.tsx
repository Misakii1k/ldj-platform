import React, { type HTMLAttributes, type ReactNode } from 'react';

/**
 * 中央焦点面：竞技场里「玩家此刻要看的那一个东西」。
 *
 * 替代各游戏自建的 `sg-panel` 双栏堆叠——把焦点物件放在一张有实体投影的桌面上，
 * 支撑信息（顺序轨、计量条、计数板）交给 ArenaRail。
 * 带 `data-arena-focal` 供视口合约断言「焦点物件完整落在视口内」。
 */
export type ArenaBoardTone = 'paper' | 'dark' | 'accent';

export interface ArenaBoardProps extends HTMLAttributes<HTMLDivElement> {
  /** 焦点物件的标题（如「今晚的行动」「待裁决的证词」）。 */
  readonly headline?: ReactNode;
  /** 标题下的一句提示，解释玩家该做什么。 */
  readonly hint?: ReactNode;
  readonly footer?: ReactNode;
  /** 主题底色：亮色纸面 / 暗夜 / 强调色。 */
  readonly tone?: ArenaBoardTone;
  /** 紧凑模式：移动端首屏压缩纵向留白。 */
  readonly compact?: boolean;
  /** 焦点内容；只有标题/页脚（如纯提示板）时可省略。 */
  readonly children?: ReactNode;
}

export function ArenaBoard({
  headline,
  hint,
  footer,
  tone = 'paper',
  compact = false,
  className,
  children,
  ...props
}: ArenaBoardProps) {
  return (
    <section
      {...props}
      data-arena-focal="true"
      data-tone={tone}
      className={['arena-board', `arena-board--${tone}`, compact && 'arena-board--compact', className]
        .filter(Boolean)
        .join(' ')}
    >
      {(headline || hint) && (
        <header className="arena-board__head">
          {headline && <h2 className="arena-board__title">{headline}</h2>}
          {hint && <p className="arena-board__hint">{hint}</p>}
        </header>
      )}
      {children !== undefined && <div className="arena-board__body">{children}</div>}
      {footer && <footer className="arena-board__foot">{footer}</footer>}
    </section>
  );
}
