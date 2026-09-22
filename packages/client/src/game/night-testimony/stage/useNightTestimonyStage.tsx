import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { NightTestimonyPlayerView } from '../types.ts';
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
/** 便签钉上板后的停顿：让玩家看清它落在哪 */
const PIN_HOLD_MS = 420;

export interface NightStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 刚钉上板的便签题号：驱动图钉敲入动效，演完即清 */
  readonly pinningIndex: number | null;
  /** 暗角开启：投票与猜罪阶段。演出层统一管，避免和 phase 判断散在两处 */
  readonly vignette: boolean;
}

/**
 * 囚徒之夜演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useNightTestimonyStage(view: NightTestimonyPlayerView): NightStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [pinningIndex, setPinningIndex] = useState<number | null>(null);

  // 舞台根节点：锚点查找限定在这棵子树内。useStageMachine 也会返回一个，
  // 但 play 回调需要在机器构造前就能读到，所以这里自己持有并透传回去。
  const stageRef = useRef<HTMLDivElement | null>(null);

  /** 席位矩形：席位条由共享外壳渲染，不在舞台子树内，只能从 document 取。 */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'docketPinned': {
          // 便签入板：图钉敲入 + 短暂停顿。位移本身由 CSS 的 FLIP 过渡承担，
          // 这里只负责打开动效标记并守住节拍。
          if (!ctx.softAnimated) return;
          setPinningIndex(event.questionIndex);
          await wait(PIN_HOLD_MS, ctx.signal);
          if (!ctx.signal.aborted) setPinningIndex(null);
          return;
        }

        case 'voteResolved': {
          if (!ctx.animated) return;
          const to = seatRect(event.accusedId) ?? anchorRect('board');
          if (!to) return;

          // 每位投票者的席位飞出一张票，错峰落下
          const legs = event.voterIds
            .map((voterId, index) => {
              const from = seatRect(voterId);
              if (!from) return null;
              return { voterId, from, index };
            })
            .filter((x): x is { voterId: string; from: Rect; index: number } => x !== null);

          if (legs.length === 0) return;

          // 票各自起点不同，所以拆成多个 flight 而不是一叠
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
                  node: <span className="nt-vote-token" aria-hidden="true" />,
                },
              ],
            })),
          );

          await wait(VOTE_FLIGHT_MS + legs.length * VOTE_STAGGER_MS + 200, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        // 其余事件只有音效与静态表现（暗角、席位翻牌由渲染层直接读 view）
        default:
          return;
      }
    },
    [seatRect, anchorRect],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setPinningIndex(null);
  }, []);

  const machine = useStageMachine<NightTestimonyPlayerView, StageEvent>({
    view,
    namespace: 'night-testimony',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演：它受服务端展示时长约束，不能排在上一段动画后面等
    isHardCut: (event) => event.kind === 'gameOver',
    applyFinalState: clear,
    onSettle: clear,
    play: async (event, ctx) => {
      playCueFor(event);
      await playEvent(event, ctx);
    },
  });

  return {
    // 机器自己的 ref 不用：锚点查找与飞行测量都走本地这一个
    stageRef,
    flights,
    isPlaying: machine.isPlaying,
    simplifiedFlights: machine.simplifiedFlights,
    pinningIndex,
    // 投票与狱警猜罪：审讯灯只照桌中央
    vignette: view.phase === 'vote' || view.guessingInProgress,
  };
}
