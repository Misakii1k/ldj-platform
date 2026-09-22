import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { UnoHousePlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, VIBRATE } from './audioCues.ts';

/** 一张牌飞到弃牌堆的时长 */
const PLAY_FLIGHT_MS = 440;
/** 摸牌飞回手边的时长 */
const DRAW_FLIGHT_MS = 360;
/** 换色扫光的持续 */
const COLOR_SWEEP_MS = 520;

const CARD_W = 50;
const CARD_H = 76;

export interface UnoStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 刚换成的颜色：驱动中央牌堆扫光，演完即清 */
  readonly sweepColor: string | null;
}

/**
 * UNO 欢乐房规演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useUnoHouseStage(view: UnoHousePlayerView): UnoStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [sweepColor, setSweepColor] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  /** 我这一侧：扇形手牌；测不到时退到屏幕下方中央。 */
  const myHand = useCallback((): Rect => {
    const fan = anchorRect('hand');
    if (fan) return fan;
    if (typeof window === 'undefined') return { x: 0, y: 0, width: CARD_W, height: CARD_H };
    return {
      x: window.innerWidth * 0.5 - CARD_W / 2,
      y: window.innerHeight * 0.84,
      width: CARD_W,
      height: CARD_H,
    };
  }, [anchorRect]);

  const handOf = useCallback(
    (playerId: string | null): Rect | null => {
      if (playerId === null) return anchorRect('discard');
      if (playerId === viewRef.current.me?.playerId) return myHand();
      return seatRect(playerId);
    },
    [anchorRect, myHand, seatRect],
  );

  const cardPiece = useCallback(
    (key: string, faceDown: boolean) => ({
      key,
      width: CARD_W,
      height: CARD_H,
      // 牌是硬纸板，不做钞票那种翻面压暗与高光
      paper: false,
      node: (
        <span className="uno-flight-card" data-face={faceDown ? 'back' : 'front'} aria-hidden="true" />
      ),
    }),
    [],
  );

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'myTurnStarted':
          VIBRATE.myTurn();
          return;

        case 'unoRaceOpened':
          // 被抓漏报的是我：必须立刻感知
          if (event.isMe) VIBRATE.alert();
          return;

        case 'penaltyStacked':
          if (event.isMe) VIBRATE.alert();
          return;

        case 'cardPlayed': {
          if (!ctx.animated) return;
          const from = handOf(event.playerId);
          const to = anchorRect('discard');
          if (!from || !to) return;

          setFlights([
            {
              id: `play:${event.seq}`,
              // 牌被甩到桌中央：抛物线 + 景深，但不翻面
              motion: 'toss',
              from,
              to,
              arc: 66,
              durationMs: PLAY_FLIGHT_MS,
              delayMs: 0,
              pieces: [cardPiece(`play-${event.seq}`, false)],
            },
          ]);
          await wait(PLAY_FLIGHT_MS + 110, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'cardDrawn': {
          if (!ctx.animated) return;
          const from = anchorRect('draw');
          const to = handOf(event.playerId);
          if (!from || !to) return;

          setFlights([
            {
              id: `draw:${event.seq}:${event.playerId}`,
              // 摸牌是被递过来的，直线滑行不打旋
              motion: 'slide',
              from,
              to,
              arc: 0,
              durationMs: DRAW_FLIGHT_MS,
              delayMs: 0,
              // 罚牌可能一次多张，最多画 4 张避免刷屏
              pieces: Array.from({ length: Math.min(event.count, 4) }, (_, k) =>
                cardPiece(`draw-${event.seq}-${event.playerId}-${k}`, true),
              ),
            },
          ]);
          await wait(DRAW_FLIGHT_MS + 140, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'colorChanged': {
          if (!ctx.softAnimated) return;
          setSweepColor(event.color);
          await wait(COLOR_SWEEP_MS, ctx.signal);
          if (!ctx.signal.aborted) setSweepColor(null);
          return;
        }

        default:
          return;
      }
    },
    [anchorRect, handOf, cardPiece],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setSweepColor(null);
  }, []);

  const machine = useStageMachine<UnoHousePlayerView, StageEvent>({
    view,
    namespace: 'uno-house',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 换局与终场必须立刻开演，不能排在上一张牌的飞行后面等
    isHardCut: (event) => event.kind === 'roundOver' || event.kind === 'matchOver',
    isRoundReset: (event) => event.kind === 'roundOver',
    applyFinalState: clear,
    onSettle: clear,
    play: async (event, ctx) => {
      playCueFor(event);
      await playEvent(event, ctx);
    },
  });

  return {
    stageRef,
    flights,
    isPlaying: machine.isPlaying,
    simplifiedFlights: machine.simplifiedFlights,
    sweepColor,
  };
}
