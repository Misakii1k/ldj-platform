import React from 'react';
import './theatre-stage.css';

/**
 * 剧场舞台骨架（视觉契约 §4.0「中央舞台」）。
 *
 * 纯展示组件：渲染台口拱门、顶部帷幔、左右红幕、木地板、脚灯、锥形追光与追光落点，
 * 中央留一个内容插槽（发言者 / 入夜身份 / 票箱 / 发身份牌…）。
 *
 * 昼夜只换灯光，不换底色 —— 剧场始终暗场（契约 §1、DESIGN-DIRECTION §2 狼人杀条目）：
 * - `day`   红幕拉开、脚灯亮、暖色追光
 * - `night` 红幕合拢、脚灯熄、只剩冷色月光
 *
 * 像素参照：`docs/ui-preview/werewolf/directions/A2-box-wings.html`（白天）
 * 与 `N-night.html`（夜）；构件尺寸与渐变照 `_shared.css` 抄。
 */
export type TheatrePeriod = 'day' | 'night';

export interface TheatreStageProps {
  /** 由 `resolveThemePeriod` 派生：day / night */
  readonly period: TheatrePeriod;
  /** 中央内容插槽 */
  readonly children?: React.ReactNode;
  /** 追加到中央内容容器上的类名（用于兼容既有 e2e 钩子，如 `.art`）。 */
  readonly centerClassName?: string;
}

/** 脚灯数量：桌面按台口宽度约 680/90 取 8 盏，手机上（≤768px）只留 3 盏，与方向稿一致。 */
const FOOTLIGHT_COUNT = 8;

export function TheatreStage({ period, children, centerClassName = '' }: TheatreStageProps) {
  return (
    <section className="ww-stage" data-period={period} aria-label="剧场舞台">
      <div className="ww-proscenium" aria-hidden="true">
        <div className="ww-proscenium__backdrop">
          <div className="ww-valance" />
          <div className="ww-curtain ww-curtain--l" />
          <div className="ww-curtain ww-curtain--r" />
        </div>
        <div className="ww-proscenium__arch" />
      </div>

      <div className="ww-floor" aria-hidden="true" />

      <div className="ww-footlights" aria-hidden="true">
        {Array.from({ length: FOOTLIGHT_COUNT }, (_, index) => <i key={index} />)}
      </div>

      <div className="ww-spot" aria-hidden="true" />
      <div className="ww-spot-pool" aria-hidden="true" />

      <div className={`ww-stage__center ${centerClassName}`.trim()}>{children}</div>
    </section>
  );
}
