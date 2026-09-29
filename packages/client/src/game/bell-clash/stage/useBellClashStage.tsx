import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { BellClashPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor } from './audioCues.ts';

import type { PartySlamKind } from '../../party-table/PartySlam.tsx';

const PLAY_FLIGHT_MS = 460;
const DRAW_FLIGHT_MS = 380;
const BELL_PRESS_MS = 380;
const SWEEP_LEG_MS = 260;

const CARD_W = 60;
const CARD_H = 90;

export interface BellStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 铃被敲击下沉 */
  readonly bellHit: boolean;
  /** 铃拍错左右晃 */
  readonly bellMiss: boolean;
  /** 拍错方印章呈现 */
  readonly showNope: boolean;
  /** 冲屏大字演出 */
  readonly slam: { text: string; kind?: PartySlamKind } | null;
  /** 泼色原点与目标色 */
  readonly splash: { color: string; origin: { x: number; y: number } } | null;
  /** 手动触发本人的铃拍动演出（如挑卡时） */
  readonly triggerBellHit: () => void;
  /** 手动触发错按铃演出（如手里无短语卡时） */
  readonly triggerBellMiss: () => void;
  /** 手动触发冲屏大字 */
  readonly triggerSlam: (text: string, kind?: PartySlamKind) => void;
  readonly dismissSlam: () => void;
}

export function useBellClashStage(
  view: BellClashPlayerView,
  nameOf: (playerId: string) => string,
): BellStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [bellHit, setBellHit] = useState(false);
  const [bellMiss, setBellMiss] = useState(false);
  const [showNope, setShowNope] = useState(false);
  const [slam, setSlam] = useState<{ text: string; kind?: PartySlamKind } | null>(null);
  const [splash, setSplash] = useState<{ color: string; origin: { x: number; y: number } } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  const viewRef = useRef(view);
  viewRef.current = view;

  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

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
    (playerId: string): Rect | null => {
      if (playerId === viewRef.current.me?.playerId) return myHand();
      return seatRect(playerId);
    },
    [myHand, seatRect],
  );

  const cardPiece = useCallback(
    (key: string, faceDown: boolean) => ({
      key,
      width: CARD_W,
      height: CARD_H,
      paper: false,
      node: (
        <span
          className="pt-card pt-card--flight"
          data-face={faceDown ? 'back' : 'front'}
          aria-hidden="true"
        />
      ),
    }),
    [],
  );

  const triggerBellHit = useCallback(() => {
    setBellHit(true);
    setTimeout(() => setBellHit(false), BELL_PRESS_MS);
  }, []);

  const triggerBellMiss = useCallback(() => {
    setBellMiss(true);
    setTimeout(() => setBellMiss(false), 460);
  }, []);

  const triggerSlam = useCallback(
    (text: string, kind: PartySlamKind = 'ding') => {
      setSlam({ text, kind });
    },
    [],
  );

  const dismissSlam = useCallback(() => {
    setSlam(null);
  }, []);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'myTurnStarted':
          return;

        case 'bellRung': {
          setBellHit(true);
          triggerSlam('叮！', 'ding');
          await wait(BELL_PRESS_MS, ctx.signal);
          if (!ctx.signal.aborted) setBellHit(false);
          return;
        }

        case 'challengeResolved': {
          if (event.success) {
            // 抢到回合：泼色成短语卡颜色 + 冲屏
            const discardEl = anchorRect('discard');
            if (discardEl) {
              setSplash({
                color: event.card.color,
                origin: { x: discardEl.x + discardEl.width / 2, y: discardEl.y + discardEl.height / 2 },
              });
            }
            triggerSlam('抢到回合！', 'ding');
            await wait(700, ctx.signal);
            if (!ctx.signal.aborted) setSplash(null);
          } else {
            // 拍错：盖章没人做过 + 铃左右晃 + 冲屏罚摸
            setShowNope(true);
            setBellMiss(true);
            triggerSlam('拍错了！罚摸 1 张', 'ding');
            await wait(800, ctx.signal);
            if (!ctx.signal.aborted) {
              setShowNope(false);
              setBellMiss(false);
            }
          }
          return;
        }

        case 'cardPlayed': {
          if (!ctx.animated) return;
          const from = handOf(event.playerId);
          const to = anchorRect('discard');
          if (!from || !to) return;

          setFlights([
            {
              id: `play:${event.seq}`,
              motion: 'toss',
              from,
              to,
              arc: 70,
              durationMs: PLAY_FLIGHT_MS,
              delayMs: 0,
              pieces: [cardPiece(`play-${event.seq}`, false)],
            },
          ]);
          await wait(PLAY_FLIGHT_MS + 120, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'cardDrawn':
        case 'penaltyDrawn': {
          if (!ctx.animated) return;

          const from = anchorRect('draw');
          const to = handOf(event.playerId);
          if (!from || !to) return;

          setFlights([
            {
              id: `${event.kind}:${event.seq}:${event.playerId}`,
              motion: 'slide',
              from,
              to,
              arc: 0,
              durationMs: DRAW_FLIGHT_MS,
              delayMs: 0,
              pieces: [cardPiece(`draw-${event.seq}-${event.playerId}`, true)],
            },
          ]);
          await wait(DRAW_FLIGHT_MS + 120, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'gameOver': {
          // 终局由结算画面接管：先清掉可能残留的挑战冲屏/罚摸态，
          // 免得「拍错了！罚摸 1」在早退分支里挂到结算画面上（与获胜横幅重叠）。
          setSlam(null);
          setShowNope(false);
          setBellMiss(false);
          if (!ctx.animated) return;
          const to = anchorRect('discard');
          if (!to) return;

          const legs = viewRef.current.players
            .map((id) => ({ id, count: viewRef.current.handCounts?.[id] ?? 0 }))
            .filter((x) => x.count > 0);
          if (legs.length === 0) return;

          const budget = fitToDeadline(
            SWEEP_LEG_MS * legs.length + 300,
            deadlineRef.current,
            ctx.startedAt,
            400,
          );
          if (budget <= 0) return;

          const sweeps: StageFlight[] = [];
          legs.forEach(({ id, count }, index) => {
            const from = handOf(id);
            if (!from) return;
            sweeps.push({
              id: `sweep:${id}`,
              motion: 'slide',
              from,
              to,
              arc: 0,
              durationMs: SWEEP_LEG_MS,
              delayMs: index * 90,
              pieces: Array.from({ length: Math.min(count, 4) }, (_, k) =>
                cardPiece(`sweep-${id}-${k}`, true),
              ),
            });
          });
          if (sweeps.length === 0) return;
          setFlights(sweeps);

          await wait(budget, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        default:
          return;
      }
    },
    [anchorRect, handOf, cardPiece, triggerSlam],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setBellHit(false);
    setBellMiss(false);
    setShowNope(false);
    setSlam(null);
    setSplash(null);
  }, []);

  const machine = useStageMachine<BellClashPlayerView, StageEvent>({
    view,
    namespace: 'bell-clash',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    isHardCut: (event) => event.kind === 'bellRung' || event.kind === 'challengeResolved' || event.kind === 'gameOver',
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
    bellHit,
    bellMiss,
    showNope,
    slam,
    splash,
    triggerBellHit,
    triggerBellMiss,
    triggerSlam,
    dismissSlam,
  };
}
