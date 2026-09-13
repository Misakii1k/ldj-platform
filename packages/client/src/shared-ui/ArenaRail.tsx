import React, { type HTMLAttributes, type ReactNode } from 'react';

/**
 * 支撑条：承载「顺序 / 计量 / 计数」这类辅助信息，把中央舞台让给焦点物件。
 *
 * 替代各游戏自建的进度轨与计量面板（testimony-meters-grid、echo-score-panel、
 * 鹅传接力轨、榴莲两侧价目牌），统一走 `--gp-*` 令牌与同一套状态语义。
 */
export type ArenaRailItemState = 'idle' | 'active' | 'done' | 'warning';

export interface ArenaRailItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly value?: ReactNode;
  readonly state?: ArenaRailItemState;
}

export interface ArenaRailProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly ArenaRailItem[];
  readonly orientation?: 'horizontal' | 'vertical';
  /** 无障碍名称，例如「接力进度」「本轮票数」。 */
  readonly label: string;
  /** 高亮索引由数据自带 state 决定；此处仅用于竖排时的行高节奏。 */
  readonly dense?: boolean;
}

export function ArenaRail({
  items,
  orientation = 'horizontal',
  label,
  dense = false,
  className,
  ...props
}: ArenaRailProps) {
  return (
    <div
      {...props}
      role="list"
      aria-label={label}
      className={[
        'arena-rail',
        `arena-rail--${orientation}`,
        dense && 'arena-rail--dense',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {items.map((item) => (
        <div
          key={item.key}
          role="listitem"
          className="arena-rail__item"
          data-state={item.state ?? 'idle'}
        >
          <span className="arena-rail__label">{item.label}</span>
          {item.value !== undefined && <span className="arena-rail__value">{item.value}</span>}
        </div>
      ))}
    </div>
  );
}
