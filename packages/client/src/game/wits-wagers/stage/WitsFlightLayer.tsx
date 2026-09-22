import { useEffect, useRef } from 'react';
import type { NoteDenomination } from '../types.ts';
import { WitsBanknote, NOTE_ASPECT } from './WitsBanknote.tsx';
import { WitsAnswerCard } from './WitsAnswerCard.tsx';
import {
  buildNotePoses,
  noteStagger,
  pickFlightStyles,
  poseKeyframes,
  shadeKeyframes,
  shadowKeyframes,
  sheenKeyframes,
} from './noteFlight.ts';
import type { FlightSpec } from './useWitsWagersStage.ts';

export interface WitsFlightLayerProps {
  readonly flights: readonly FlightSpec[];
  /** 低动效档位：只做淡入淡出，不做翻转与景深 */
  readonly simplified?: boolean;
}

/**
 * 飞行幽灵层。
 *
 * 必须挂在毡面（preserve-3d + perspective）子树之外：一旦有 transform 祖先，
 * position:fixed 会变成相对该祖先定位，实测的屏幕坐标就全部失效。
 *
 * 本层自己是一个 3D 上下文（CSS 里给了 perspective），钞票靠 translateZ
 * 朝镜头靠近产生真实的近大远小，而不是用 scale 假装。
 */
export function WitsFlightLayer({ flights, simplified = false }: WitsFlightLayerProps) {
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

      const ghosts = [...group.querySelectorAll<HTMLElement>('.ww-flight__ghost')];
      const shadows = [...group.querySelectorAll<HTMLElement>('.ww-flight__shadow')];
      if (ghosts.length === 0) continue;

      const duration = flight.durationMs;

      // 牌就是普通放置：直线到位 + 轻微落位缩放，不翻转不飘动不做景深。
      // 纸张飘动只属于钞票——一张牌在桌上被推过去时不会打旋。
      if (flight.kind === 'card') {
        const card = ghosts[0]!;
        card.animate(
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
            delay: flight.delayMs,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            fill: 'forwards',
          },
        );
        continue;
      }

      const stagger = simplified ? 0 : noteStagger(flight.budgetMs ?? duration, duration, ghosts.length);
      const styles = pickFlightStyles(ghosts.length);

      ghosts.forEach((ghost, index) => {
        const noteWidth = ghost.offsetWidth || 56;
        const noteHeight = ghost.offsetHeight || Math.round(noteWidth * NOTE_ASPECT);

        if (simplified) {
          // 精简档：原地淡入淡出到落点，不翻不飘
          const to = flight.to;
          ghost.animate(
            [
              {
                transform: `translate3d(${flight.from.x}px, ${flight.from.y}px, 0)`,
                opacity: 0,
                offset: 0,
              },
              {
                transform: `translate3d(${to.x}px, ${to.y}px, 0)`,
                opacity: 1,
                offset: 1,
              },
            ],
            { duration, delay: flight.delayMs, easing: 'ease-out', fill: 'forwards' },
          );
          return;
        }

        const style = styles[index]!;
        const poses = buildNotePoses({
          from: flight.from,
          to: flight.to,
          style,
          index,
          arc: flight.arc,
          noteWidth,
          noteHeight,
        });

        const timing: KeyframeAnimationOptions = {
          duration: duration * style.durationScale,
          delay: flight.delayMs + index * stagger,
          easing: 'linear',
          fill: 'forwards',
        };

        ghost.dataset.flightStyle = style.name;
        ghost.animate(poseKeyframes(poses), timing);

        const shade = ghost.querySelector<HTMLElement>('.ww-flight__shade');
        const sheen = ghost.querySelector<HTMLElement>('.ww-flight__sheen');
        shade?.animate(shadeKeyframes(poses), timing);
        sheen?.animate(sheenKeyframes(poses), timing);
        shadows[index]?.animate(shadowKeyframes(poses), timing);
      });
    }
  }, [flights, simplified]);

  if (flights.length === 0) return null;

  return (
    <div className="ww-flight-layer" aria-hidden="true" ref={hostRef}>
      {flights.map((flight) => (
        <div key={flight.id} data-flight-id={flight.id}>
          {flight.kind === 'card' ? (
            <div
              className="ww-flight__ghost ww-flight__ghost--card"
              style={{ width: flight.from.width || 64, height: flight.from.height || 44 }}
            >
              {/* 交牌演出：背面朝上，DOM 里不含任何数值 */}
              <WitsAnswerCard target={null} faceUp={false} />
            </div>
          ) : (
            (flight.notes ?? []).map((denom, index) => (
              <FlightNote
                key={`${flight.id}-${index}`}
                denomination={denom}
                width={flight.noteWidth ?? 56}
                badge={index === 0 ? flight.badge ?? null : null}
                simplified={simplified}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function FlightNote({
  denomination,
  width,
  badge,
  simplified,
}: {
  denomination: NoteDenomination;
  width: number;
  badge: 'A' | 'B' | null;
  simplified: boolean;
}) {
  return (
    <>
      {!simplified && <span className="ww-flight__shadow" style={{ width, height: width * NOTE_ASPECT * 0.8 }} />}
      <div
        className="ww-flight__ghost"
        style={{ width, height: Math.round(width * NOTE_ASPECT) }}
      >
        <WitsBanknote denomination={denomination} width={width} badge={badge} />
        {!simplified && (
          <>
            <span className="ww-flight__sheen" />
            <span className="ww-flight__shade" />
          </>
        )}
      </div>
    </>
  );
}
