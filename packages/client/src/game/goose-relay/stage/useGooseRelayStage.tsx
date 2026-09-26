import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { GooseRelayPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, vibrateMyTurn } from './audioCues.ts';
import { gooseAvatarFor } from './PastureProps.tsx';

/** 鹅卡沿轨道飞到下一棒的时长 */
const PASS_FLIGHT_MS = 560;
/** 接收席位光晕的持续 */
const GLOW_MS = 700;
/** 终局鹅群列队：每只错峰 */
const PARADE_LEG_MS = 180;
/** 飞行鹅卡：320×440 原图等比缩到 72px 宽 */
const PASS_CARD_W = 72;
const PASS_CARD_H = Math.round((PASS_CARD_W * 440) / 320);
/** 终局列队的鹅小一号 */
const PARADE_CARD_W = 40;
const PARADE_CARD_H = Math.round((PARADE_CARD_W * 440) / 320);

export interface GooseStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 刚接到棒的玩家：驱动其席位光晕，演完即清 */
  readonly receivingId: string | null;
  /** 刚落定的指认序号与对错：驱动印章 */
  readonly stamp: { seq: number; correct: boolean } | null;
}

/**
 * 以鹅传鹅演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useGooseRelayStage(
  view: GooseRelayPlayerView,
  /** 玩家 → 鹅卡头像；与牧场跑道同一份分配，飞出去的就是跑道上那只鹅 */
  avatarOf: (playerId: string) => string = gooseAvatarFor,
): GooseStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [stamp, setStamp] = useState<{ seq: number; correct: boolean } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;
  const avatarRef = useRef(avatarOf);
  avatarRef.current = avatarOf;

  /**
   * 席位矩形：优先取牧场跑道上的鹅卡（鹅沿跑道弧线传）；
   * 跑道不在场的阶段退回外壳席位环——它不在舞台子树内，只能从 document 取。
   */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    const id = CSS.escape(playerId);
    return (
      measure(document.querySelector(`[data-gr-seat="${id}"]`)) ??
      measure(document.querySelector(`[data-player-id="${id}"]`))
    );
  }, []);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'relayPassed': {
          // 轮到我接棒先震一下：提醒而非装饰，不受动效档位限制
          if (event.isMeNext) vibrateMyTurn();

          const toId = event.toPlayerId;
          if (!toId) return;

          if (ctx.animated) {
            const fromId = viewRef.current.lineOrder[event.fromIndex];
            const from = fromId ? seatRect(fromId) : null;
            const to = seatRect(toId);
            if (from && to) {
              setFlights([
                {
                  id: `pass:${event.toIndex}`,
                  // 鹅卡沿圆弧传到下一棒：抛物线 + 景深
                  motion: 'toss',
                  from,
                  to,
                  arc: 84,
                  durationMs: PASS_FLIGHT_MS,
                  delayMs: 0,
                  pieces: [
                    {
                      key: `pass-${event.toIndex}`,
                      width: PASS_CARD_W,
                      height: PASS_CARD_H,
                      // 鹅卡是硬卡片，不做钞票那种翻面压暗
                      paper: false,
                      // 飞的是上一棒自己那只鹅：从哪张卡起飞就是哪张卡的样子
                      node: (
                        <img
                          className="gr-pass-token"
                          src={avatarRef.current(fromId ?? toId)}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                        />
                      ),
                    },
                  ],
                },
              ]);
              await wait(PASS_FLIGHT_MS, ctx.signal);
              if (ctx.signal.aborted) return;
              setFlights([]);
            }
          }

          // 接收席位光晕：即使低动效档位也保留（它是「轮到谁」的信息）
          if (ctx.softAnimated) {
            setReceivingId(toId);
            await wait(GLOW_MS, ctx.signal);
            if (!ctx.signal.aborted) setReceivingId(null);
          }
          return;
        }

        case 'accusationMade': {
          if (!ctx.softAnimated) return;
          setStamp({ seq: event.seq, correct: event.correct });
          await wait(900, ctx.signal);
          if (!ctx.signal.aborted) setStamp(null);
          return;
        }

        case 'gameOver': {
          if (!ctx.animated) return;
          // 鹅群列队：各席位飞出一只鹅到队首方向，收敛在展示窗口内
          const head = viewRef.current.headPlayerId;
          const to = head ? seatRect(head) : null;
          if (!to) return;

          const budget = fitToDeadline(
            PARADE_LEG_MS * viewRef.current.players.length + 400,
            deadlineRef.current,
            ctx.startedAt,
            400,
          );
          if (budget <= 0) return;

          const parade: StageFlight[] = [];
          viewRef.current.players.forEach((id, index) => {
            if (id === head) return;
            const from = seatRect(id);
            if (!from) return;
            parade.push({
              id: `parade:${id}`,
              motion: 'slide',
              from,
              to,
              arc: 0,
              durationMs: PARADE_LEG_MS * 2,
              delayMs: index * PARADE_LEG_MS,
              pieces: [
                {
                  key: `parade-${id}`,
                  width: PARADE_CARD_W,
                  height: PARADE_CARD_H,
                  paper: false,
                  node: (
                    <img
                      className="gr-pass-token"
                      data-parade="true"
                      src={avatarRef.current(id)}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                    />
                  ),
                },
              ],
            });
          });
          if (parade.length === 0) return;

          setFlights(parade);
          await wait(budget, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
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
    setReceivingId(null);
    setStamp(null);
  }, []);

  const machine = useStageMachine<GooseRelayPlayerView, StageEvent>({
    view,
    namespace: 'goose-relay',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演，不能排在上一段传递后面等
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
    receivingId,
    stamp,
  };
}
