import { useEffect, useRef, type ReactNode } from 'react';
import type { Rect } from './flip.ts';
import {
  buildFlightPoses,
  flightStagger,
  pickFlightStyles,
  poseKeyframes,
  shadeKeyframes,
  shadowKeyframes,
  sheenKeyframes,
} from './flightPresets.ts';

/** 一件飞行物。节点由各游戏自己给，共享层只负责几何与节拍。 */
export interface StageFlightPiece {
  readonly key: string;
  readonly width: number;
  /** 省略时取 width（正方形）；卡牌类务必显式给 */
  readonly height?: number;
  readonly node: ReactNode;
  /** 挂到幽灵节点上的额外类名，供各游戏加投影一类的道具修饰 */
  readonly className?: string;
  /**
   * 纸张质感：翻到背面压暗、经过侧面时高光扫过、地面留一层阴影。
   * 只对 motion='toss' 有意义。厚重道具（铃、骰）应设 false。
   */
  readonly paper?: boolean;
}

export interface StageFlight {
  readonly id: string;
  readonly pieces: readonly StageFlightPiece[];
  readonly from: Rect;
  readonly to: Rect;
  /** 抛物线拱高（px）；motion='slide' 时忽略 */
  readonly arc: number;
  readonly durationMs: number;
  readonly delayMs: number;
  /** 整叠错峰飞完的预算：件数越多间隔越小。省略时取 durationMs */
  readonly budgetMs?: number;
  /**
   * toss = 五种性格的 3D 抛飞（纸片翻飘、近大远小）；
   * slide = 直线推送 + 轻微落位缩放，不翻不飘不做景深。
   *
   * 一张牌在桌上被推过去时不会打旋——牌用 slide，钞票/令牌用 toss。
   */
  readonly motion?: 'toss' | 'slide';
}

export interface FlightLayerProps {
  readonly flights: readonly StageFlight[];
  /** 低动效档位：只做淡入淡出，不做翻转与景深 */
  readonly simplified?: boolean;
  /** 额外类名，供各游戏调 z-index 或 perspective */
  readonly className?: string;
}

/**
 * 飞行幽灵层（共享版，从 wits-wagers/stage/WitsFlightLayer.tsx 上提）。
 *
 * 必须挂在毡面（preserve-3d + perspective）子树之外：一旦有 transform 祖先，
 * position:fixed 会变成相对该祖先定位，实测的屏幕坐标就全部失效。
 *
 * 本层自己是一个 3D 上下文（CSS 里给了 perspective），飞行物靠 translateZ
 * 朝镜头靠近产生真实的近大远小，而不是用 scale 假装。
 */
export function FlightLayer({ flights, simplified = false, className }: FlightLayerProps) {
  const startedRef = useRef<Set<string>>(new Set());
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const live = new Set(flights.map((f) => f.id));
    // 丢弃已结束飞行的记录，避免同一 id 复用时不再播放
    for (const id of [...startedRef.current]) {
      if (!live.has(id)) startedRef.current.delete(id);
    }

    for (const flight of flights) {
      if (startedRef.current.has(flight.id)) continue;
      startedRef.current.add(flight.id);

      const group = host.querySelector<HTMLElement>(`[data-flight-id="${CSS.escape(flight.id)}"]`);
      if (!group) continue;

      const ghosts = [...group.querySelectorAll<HTMLElement>('.stage-flight__ghost')];
      const shadows = [...group.querySelectorAll<HTMLElement>('.stage-flight__shadow')];
      if (ghosts.length === 0) continue;

      const duration = flight.durationMs;

      if ((flight.motion ?? 'toss') === 'slide') {
        ghosts.forEach((ghost, index) => {
          ghost.animate(
            [
              {
                transform: `translate(${flight.from.x}px, ${flight.from.y}px) scale(0.92)`,
                opacity: 0.85,
                offset: 0,
              },
              {
                transform: `translate(${flight.to.x}px, ${flight.to.y}px) scale(1)`,
                opacity: 1,
                offset: 1,
              },
            ],
            {
              duration,
              delay: flight.delayMs + index * 60,
              easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
              fill: 'forwards',
            },
          );
        });
        continue;
      }

      const stagger = simplified
        ? 0
        : flightStagger(flight.budgetMs ?? duration, duration, ghosts.length);
      const styles = pickFlightStyles(ghosts.length);

      ghosts.forEach((ghost, index) => {
        const pieceWidth = ghost.offsetWidth || 56;
        const pieceHeight = ghost.offsetHeight || pieceWidth;

        if (simplified) {
          // 精简档：原地淡入淡出到落点，不翻不飘
          ghost.animate(
            [
              {
                transform: `translate3d(${flight.from.x}px, ${flight.from.y}px, 0)`,
                opacity: 0,
                offset: 0,
              },
              {
                transform: `translate3d(${flight.to.x}px, ${flight.to.y}px, 0)`,
                opacity: 1,
                offset: 1,
              },
            ],
            { duration, delay: flight.delayMs, easing: 'ease-out', fill: 'forwards' },
          );
          return;
        }

        const style = styles[index]!;
        const poses = buildFlightPoses({
          from: flight.from,
          to: flight.to,
          style,
          index,
          arc: flight.arc,
          pieceWidth,
          pieceHeight,
        });

        const timing: KeyframeAnimationOptions = {
          duration: duration * style.durationScale,
          delay: flight.delayMs + index * stagger,
          easing: 'linear',
          fill: 'forwards',
        };

        ghost.dataset.flightStyle = style.name;
        ghost.animate(poseKeyframes(poses), timing);

        const shade = ghost.querySelector<HTMLElement>('.stage-flight__shade');
        const sheen = ghost.querySelector<HTMLElement>('.stage-flight__sheen');
        shade?.animate(shadeKeyframes(poses), timing);
        sheen?.animate(sheenKeyframes(poses), timing);
        shadows[index]?.animate(shadowKeyframes(poses), timing);
      });
    }
  }, [flights, simplified]);

  if (flights.length === 0) return null;

  return (
    <div
      className={className ? `stage-flight-layer ${className}` : 'stage-flight-layer'}
      aria-hidden="true"
      ref={hostRef}
    >
      {flights.map((flight) => {
        const slide = (flight.motion ?? 'toss') === 'slide';
        return (
          <div key={flight.id} data-flight-id={flight.id}>
            {flight.pieces.map((piece) => {
              // 阴影是独立一层（留在桌面上），必须与 ghost 同序出现，
              // 否则 shadows[index] 对不上 ghosts[index]。
              const paper = !slide && !simplified && piece.paper !== false;
              const height = piece.height ?? piece.width;
              return (
                <FlightGhost
                  key={piece.key}
                  width={piece.width}
                  height={height}
                  paper={paper}
                  node={piece.node}
                  className={piece.className}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function FlightGhost({
  width,
  height,
  paper,
  node,
  className,
}: {
  width: number;
  height: number;
  paper: boolean;
  node: ReactNode;
  className?: string;
}) {
  return (
    <>
      {paper && <span className="stage-flight__shadow" style={{ width, height: height * 0.8 }} />}
      <div
        className={className ? `stage-flight__ghost ${className}` : 'stage-flight__ghost'}
        style={{ width, height }}
      >
        {node}
        {paper && (
          <>
            <span className="stage-flight__sheen" />
            <span className="stage-flight__shade" />
          </>
        )}
      </div>
    </>
  );
}
