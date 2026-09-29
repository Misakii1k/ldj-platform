import { useCallback, useRef, useState } from 'react';
import { useStageMachine, type StagePlayContext } from '../../../shared-ui/stage/useStageMachine.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import type { StageFlight } from '../../../shared-ui/stage/FlightLayer.tsx';
import type { LandlordPlatformPlayerView } from '../types.ts';
import {
  deriveStageEvents,
  roundTokenOf,
  stageEventKey,
  type StageEvent,
} from './deriveStageEvents.ts';
import { playCueFor, VIBRATE } from './audioCues.ts';

/** 一手牌飞到中央的时长 */
const PLAY_FLIGHT_MS = 460;
/** 出牌依次间隔（契约 §4.2：间隔 55ms） */
const PLAY_STAGGER_MS = 55;
/** 底牌逐张翻开窗口（420ms 翻开 × 160ms 错峰 ≈ 900ms，留 100ms 停顿） */
const BOTTOM_REVEAL_MS = 1000;
/** 底牌飞入地主手里（契约：飞 520ms × 90ms 错峰，最多 3 张） */
const BOTTOM_FLY_MS = 520;
const BOTTOM_FLY_STAGGER_MS = 90;
const BOTTOM_FLY_COUNT = 3;
/** 冲屏词展示时长（CSS 冲高 900ms，多留 100ms 余韵） */
const SLAM_MS = 1000;
/** 炸弹落地 → 上家"啊？！"气泡延迟（方向稿 landlord-2-play.html） */
const BOMB_ACK_DELAY_MS = 700;
/** 气泡淡出对齐 .th-say.is-show 的 1600ms */
const BUBBLE_MS = 1600;
/** 对手半身像后缩时长 */
const FLINCH_MS = 550;
/** 金元宝落定后停留（名片身份章承接长期信息） */
const INGOT_LINGER_MS = 1600;
/** 捷报展开落定时点（900ms 展开延迟 + 700ms 展开） */
const SCROLL_LAND_MS = 1600;
/** 春天盖印相对落定的额外延迟（契约 §4.3：再过 500ms） */
const SPRING_EXTRA_MS = 500;

const CARD_W = 44;
const CARD_H = 62;
/** 飞向对手（牌背入隐藏手牌）时每张幽灵牌按 0.5 缩放的近似尺寸 */
const CARD_W_HALF = 26;
const CARD_H_HALF = 36;

const BOMB_TYPES = new Set(['bomb', 'rocket']);

/** 手机横屏矮档（与 teahouse.css / COMPACT_LAYOUT_QUERY 的横屏分支一致） */
function isLandscapeCompact(): boolean {
  return typeof window !== 'undefined'
    && window.innerWidth > window.innerHeight
    && window.innerHeight <= 520;
}

export interface StageSlam {
  readonly key: number;
  readonly label: string;
}

export interface StageBubble {
  readonly key: number;
  readonly playerId: string;
}

export interface StageIngot {
  readonly key: number;
  readonly top: number;
  readonly left: number;
}

export interface LandlordStageApi {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly flights: readonly StageFlight[];
  readonly isPlaying: boolean;
  readonly simplifiedFlights: boolean;
  /** 底牌正在翻开：驱动底牌区的揭晓动效（420ms × 160ms 错峰在 CSS 里） */
  readonly revealingBottom: boolean;
  /** 冲屏词：炸弹/王炸、你是地主、春天（自动按时长回收） */
  readonly slam: StageSlam | null;
  /** 金元宝落点（覆盖在地主名牌上方，自动回收） */
  readonly ingot: StageIngot | null;
  /** "不出"气泡：挂到刚刚被越过回合的那家名牌上 */
  readonly passNotice: StageBubble | null;
  /** 炸弹上家"啊？！"气泡：挂到被压那一手的主人名牌上 */
  readonly bombAck: StageBubble | null;
  /** 炸弹落地时需要后缩的半身像（全额档位才产生） */
  readonly flinchIds: readonly string[];
  /** 出牌区每张牌依次再弹：>0 变化即重触发 */
  readonly trickPop: { readonly key: number } | null;
  /** minimal 档：冲屏降级为出牌区标签闪一下 */
  readonly trickFlash: { readonly key: number } | null;
}

/**
 * 斗地主演出编排。
 *
 * 三条规则由 shared-ui/stage/useStageMachine 保证：只有服务端差分驱动演出、
 * 一次性演出开播即写记忆、时长收敛在 deadlineAt 内。这里只描述演什么
 * （契约 contracts/landlord.md §4 演出时序、§5 四档动效）。
 */
