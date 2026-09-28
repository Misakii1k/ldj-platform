import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { EchoJudgeLastVerdict, EchoJudgePlayerView } from '../types.ts';
import {
  buildVerdictSequence,
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
  type VerdictFlipKind,
} from './deriveStageEvents.ts';
import { playCueFor, vibrateMyTurn } from './audioCues.ts';

/** 话筒交棒的飞行时长（参照 B-courtroom：560ms 抛物线） */
const MIC_FLIGHT_MS = 560;
/** 木槌敲一下 */
const GAVEL_MS = 360;
/** 屏震 */
const SHAKE_MS = 260;
/** 全部翻面可用的总时长（人多时压缩间隔，保证整段 ≤2.4s） */
const FLIP_BUDGET_MS = 1600;
/** 宣判演完后的停留：让玩家看清告示牌与账单（可跳过） */
const VERDICT_HOLD_MS = 900;

/** 宣判演出进度：席位翻面、分数滚动、告示牌与账单由它驱动 */
export interface VerdictPlayback {
  readonly key: string;
  readonly verdict: EchoJudgeLastVerdict;
  /** 已翻面的席位：id → caught/wrong/escaped */
  readonly shown: Readonly<Record<string, VerdictFlipKind>>;
  /** 分数是否滚到新值（false 时席位显示旧分） */
  readonly scored: boolean;
  readonly showBanner: boolean;
  readonly showLedger: boolean;
  /** 演出或停留进行中：显示「跳过」 */
  readonly playing: boolean;
}

export interface EchoStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 木槌正在敲下（立案 / 交棒 / 宣判） */
  readonly gavelStriking: boolean;
  /** 屏震（宣判与立案） */
  readonly shaking: boolean;
  /** 宣判演出；null = 无宣判在播 */
  readonly verdict: VerdictPlayback | null;
  /** 跳过宣判演出，直达最终态 */
  readonly skipVerdict: () => void;
}

/**
 * 伪人测试演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在预算内。这里只描述演什么。
 */
