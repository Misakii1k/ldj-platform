import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { LandlordPlatformPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, VIBRATE } from './audioCues.ts';

/** 一手牌飞到中央的时长 */
const PLAY_FLIGHT_MS = 460;
/** 底牌翻开的停顿 */
const BOTTOM_REVEAL_MS = 900;

const CARD_W = 44;
const CARD_H = 62;

export interface LandlordStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 底牌正在翻开：驱动底牌区的揭晓动效 */
  readonly revealingBottom: boolean;
  /** 炸弹横幅：交给 TabletopEventOverlay 呈现 */
  readonly bombBanner: { label: string; multiplier: number } | null;
  readonly dismissBomb: () => void;
}

/**
 * 斗地主演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useLandlordStage(view: LandlordPlatformPlayerView): LandlordStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [revealingBottom, setRevealingBottom] = useState(false);
  const [bombBanner, setBombBanner] = useState<{ label: string; multiplier: number } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;

  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  /** 我这一侧：手牌区；测不到时退到屏幕下方中央。 */
  const myHand = useCallback((): Rect => {
    const hand = anchorRect('hand');
    if (hand) return hand;
    if (typeof window === 'undefined') return { x: 0, y: 0, width: CARD_W, height: CARD_H };
    return {
      x: window.innerWidth * 0.5 - CARD_W / 2,
      y: window.innerHeight * 0.82,
      width: CARD_W,
      height: CARD_H,
    };
  }, [anchorRect]);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'myTurnStarted':
          // 提醒而非装饰：不受动效档位限制
          VIBRATE.myTurn();
          return;

        case 'bombDropped': {
          VIBRATE.bomb();
          setBombBanner({
            label: event.comboType === 'rocket' ? '王炸！' : '炸弹！',
            multiplier: event.multiplier,
          });
          return;
        }

        case 'landlordDecided': {
          if (!ctx.softAnimated) return;
          // 底牌翻开：这是「谁是地主、底牌是什么」的关键信息
          setRevealingBottom(true);
          await wait(BOTTOM_REVEAL_MS, ctx.signal);
          if (!ctx.signal.aborted) setRevealingBottom(false);
          return;
        }

        case 'cardsPlayed': {
          if (!ctx.animated) return;
          const from =
            event.playerId === viewRef.current.me?.playerId
              ? myHand()
              : seatRect(event.playerId);
          const to = anchorRect('trick');
          if (!from || !to) return;

          const budget = fitToDeadline(
            PLAY_FLIGHT_MS + 140,
            deadlineRef.current,
            ctx.startedAt,
            300,
          );
          if (budget <= 0) return;

          setFlights([
            {
              id: `play:${event.seq}`,
              // 牌被甩到桌中央：抛物线 + 景深，不翻面
              motion: 'toss',
              from,
              to,
              arc: 64,
              durationMs: PLAY_FLIGHT_MS,
              delayMs: 0,
              // 一手可能好几张，最多画 5 张避免刷屏
              pieces: Array.from({ length: Math.min(event.count, 5) }, (_, k) => ({
                key: `play-${event.seq}-${k}`,
                width: CARD_W,
                height: CARD_H,
                paper: false,
                node: <span className="ld-flight-card" aria-hidden="true" />,
              })),
            },
          ]);
          await wait(budget, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        default:
          return;
      }
    },
    [anchorRect, myHand, seatRect],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setRevealingBottom(false);
  }, []);

  const machine = useStageMachine<LandlordPlatformPlayerView, StageEvent>({
    view,
    namespace: 'landlord',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演，不能排在上一手牌的飞行后面等
    isHardCut: (event) => event.kind === 'gameOver',
    applyFinalState: clear,
    onSettle: clear,
    play: async (event, ctx) => {
      playCueFor(event);
      await playEvent(event, ctx);
    },
  });

  const dismissBomb = useCallback(() => setBombBanner(null), []);

  return {
    stageRef,
    flights,
    isPlaying: machine.isPlaying,
    simplifiedFlights: machine.simplifiedFlights,
    revealingBottom,
    bombBanner,
    dismissBomb,
  };
}
