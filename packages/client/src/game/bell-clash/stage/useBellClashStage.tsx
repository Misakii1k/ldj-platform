import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { BellClashCard, BellClashPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, VIBRATE } from './audioCues.ts';

/** 一张牌飞到弃牌堆的时长 */
const PLAY_FLIGHT_MS = 460;
/** 摸牌飞回手边的时长 */
const DRAW_FLIGHT_MS = 380;
/** 铃按下到弹起 */
const BELL_PRESS_MS = 320;
/** 终局收桌：每人一叠错峰飞回弃牌堆 */
const SWEEP_LEG_MS = 260;

/** 牌的飞行尺寸；与 .bc-discard 的牌面比例一致 */
const CARD_W = 52;
const CARD_H = 78;

export interface BellStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 铃正被按下：驱动铃体下沉与投影压扁 */
  readonly bellPressing: boolean;
  /** 抢铃结果的全屏反馈；由页面交给 TabletopEventOverlay */
  readonly claimBanner: { name: string; isMe: boolean } | null;
  readonly dismissClaim: () => void;
  /** 我刚错拍被罚摸：检视器区域出提示 */
  readonly penalty: boolean;
  /**
   * 最近几手弃牌（最新在前）。服务端只给 discardTop，这里靠差分累积出历史带，
   * 纯展示、不参与任何判定；刷新后从空开始，这是可接受的。
   */
  readonly discardTrail: readonly { seq: number; card: BellClashCard; playerId: string }[];
  /** 每人抢到铃的次数，同样是差分累积的展示数据 */
  readonly claimCounts: Readonly<Record<string, number>>;
}

/** 历史带最多留几张：多了铃左边就挤了 */
const TRAIL_MAX = 5;

/**
 * Ding 演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么。
 */
export function useBellClashStage(
  view: BellClashPlayerView,
  nameOf: (playerId: string) => string,
): BellStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [bellPressing, setBellPressing] = useState(false);
  const [penalty, setPenalty] = useState(false);
  const [claimBanner, setClaimBanner] = useState<{ name: string; isMe: boolean } | null>(null);
  const [discardTrail, setDiscardTrail] = useState<readonly { seq: number; card: BellClashCard; playerId: string }[]>([]);
  const [claimCounts, setClaimCounts] = useState<Readonly<Record<string, number>>>({});

  const stageRef = useRef<HTMLDivElement | null>(null);
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  const viewRef = useRef(view);
  viewRef.current = view;

  /** 席位矩形：席位环由外壳渲染，不在舞台子树内，只能从 document 取。 */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  /** 我这一侧：扇形手牌的位置；测不到时退到屏幕下方中央。 */
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

  /** 某人的「手边」：我用扇形手牌，他人用各自席位。 */
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
      // 牌是硬纸板，不做钞票那种翻面压暗与高光
      paper: false,
      node: (
        <span className="bc-flight-card" data-face={faceDown ? 'back' : 'front'} aria-hidden="true" />
      ),
    }),
    [],
  );

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'myTurnStarted': {
          // 提醒而非装饰：不受动效档位限制
          VIBRATE.myTurn();
          return;
        }

        case 'bellOpened': {
          VIBRATE.bellOpen();
          return;
        }

        case 'cardPlayed': {
          // 先记历史带再演飞行：动效档位关掉时历史带也得更新
          const played = viewRef.current.discardTop;
          if (played) {
            setDiscardTrail((prev) =>
              [{ seq: event.seq, card: played, playerId: event.playerId }, ...prev].slice(0, TRAIL_MAX),
            );
          }
          if (!ctx.animated) return;
          const from = handOf(event.playerId);
          const to = anchorRect('discard');
          if (!from || !to) return;

          setFlights([
            {
              id: `play:${event.seq}`,
              // 牌被甩到桌中央：抛物线 + 3D 景深，但不翻面
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
          const isPenalty = event.kind === 'penaltyDrawn';
          if (isPenalty && event.playerId === viewRef.current.me?.playerId) {
            setPenalty(true);
          }
          if (!ctx.animated) {
            if (isPenalty) {
              await wait(900, ctx.signal);
              if (!ctx.signal.aborted) setPenalty(false);
            }
            return;
          }

          const from = anchorRect('draw');
          const to = handOf(event.playerId);
          if (!from || !to) return;

          setFlights([
            {
              id: `${event.kind}:${event.seq}:${event.playerId}`,
              // 摸牌是被递过来的，直线滑行不打旋
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
          if (!ctx.signal.aborted) {
            setFlights([]);
            if (isPenalty) {
              await wait(700, ctx.signal);
              if (!ctx.signal.aborted) setPenalty(false);
            }
          }
          return;
        }

        case 'bellClaimed': {
          setClaimBanner({ name: nameRef.current(event.claimantId), isMe: event.isMe });
          setClaimCounts((prev) => ({ ...prev, [event.claimantId]: (prev[event.claimantId] ?? 0) + 1 }));
          if (event.isMe) VIBRATE.ring();
          if (!ctx.softAnimated) return;

          // 铃被按下：实体按压，投影从 0 7px 压到 0 1px
          setBellPressing(true);
          await wait(BELL_PRESS_MS, ctx.signal);
          if (!ctx.signal.aborted) setBellPressing(false);
          return;
        }

        case 'gameOver': {
          if (!ctx.animated) return;
          const to = anchorRect('discard');
          if (!to) return;

          // 收桌：各席位剩余手牌飞回弃牌堆。这是终局的仪式感，
          // 但必须收敛在服务端的展示窗口内。
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
              // 一人一叠，最多画 4 张避免刷屏
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
    [anchorRect, handOf, cardPiece],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setBellPressing(false);
    setPenalty(false);
  }, []);

  const machine = useStageMachine<BellClashPlayerView, StageEvent>({
    view,
    namespace: 'bell-clash',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 抢铃与终局必须立刻开演，不能排在上一张牌的飞行后面等
    isHardCut: (event) => event.kind === 'bellClaimed' || event.kind === 'gameOver',
    applyFinalState: clear,
    onSettle: clear,
    play: async (event, ctx) => {
      playCueFor(event);
      await playEvent(event, ctx);
    },
  });

  const dismissClaim = useCallback(() => setClaimBanner(null), []);

  return {
    stageRef,
    flights,
    isPlaying: machine.isPlaying,
    simplifiedFlights: machine.simplifiedFlights,
    bellPressing,
    claimBanner,
    dismissClaim,
    penalty,
    discardTrail,
    claimCounts,
  };
}
