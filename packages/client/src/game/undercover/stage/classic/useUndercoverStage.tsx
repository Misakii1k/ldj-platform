import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, wait, type Rect } from '../../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../../shared-ui/stage/FlightLayer.tsx';
import type { UndercoverPlayerView } from '../../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, vibrateMyTurn } from './audioCues.ts';

/** 一张票飞行的基准时长 */
const VOTE_FLIGHT_MS = 520;
/** 票之间的错峰间隔 */
const VOTE_STAGGER_MS = 70;
/** 淘汰落定后的停顿：让玩家看清谁出局 */
const OUT_HOLD_MS = 800;

export interface UndercoverStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 刚被票出的玩家：驱动席位翻身份，演完即清 */
  readonly eliminatingIds: readonly string[];
}

/**
 * 谁是卧底（classic）演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useUndercoverStage(view: UndercoverPlayerView): UndercoverStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [eliminatingIds, setEliminatingIds] = useState<readonly string[]>([]);

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
      switch (event.kind) {
        case 'speakerAdvanced': {
          // 轮到我发言先震一下：提醒而非装饰，不受动效档位限制
          if (event.isMe) vibrateMyTurn();
          return;
        }

        case 'voteResolved': {
          if (!ctx.animated || event.eliminatedId === null) return;
          const to = seatRect(event.eliminatedId);
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
                  node: <span className="uc-vote-token" aria-hidden="true" />,
                },
              ],
            })),
          );
          await wait(budget, ctx.signal);
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

        default:
          return;
      }
    },
    [seatRect],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setEliminatingIds([]);
  }, []);

  const machine = useStageMachine<UndercoverPlayerView, StageEvent>({
    view,
    namespace: 'undercover',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 换轮与终局必须立刻开演，不能排在上一段动画后面等
    isHardCut: (event) => event.kind === 'roundStarted' || event.kind === 'gameOver',
    isRoundReset: (event) => event.kind === 'roundStarted',
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
  };
}
