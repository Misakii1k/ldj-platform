import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import { PartyCard } from '../../party-table/PartyCard.tsx';
import type { UnoCard, UnoHousePlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, VIBRATE } from './audioCues.ts';

/** 一张牌飞到弃牌堆的时长（契约 §5） */
const PLAY_FLIGHT_MS = 520;
/** 摸牌飞回手边的时长（契约 §5） */
const DRAW_FLIGHT_MS = 460;

const CARD_W = 50;
const CARD_H = 76;

export interface UnoStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
}

/**
 * UNO 欢乐房规演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useUnoHouseStage(view: UnoHousePlayerView): UnoStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);

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

  /**
   * 我这一侧：扇形手牌中心的一张牌位。
   * slide 飞行按矩形左上角落点（toss 按中心），而手牌锚量到的是整条扇形区；
   * 若直接把整条矩形交给 slide，牌会落在左下角——恰好是我的头像贴纸位。
   * 这里统一收敛成以扇形中心为落点的牌尺寸矩形，两种运动模式落点一致。
   */
  const myHand = useCallback((): Rect => {
    const fan = anchorRect('hand');
    if (fan) {
      return {
        x: fan.x + fan.width / 2 - CARD_W / 2,
        y: fan.y + fan.height / 2 - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
      };
    }
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
    (key: string, card: UnoCard | null) => ({
      key,
      width: CARD_W,
      height: CARD_H,
      // 牌是硬纸板，不做钞票那种翻面压暗与高光
      paper: false,
      // 飞行层渲染实体 PartyCard（出牌为牌面、摸牌为背面），不再是透明占位
      node: card === null ? (
        <PartyCard card={{ face: 'back', color: 'back' }} backLabel="UNO" className="uno-flight-card" />
      ) : (
        <PartyCard card={card} className="uno-flight-card" />
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
              pieces: [cardPiece(`play-${event.seq}`, event.card)],
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
                cardPiece(`draw-${event.seq}-${event.playerId}-${k}`, null),
              ),
            },
          ]);
          await wait(DRAW_FLIGHT_MS + 140, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'colorChanged': {
          // 换色视觉由 PartyCloth 按 data-color 变化接管（擦除式泼色）；
          // 此处只保留音效（playCueFor）与时间线节拍
          if (!ctx.softAnimated) return;
          await wait(220, ctx.signal);
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
  };
}
