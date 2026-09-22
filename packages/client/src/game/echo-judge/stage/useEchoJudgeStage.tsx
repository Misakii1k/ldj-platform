import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { EchoJudgePlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, vibrateMyTurn } from './audioCues.ts';

/** 话筒交棒的飞行时长 */
const MIC_FLIGHT_MS = 420;
/** 木槌敲下到台面回弹结束 */
const GAVEL_MS = 460;
/** 揭晓后的停顿：让玩家看清谁是伪人 */
const REVEAL_HOLD_MS = 900;

export interface EchoStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 木槌正在敲下：驱动木槌与台面的动效，演完即清 */
  readonly gavelStriking: boolean;
  /** 正在揭晓身份：被指认席位的身份卡翻面并扫光 */
  readonly revealing: boolean;
  /** 暗角开启：审判阶段聚光判词台 */
  readonly vignette: boolean;
}

/**
 * 伪人测试演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useEchoJudgeStage(view: EchoJudgePlayerView): EchoStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [gavelStriking, setGavelStriking] = useState(false);
  const [revealing, setRevealing] = useState(false);

  // 舞台根节点：锚点查找限定在这棵子树内
  const stageRef = useRef<HTMLDivElement | null>(null);
  const myIdRef = useRef<string | null>(null);
  myIdRef.current = view.me?.playerId ?? null;
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;

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
        case 'speakerAdvanced': {
          // 轮到我发言先震一下，这条和动效档位无关（是提醒而非装饰）
          if (event.to === myIdRef.current) vibrateMyTurn();
          if (!ctx.animated) return;

          const from = (event.from ? seatRect(event.from) : null) ?? anchorRect('bench');
          const to = seatRect(event.to);
          if (!from || !to) return;

          setFlights([
            {
              id: `mic:${event.round}:${event.answeredCount}`,
              // 话筒是被递过去的，不打旋
              motion: 'slide',
              from,
              to,
              arc: 0,
              durationMs: MIC_FLIGHT_MS,
              delayMs: 0,
              pieces: [
                {
                  key: 'mic',
                  width: 30,
                  height: 30,
                  paper: false,
                  node: <span className="ej-mic-token" aria-hidden="true" />,
                },
              ],
            },
          ]);
          await wait(MIC_FLIGHT_MS + 120, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'verdictDelivered': {
          if (!ctx.softAnimated) return;

          // 整段宣判必须收敛在服务端的展示窗口内：超时就压缩而不是拖延阶段
          const budget = fitToDeadline(
            GAVEL_MS + REVEAL_HOLD_MS,
            deadlineRef.current,
            ctx.startedAt,
            600,
          );
          if (budget <= 0) return;

          // 1. 木槌敲下 + 台面回弹
          setGavelStriking(true);
          await wait(Math.min(GAVEL_MS, budget), ctx.signal);
          if (ctx.signal.aborted) return;
          setGavelStriking(false);

          // 2. 被指认者揭晓：身份卡翻面并扫光
          const rest = budget - GAVEL_MS;
          if (rest > 0) {
            setRevealing(true);
            await wait(rest, ctx.signal);
            if (!ctx.signal.aborted) setRevealing(false);
          }
          return;
        }

        // 其余事件只有音效与静态表现（暗角、考题、积分由渲染层直接读 view）
        default:
          return;
      }
    },
    [seatRect, anchorRect],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setGavelStriking(false);
    setRevealing(false);
  }, []);

  const machine = useStageMachine<EchoJudgePlayerView, StageEvent>({
    view,
    namespace: 'echo-judge',
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
    gavelStriking,
    revealing,
    // 审判阶段：聚光判词台，旁听席压暗
    vignette: view.phase === 'judgment',
  };
}
