import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { CheeseThiefPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor } from './audioCues.ts';

/** 一张票飞行的基准时长 */
const VOTE_FLIGHT_MS = 520;
/** 票之间的错峰间隔 */
const VOTE_STAGGER_MS = 70;

export interface CheeseStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /**
   * 夜间暗角：偷奶酪与拉同伙阶段压下四角。
   * 由演出层统一管，避免和 phase 判断散在两处。
   */
  readonly vignette: boolean;
}

/**
 * 奶酪大盗演出编排。
 *
 * 这款的 three.js 奶酪、骰盅与结算揭晓都已经做得很好，本轮只补两件事：
 * 1. 接入 useStageMachine，让终局揭晓按 roundToken 去重——演到一半刷新
 *    不会重演一次（这是接入演出层最主要的收益）；
 * 2. 夜间暗角与开票飞行。
 */
export function useCheeseThiefStage(view: CheeseThiefPlayerView): CheeseStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;

  /** 席位矩形：席位环由外壳渲染，不在舞台子树内，只能从 document 取。 */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      if (event.kind !== 'voteResolved') return;
      if (!ctx.animated || event.accusedId === null) return;

      const to = seatRect(event.accusedId);
      if (!to) return;

      const legs = event.voterIds
        .map((voterId, index) => {
          const from = seatRect(voterId);
          if (!from) return null;
          return { voterId, from, index };
        })
        .filter((x): x is { voterId: string; from: Rect; index: number } => x !== null);
      if (legs.length === 0) return;

      const planned = VOTE_FLIGHT_MS + legs.length * VOTE_STAGGER_MS + 200;
      const budget = fitToDeadline(planned, deadlineRef.current, ctx.startedAt, 400);
      if (budget <= 0) return;

      setFlights(
        legs.map(({ voterId, from, index }) => ({
          id: `vote:${voterId}`,
          motion: 'toss' as const,
          from,
          to,
          arc: 56,
          durationMs: VOTE_FLIGHT_MS,
          delayMs: index * VOTE_STAGGER_MS,
          pieces: [
            {
              key: `vote-${voterId}`,
              width: 26,
              height: 26,
              // 票是硬纸片，不做纸张翻飘的压暗与高光
              paper: false,
              node: <span className="cheese-vote-token" aria-hidden="true" />,
            },
          ],
        })),
      );
      await wait(budget, ctx.signal);
      if (!ctx.signal.aborted) setFlights([]);
    },
    [seatRect],
  );

  const clear = useCallback(() => {
    setFlights([]);
  }, []);

  const machine = useStageMachine<CheeseThiefPlayerView, StageEvent>({
    view,
    namespace: 'cheese-thief',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演，不能排在开票飞行后面等
    isHardCut: (event) => event.kind === 'gameOver',
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
    // 夜里偷奶酪、拉同伙：月光只照桌中央
    vignette: view.phase === 'night' || view.phase === 'accomplice_select',
  };
}