export function useLandlordStage(view: LandlordPlatformPlayerView): LandlordStageApi {
  const [flights, setFlights] = useState<readonly StageFlight[]>([]);
  const [revealingBottom, setRevealingBottom] = useState(false);
  const [slam, setSlam] = useState<StageSlam | null>(null);
  const [ingot, setIngot] = useState<StageIngot | null>(null);
  const [passNotice, setPassNotice] = useState<StageBubble | null>(null);
  const [bombAck, setBombAck] = useState<StageBubble | null>(null);
  const [flinchIds, setFlinchIds] = useState<readonly string[]>([]);
  const [trickPop, setTrickPop] = useState<{ key: number } | null>(null);
  const [trickFlash, setTrickFlash] = useState<{ key: number } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const deadlineRef = useRef<number | null>(null);
  deadlineRef.current = view.deadlineAt;
  const effectSeqRef = useRef(0);
  const nextSeq = () => {
    effectSeqRef.current += 1;
    return effectSeqRef.current;
  };

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

  /**
   * 屏震：直接对舞台根节点跑 WAAPI（全额档位才调用）。280ms 位移窗口
   * 内不会有并发飞行（炸弹/捷报震都在飞行落桌之后串行触发），
   * 因此不会触碰 FlightLayer「祖先不能有 transform」的禁忌。
   */
  const shakeStage = useCallback((px: number) => {
    stageRef.current?.animate(
      [
        { transform: 'translate(0px, 0px)' },
        { transform: `translate(${px}px, 0px)` },
        { transform: `translate(${-px}px, 0px)` },
        { transform: `translate(${Math.round(px / 2)}px, 0px)` },
        { transform: 'translate(0px, 0px)' },
      ],
      { duration: 280, easing: 'linear' },
    );
  }, []);

  const playEvent = useCallback(
    async (event: StageEvent, ctx: StagePlayContext) => {
      switch (event.kind) {
        case 'myTurnStarted':
          // 提醒而非装饰：不受动效档位限制
          VIBRATE.myTurn();
          return;

        case 'bidPlaced':
          // 木牌弹起由 .th-chip.is-top 的 CSS 动画承接，这里只有音效
          return;

        case 'landlordDecided': {
          // 金元宝落到地主名牌上：所有档位都出现（off 档由全局空降动画 =
          // 直接出现），落点取席位名牌实测位置
          const seq = nextSeq();
          const target = seatRect(event.playerId);
          if (target) {
            const compact = isLandscapeCompact();
            setIngot({
              key: seq,
              top: target.y - (compact ? 34 : 56),
              left: target.x + target.width / 2,
            });
          }
          // 自己是地主：冲屏"你是地主"（+ 3px 屏震，全额档）
          if (event.isMe && ctx.softAnimated) {
            setSlam({ key: seq, label: '你是地主' });
            if (ctx.animated) shakeStage(3);
          }
          // 底牌逐张翻开（reduced 保留信息性翻牌；minimal/off 直接正面）
          if (ctx.softAnimated) {
            setRevealingBottom(true);
          }
          if (ctx.animated) {
            await wait(BOTTOM_REVEAL_MS, ctx.signal);
            if (ctx.signal.aborted) return;
            setRevealingBottom(false);
            // 间隔 90ms 逐张飞进地主手里：飞向对手时缩到 0.5（预告共 3 张隐藏入手）
            const from = anchorRect('kitty') ?? anchorRect('trick');
            const to = event.isMe ? myHand() : seatRect(event.playerId);
            if (from && to) {
              const halfSize = !event.isMe;
              setFlights([
                {
                  id: `bottom:${event.playerId}`,
                  motion: 'toss',
                  from,
                  to,
                  arc: 120,
                  durationMs: BOTTOM_FLY_MS,
                  delayMs: 0,
                  budgetMs: BOTTOM_FLY_MS + (BOTTOM_FLY_COUNT - 1) * BOTTOM_FLY_STAGGER_MS,
                  pieces: Array.from({ length: BOTTOM_FLY_COUNT }, (_, k) => ({
                    key: `bottom-${event.playerId}-${k}`,
                    width: halfSize ? CARD_W_HALF : CARD_W,
                    height: halfSize ? CARD_H_HALF : CARD_H,
                    paper: false,
                    node: <span className="ld-flight-card" aria-hidden="true" />,
                  })),
                },
              ]);
              await wait(BOTTOM_FLY_MS + (BOTTOM_FLY_COUNT - 1) * BOTTOM_FLY_STAGGER_MS + 120, ctx.signal);
              if (ctx.signal.aborted) return;
              setFlights([]);
            } else {
              await wait(INGOT_LINGER_MS - BOTTOM_REVEAL_MS, ctx.signal);
            }
          } else {
            // minimal/off：元宝直接出现，停留片刻后交给身份圆章承接信息
            await wait(INGOT_LINGER_MS, ctx.signal);
          }
          if (ctx.signal.aborted) return;
          setRevealingBottom(false);
          setIngot(null);
          setSlam((current) => (current?.key === seq ? null : current));
          return;
        }

        case 'cardsPlayed': {
          if (!ctx.animated) return;
          const from =
            event.playerId === viewRef.current.me?.playerId
              ? myHand()
              : seatRect(event.playerId);
          const to = anchorRect('trick');
          if (!from || !to) return;

          const pieceCount = Math.min(event.count, 5);
          const isBomb = BOMB_TYPES.has(event.comboType);
          // 一手牌依次（间隔 55ms）飞到出牌区；炸弹抬得更高
          const totalMs = PLAY_FLIGHT_MS + (pieceCount - 1) * PLAY_STAGGER_MS;
          const budget = fitToDeadline(totalMs + 140, deadlineRef.current, ctx.startedAt, 300);
          if (budget <= 0) return;

          setFlights([
            {
              id: `play:${event.seq}`,
              // 牌被甩到桌中央：抛物线 + 景深，不翻面
              motion: 'toss',
              from,
              to,
              arc: isBomb ? 200 : 64,
              durationMs: PLAY_FLIGHT_MS,
              delayMs: 0,
              budgetMs: totalMs,
              pieces: Array.from({ length: pieceCount }, (_, k) => ({
                key: `play-${event.seq}-${k}`,
                width: CARD_W,
                height: CARD_H,
                paper: false,
                node: <span className="ld-flight-card" aria-hidden="true" />,
              })),
            },
          ]);
          await wait(budget, ctx.signal);
          if (!ctx.signal.aborted) setFlights([]);
          return;
        }

        case 'bombDropped': {
          VIBRATE.bomb();
          const seq = nextSeq();
          const isRocket = event.comboType === 'rocket';
          if (ctx.softAnimated) {
            // default / reduced：冲屏保留（衬线大字 + 金色放射光在 CSS）
            setSlam({ key: seq, label: isRocket ? '王炸！' : '炸！' });
          } else {
            // minimal：冲屏降级为出牌区标签闪一下（信息仍由牌型标签承接）
            setTrickFlash({ key: seq });
          }
          if (ctx.animated) {
            // 全额档：4px 屏震 + 两个对手半身像后缩 + 出牌区每张依次再弹
            shakeStage(4);
            setFlinchIds(
              viewRef.current.players
                .map((p) => p.playerId)
                .filter((pid) => pid !== event.playerId),
            );
            setTrickPop({ key: seq });
          }
          await wait(BOMB_ACK_DELAY_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          if (event.victimId) {
            setBombAck({ key: seq, playerId: event.victimId });
          }
          await wait(Math.max(0, SLAM_MS - BOMB_ACK_DELAY_MS), ctx.signal);
          if (ctx.signal.aborted) return;
          setSlam((current) => (current?.key === seq ? null : current));
          setTrickPop((current) => (current?.key === seq ? null : current));
          setTrickFlash((current) => (current?.key === seq ? null : current));
          setFlinchIds([]);
          await wait(Math.max(0, BUBBLE_MS + FLINCH_MS - (SLAM_MS - BOMB_ACK_DELAY_MS)), ctx.signal);
          if (ctx.signal.aborted) return;
          setBombAck((current) => (current?.key === seq ? null : current));
          return;
        }

        case 'passed': {
          // 对手"不出"：名牌上方气泡 1.6 秒后淡出（off 档 .th-say 动画被全局压制，天然不显示）
          if (!event.playerId) return;
          const seq = nextSeq();
          setPassNotice({ key: seq, playerId: event.playerId });
          await wait(BUBBLE_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          setPassNotice((current) => (current?.key === seq ? null : current));
          return;
        }

        case 'gameOver': {
          // 捷报展开 / 纸屑 / 春印由页面渲染 + CSS 门控呈现；这里补屏震与春天冲屏时序。
          if (!ctx.softAnimated) return;
          // 卷轴在 1600ms 完成展开（900ms 延迟 + 700ms 动效），落定 3px 屏震（全额档）
          await wait(SCROLL_LAND_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          if (ctx.animated) shakeStage(3);
          if (!event.isSpring) return;
          await wait(SPRING_EXTRA_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          // 春天：盖印（CSS 延迟）+ 冲屏"春天！"+ 4px 屏震（全额档）
          const seq = nextSeq();
          setSlam({ key: seq, label: '春天！' });
          if (ctx.animated) shakeStage(4);
          await wait(SLAM_MS, ctx.signal);
          if (ctx.signal.aborted) return;
          setSlam((current) => (current?.key === seq ? null : current));
          return;
        }

        default:
          return;
      }
    },
    [anchorRect, myHand, seatRect, shakeStage],
  );

  const clear = useCallback(() => {
    setFlights([]);
    setRevealingBottom(false);
    setSlam(null);
    setIngot(null);
    setPassNotice(null);
    setBombAck(null);
    setFlinchIds([]);
    setTrickPop(null);
    setTrickFlash(null);
  }, []);

  const machine = useStageMachine<LandlordPlatformPlayerView, StageEvent>({
    view,
    namespace: 'landlord',
    roundToken: roundTokenOf,
    derive: deriveStageEvents,
    eventKey: stageEventKey,
    // 终局必须立刻开演，不能排在上一手牌的飞行后面等
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
    revealingBottom,
    slam,
    ingot,
    passNotice,
    bombAck,
    flinchIds,
    trickPop,
    trickFlash,
  };
}