export function useEchoJudgeStage(view: EchoJudgePlayerView): EchoStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [gavelStriking, setGavelStriking] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [verdict, setVerdict] = useState<VerdictPlayback | null>(null);

  // 舞台根节点：锚点查找限定在这棵子树内
  const stageRef = useRef<HTMLDivElement | null>(null);
  const myIdRef = useRef<string | null>(null);
  myIdRef.current = view.me?.playerId ?? null;
  const skipRef = useRef(false);

  /** 席位矩形：自绘席位挂在法庭内，用 data-player-id 标记 */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  const skipVerdict = useCallback(() => {
    skipRef.current = true;
  }, []);

  /** 木槌敲一下 + 可选屏震 */
  const strikeGavel = useCallback(
    async (withShake: boolean, ctx: StagePlayContext) => {
      setGavelStriking(true);
      if (withShake) setShaking(true);
      await wait(GAVEL_MS, ctx.signal);
      if (ctx.signal.aborted) return;
      setGavelStriking(false);
      if (withShake) {
        await wait(Math.max(0, SHAKE_MS - GAVEL_MS + 100), ctx.signal);
        if (!ctx.signal.aborted) setShaking(false);
      }
    },
    [],
  );

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'speakerAdvanced': {
          // 轮到我发言先震一下，这条和动效档位无关（是提醒而非装饰）
          if (event.to === myIdRef.current) vibrateMyTurn();

          if (ctx.animated) {
            const from = (event.from ? seatRect(event.from) : null) ?? anchorRect('bench');
            const to = seatRect(event.to);
            if (from && to) {
              setFlights([
                {
                  id: `mic:${event.round}:${event.answeredCount}`,
                  motion: 'toss',
                  from,
                  to,
                  arc: 90,
                  durationMs: MIC_FLIGHT_MS,
                  delayMs: 0,
                  pieces: [
                    {
                      key: 'mic',
                      width: 44,
                      height: 44,
                      paper: false,
                      node: <span className="ej-mic-token" aria-hidden="true">🎙</span>,
                    },
                  ],
                },
              ]);
              await wait(MIC_FLIGHT_MS + 120, ctx.signal);
              if (ctx.signal.aborted) return;
              setFlights([]);
            }
          }
          // 交棒落地，木槌敲一下（信息性反馈，reduced 档保留）
          if (ctx.softAnimated) {
            await strikeGavel(false, ctx);
          }
          return;
        }

        case 'topicRevealed': {
          // 立案：木槌敲下 + 轻屏震
          if (!ctx.softAnimated) return;
          await strikeGavel(true, ctx);
          return;
        }

        case 'verdictDelivered': {
          const snap: EchoJudgeLastVerdict = {
            round: event.round,
            judgeId: event.judgeId,
            accusations: event.accusations,
            caught: event.caught,
            wrong: event.wrong,
            escaped: event.escaped,
            scoreDelta: event.scoreDelta,
          };
          const key = `verdict:${event.round}`;
          const flips = buildVerdictSequence(snap);
          const finalState = (playing: boolean): VerdictPlayback => ({
            key,
            verdict: snap,
            shown: Object.fromEntries(flips.map((f) => [f.id, f.kind])),
            scored: true,
            showBanner: true,
            showLedger: true,
            playing,
          });

          skipRef.current = false;

          if (!ctx.softAnimated) {
            // minimal / off：直接显示终态，停留后收起（终局同样交给渲染层）
            setVerdict(finalState(true));
            await wait(VERDICT_HOLD_MS, ctx.signal);
            if (!ctx.signal.aborted) setVerdict(null);
            return;
          }

          const step = (ms: number) => (skipRef.current ? Promise.resolve() : wait(ms, ctx.signal));
          setVerdict({ key, verdict: snap, shown: {}, scored: false, showBanner: false, showLedger: false, playing: true });

          // 1. 木槌敲下 + 屏震
          await strikeGavel(true, ctx);
          if (ctx.signal.aborted) return;
          await step(80);

          // 2/3. 被指认者翻面 → 漏网伪人浮出
          const perFlip = Math.min(260, Math.floor(FLIP_BUDGET_MS / Math.max(flips.length, 1)));
          const shown: Record<string, VerdictFlipKind> = {};
          for (const flip of flips) {
            if (skipRef.current) break;
            shown[flip.id] = flip.kind;
            setVerdict({ key, verdict: snap, shown: { ...shown }, scored: false, showBanner: false, showLedger: false, playing: true });
            await step(perFlip);
            if (ctx.signal.aborted) return;
          }

          // 4. 中央告示牌 → 5. 分数滚动 + 账单
          if (!skipRef.current) {
            setVerdict({ key, verdict: snap, shown: { ...shown }, scored: false, showBanner: true, showLedger: false, playing: true });
            await step(320);
            if (ctx.signal.aborted) return;
          }
          setVerdict(finalState(true));

          // 停留后收起：中途轮次露出下一轮立案；终局由渲染层接管
          // （席位按 reveal.roles 全翻面、告示牌换「审判结案」、结算面板）。
          await wait(VERDICT_HOLD_MS, ctx.signal);
          if (!ctx.signal.aborted) setVerdict(null);
          return;
        }

        // 其余事件只有音效与静态表现（暗角、考题、积分由渲染层直接读 view）
        default:
          return;
      }
    },
    [seatRect, anchorRect, strikeGavel, view.phase],
  );

  const clearStage = useCallback(() => {
    setFlights([]);
    setGavelStriking(false);
    setShaking(false);
    setVerdict(null);
    skipRef.current = false;
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
    applyFinalState: clearStage,
    onSettle: () => {
      // 宣判画面有自己的停留节奏，不清 verdict；只收飞行物与木槌
      setFlights([]);
      setGavelStriking(false);
      setShaking(false);
    },
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
    shaking,
    verdict,
    skipVerdict,
  };
}
