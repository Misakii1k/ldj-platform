import { FlightLayer, type StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import { WitsBanknote, NOTE_ASPECT } from './WitsBanknote.tsx';
import { WitsAnswerCard } from './WitsAnswerCard.tsx';
import type { FlightSpec } from './useWitsWagersStage.ts';

export interface WitsFlightLayerProps {
  readonly flights: readonly FlightSpec[];
  /** 低动效档位：只做淡入淡出，不做翻转与景深 */
  readonly simplified?: boolean;
}

/**
 * 一智千金的飞行层适配器。
 *
 * 几何、节拍与 3D 都由 shared-ui/stage/FlightLayer 负责；这里只把本游戏的
 * FlightSpec 翻译成通用的 StageFlight，并提供钞票 / 答案牌两种节点。
 *
 * 牌就是普通放置：直线到位 + 轻微落位缩放（motion='slide'），不翻转不飘动不做景深。
 * 纸张飘动只属于钞票——一张牌在桌上被推过去时不会打旋。
 */
export function WitsFlightLayer({ flights, simplified = false }: WitsFlightLayerProps) {
  const stageFlights: StageFlight[] = flights.map((flight) => {
    if (flight.kind === 'card') {
      return {
        id: flight.id,
        motion: 'slide' as const,
        from: flight.from,
        to: flight.to,
        arc: flight.arc,
        durationMs: flight.durationMs,
        delayMs: flight.delayMs,
        pieces: [
          {
            key: `${flight.id}-card`,
            width: flight.from.width || 64,
            height: flight.from.height || 44,
            paper: false,
            className: 'ww-flight__ghost--card',
            // 交牌演出：背面朝上，DOM 里不含任何数值
            node: <WitsAnswerCard target={null} faceUp={false} />,
          },
        ],
      };
    }

    const width = flight.noteWidth ?? 56;
    return {
      id: flight.id,
      motion: 'toss' as const,
      from: flight.from,
      to: flight.to,
      arc: flight.arc,
      durationMs: flight.durationMs,
      delayMs: flight.delayMs,
      budgetMs: flight.budgetMs,
      pieces: (flight.notes ?? []).map((denom, index) => ({
        key: `${flight.id}-${index}`,
        width,
        height: Math.round(width * NOTE_ASPECT),
        paper: true,
        node: (
          <WitsBanknote
            denomination={denom}
            width={width}
            badge={index === 0 ? flight.badge ?? null : null}
          />
        ),
      })),
    };
  });

  return <FlightLayer flights={stageFlights} simplified={simplified} className="ww-flight-layer" />;
}
