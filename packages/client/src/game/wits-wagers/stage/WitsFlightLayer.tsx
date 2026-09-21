import { useEffect, useRef } from 'react';
import { flyGhost } from './flip.ts';
import { WitsChip } from './WitsChip.tsx';
import { WitsAnswerCard } from './WitsAnswerCard.tsx';
import type { FlightSpec } from './useWitsWagersStage.ts';

export interface WitsFlightLayerProps {
  readonly flights: readonly FlightSpec[];
}

/**
 * 飞行幽灵层。
 *
 * 必须挂在毡面（preserve-3d + perspective）子树之外：一旦有 transform 祖先，
 * position:fixed 会变成相对该祖先定位，实测的屏幕坐标就全部失效。
 */
export function WitsFlightLayer({ flights }: WitsFlightLayerProps) {
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const startedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = new Set(flights.map((f) => f.id));
    // 丢弃已结束飞行的记录，避免同一 id 复用时不再播放
    for (const id of [...startedRef.current]) {
      if (!live.has(id)) startedRef.current.delete(id);
    }

    for (const flight of flights) {
      if (startedRef.current.has(flight.id)) continue;
      const node = nodesRef.current.get(flight.id);
      if (!node) continue;
      startedRef.current.add(flight.id);
      void flyGhost(node, flight.from, flight.to, {
        durationMs: flight.durationMs,
        delayMs: flight.delayMs,
        arc: flight.arc,
      });
    }
  }, [flights]);

  if (flights.length === 0) return null;

  return (
    <div className="ww-flight-layer" aria-hidden="true">
      {flights.map((flight) => (
        <div
          key={flight.id}
          className="ww-flight-layer__ghost"
          ref={(node) => {
            if (node) nodesRef.current.set(flight.id, node);
            else nodesRef.current.delete(flight.id);
          }}
        >
          {flight.kind === 'card' ? (
            // 交牌演出：飞的是一张背面朝上的答案牌，DOM 里不含任何数值
            <div
              className="ww-flight-layer__card"
              style={{ width: flight.from.width || 64, height: flight.from.height || 44 }}
            >
              <WitsAnswerCard target={null} faceUp={false} />
            </div>
          ) : (
            <WitsChip
              chipId={flight.chipId ?? 'A'}
              extraStake={flight.extraStake ?? 0}
              size={Math.round(flight.from.width) || 36}
            />
          )}
        </div>
      ))}
    </div>
  );
}
