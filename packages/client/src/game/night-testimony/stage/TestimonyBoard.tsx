import type { ReactNode, RefObject } from 'react';

export interface TestimonyBoardProps {
  /** 已归档的便签（案卷），钉在板上 */
  readonly pins: ReactNode;
  /** 焦点区：当前题 / 候选卡 / 投票 / 猜罪，内容随阶段换但容器常驻 */
  readonly focus: ReactNode;
  /** 暗角：投票与猜罪阶段压下四角，审讯灯只照桌中央 */
  readonly vignette?: boolean;
  readonly stageRef?: RefObject<HTMLDivElement | null>;
  /** 板头右侧的进度徽章 */
  readonly badge?: ReactNode;
}

/**
 * 证词板。
 *
 * 唯一的中央容器。原先是四个 ArenaBoard 条件互斥渲染、整块换 DOM，
 * 导致便签没有稳定的 FLIP 起终点；改为板常驻、只换 focus 内容。
 */
export function TestimonyBoard({
  pins,
  focus,
  vignette = false,
  stageRef,
  badge,
}: TestimonyBoardProps) {
  return (
    <div className="nt-stage" ref={stageRef} data-vignette={vignette ? 'true' : undefined}>
      <div className="nt-board" data-stage-anchor="board">
        <header className="nt-board__head">
          <h2 className="nt-board__title">证词板</h2>
          {badge}
        </header>

        <div className="nt-board__pins" data-stage-anchor="pins">
          {pins}
        </div>

        <div className="nt-board__focus" data-stage-anchor="focus">
          {focus}
        </div>
      </div>

      {/* 暗角是装饰层，不能挡住下面的交互 */}
      <span className="nt-vignette" aria-hidden="true" />
    </div>
  );
}
