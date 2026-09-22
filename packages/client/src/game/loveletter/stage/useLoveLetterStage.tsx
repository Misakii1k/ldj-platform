import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { LoveLetterPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, vibrateMyTurn } from './audioCues.ts';

/** 信封飞到中央的时长 */
const PLAY_FLIGHT_MS = 480;
/** 淘汰落定后的停顿：让玩家看清谁出局、手里是什么 */
const OUT_HOLD_MS = 900;
/** 庇护盾牌亮起的持续 */
const SHIELD_MS = 620;

const CARD_W = 48;
const CARD_H = 68;

export interface LoveLetterStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 刚被淘汰的玩家：驱动席位翻手牌，演完即清 */
  readonly eliminatingIds: readonly string[];
  /** 刚被庇护的玩家：驱动盾牌亮起，演完即清 */
  readonly shieldingIds: readonly string[];
}

/**
 * 情书演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内（这款无 timer，
 * 所以第三条退化为只受自身节拍约束）。
 */
export function useLoveLetterStage(view: LoveLetterPlayerView): LoveLetterStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [eliminatingIds, setEliminatingIds] = useState<readonly string[]>([]);
  const [shieldingIds, setShieldingIds] = useState<readonly string[]>([]);

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
          vibrateMyTurn();
          return;

        case 'cardPlayed': {
          if (!ctx.animated) return;
          const from =
            event.playerId === viewRef.current.me?.playerId
              ? myHand()
              : seatRect(event.playerId);
          const to = anchorRect('discard') ?? anchorRect('deck');
          if (!from || !to) return;

          setFlights([
            {
              id: `play:${event.seq}:${event.playerId}`,
              // 信封被推到桌中央：抛物线 + 景深，不翻面（翻开由落地后的静态渲染负责）
              motion: 'toss',
              from,
              to,
              arc: 62,
              durationMs: PLAY_FLIGHT_MS,
              delayMs: 0,
              pieces: [
                {
                  key: `env-${event.seq}-${event.playerId}`,
                  width: CARD_W,
                  height: CARD_H,
                  paper: false,
                  node: <span className="ll-flight-envelope" aria-hidden="true" />,
                },
              ],
            },
          ]);
          await wait(PLAY_FLIGHT_MS + 120, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'eliminated': {
          if (!ctx.softAnimated) return;
          setEliminatingIds(event.playerIds);
          await wait(OUT_HOLD_MS, ctx.signal);
          if (!ctx.signal.aborted) setEliminatingIds([]);
          return;
        }

        case 'protected': {
          if (!ctx.softAnimated) return;
          setShieldingIds(event.playerIds);
          await wait(SHIELD_MS, ctx.signal);
          if (!ctx.signal.aborted) setShieldingIds([]);
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
    setEliminatingIds([]);
    setShieldingIds([]);
  }, []);

  const machine = useStageMachine<LoveLetterPlayerView, StageEvent>({
    view,
    namespace: 'loveletter',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 换轮与终局必须立刻开演，不能排在上一封信的飞行后面等
    isHardCut: (event) => event.kind === 'roundOver' || event.kind === 'gameOver',
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
    eliminatingIds,
    shieldingIds,
  };
}
