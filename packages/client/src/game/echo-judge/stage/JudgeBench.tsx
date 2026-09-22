import type { ReactNode, RefObject } from 'react';

export interface JudgeBenchProps {
  /** 台上内容：卷宗三选一 / 大引号考题 / 指认 */
  readonly children: ReactNode;
  /** 木槌是否在敲：驱动木槌落下与台面回弹 */
  readonly striking?: boolean;
  /** 审判阶段才把木槌摆上台 */
  readonly showGavel?: boolean;
  /** 暗角：聚光判词台，旁听席压暗 */
  readonly vignette?: boolean;
  readonly stageRef?: RefObject<HTMLDivElement | null>;
}

/**
 * 判词台。
 *
 * 审判长面前的那张台子，考题像一份卷宗摊在上面。
 * 宣判时木槌敲下、台面下沉 4px 回弹——这是本游戏唯一的"重量感"来源。
 */
export function JudgeBench({
  children,
  striking = false,
  showGavel = false,
  vignette = false,
  stageRef,
}: JudgeBenchProps) {
  return (
    <div className="ej-bench-wrap" ref={stageRef} data-vignette={vignette ? 'true' : undefined}>
      <div
        className="ej-bench"
        data-stage-anchor="bench"
        data-striking={striking ? 'true' : undefined}
      >
        {showGavel && (
          <span className="ej-gavel" data-striking={striking ? 'true' : undefined} aria-hidden="true">
            <span className="ej-gavel__head" />
            <span className="ej-gavel__handle" />
          </span>
        )}
        {children}
      </div>

      {/* 暗角是装饰层，不能挡住下面的交互 */}
      <span className="ej-vignette" aria-hidden="true" />
    </div>
  );
}
