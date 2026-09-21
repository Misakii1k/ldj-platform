import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotion } from '../../../motion/MotionContext.tsx';
import type { PlayerRoundLedgerView, TargetId, WitsWagersPlayerView } from '../types.ts';
import { deriveStageEvents, stageEventKey, type ChipMove, type StageEvent } from './deriveStageEvents.ts';
import { createStageMemory } from './stageMemory.ts';
import { fitToDeadline, legDuration, measure, measureAnchor, wait, type Rect } from './flip.ts';
import { playCueFor, playFlipCue } from './audioCues.ts';

export interface FlightSpec {
  readonly id: string;
  readonly kind: 'chip' | 'card';
  readonly chipId?: 'A' | 'B';
  readonly extraStake?: number;
  readonly from: Rect;
  readonly to: Rect;
  readonly arc: number;
  readonly durationMs: number;
  readonly delayMs: number;
}

export interface StageState {
  /** 已翻开的槽位；不在其中的牌保持背面 */
  readonly revealedTargets: ReadonlySet<TargetId>;
  readonly flights: readonly FlightSpec[];
  /** 正在演出：用于压住"正在结算"之类的提示，不阻塞交互 */
  readonly isPlaying: boolean;
  readonly bankActive: boolean;
  /**
   * 收付演出期间的积分覆盖值（稀疏）。
   * 只在派彩动画进行时填充，演完即清空 —— 平时一律显示服务端的权威分数，
   * 否则任何没有账本的玩家都会被钉在一个过期的数字上。
   */
  readonly displayScores: Readonly<Record<string, number>>;
}

export interface WitsStageApi extends StageState {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
}

const FLIP_STEP_MS = 220;
const CHIP_FLIGHT_MS = 380;
/** 单笔收付的节拍上限：飞行时间 + 落袋后的短暂停顿 */
const MAX_LEG_MS = 560;

function allRevealed(view: WitsWagersPlayerView): Set<TargetId> {
  return new Set(view.board.map((t) => t.id));
}

/**
 * 演出编排。
 *
 * 三条不可动摇的规则：
 * 1. 只有服务端视角的差分能驱动演出，本地永不预测成功；
 * 2. 一次性演出（翻牌、派奖）按 round:phaseEpoch 去重，且**开始播放时**就写入记忆，
 *    这样演到一半刷新也不会重播；
 * 3. 演出时长必须收敛在服务端 deadlineAt 之内，超时就压缩间隔而不是拖延阶段。
 */
export function useWitsWagersStage(view: WitsWagersPlayerView): WitsStageApi {
  const { level } = useMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);

  // 低动效档位：不做位移与手部动作，全部直落终态
  const animated = level === 'full';
  const softAnimated = level === 'full' || level === 'reduced';

  const prevViewRef = useRef<WitsWagersPlayerView | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const [state, setState] = useState<StageState>(() => ({
    revealedTargets: allRevealed(view),
    flights: [],
    isPlaying: false,
    bankActive: false,
    displayScores: {},
  }));

  const patch = useCallback((next: Partial<StageState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  /** 落终态：刷新重连、已播放过、或动效关闭时走这条路。 */
  const applyFinalState = useCallback((v: WitsWagersPlayerView) => {
    setState({
      revealedTargets: allRevealed(v),
      flights: [],
      isPlaying: false,
      bankActive: false,
      displayScores: {},
    });
  }, []);

  /**
   * 舞台内锚点（毡面、银行、各槽位）。
   * 限定在 stageRef 子树内查找，避免同页多实例时串味。
   */
  const anchorRect = useCallback((anchor: string): Rect | null => {
    return measureAnchor(stageRef.current, anchor);
  }, []);

  /**
   * 舞台外锚点（底部筹码托盘、座位条）。
   * 这些由外壳或底部面板渲染，不在舞台子树内，只能从 document 查。
   */
  const outerRect = useCallback((anchor: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measureAnchor(document, anchor);
  }, []);

  /**
   * 座位矩形：座位条由共享外壳 TabletopOvalShell 渲染，不在舞台子树内，
   * 所以按它已有的 data-player-id 从 document 取，而不是往共享组件里加属性。
   */
  const seatRect = useCallback((playerId: string): Rect | null => {
    if (typeof document === 'undefined') return null;
    return measure(document.querySelector(`[data-player-id="${CSS.escape(playerId)}"]`));
  }, []);

  /**
   * 我这一侧的入画/出画位置：屏幕下方中央，贴着底部拇指区。
   * 找不到底部托盘锚点时用它兜底，钞票从我面前飞出、也飞回我面前。
   */
  const myHome = useCallback((): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.82 };
  }, []);

  const runChipMoves = useCallback(
    async (moves: readonly ChipMove[], signal: AbortSignal) => {
      if (!animated || moves.length === 0) return;

      const tray = outerRect('tray');
      const home = myHome();

      for (const move of moves) {
        if (signal.aborted) return;

        const targetId =
          move.type === 'pickUp' ? move.from : move.type === 'restake' ? move.at : move.to;
        const targetRect = anchorRect(`target:${targetId}`);
        if (!targetRect) continue;

        const fromRect =
          move.type === 'place'
            ? (tray ?? { x: home.x, y: home.y, width: 36, height: 36 })
            : move.type === 'move'
              ? (anchorRect(`target:${move.from}`) ?? targetRect)
              : targetRect;

        const toRect = move.type === 'pickUp' ? (tray ?? fromRect) : targetRect;

        patch({
          flights: [
            {
              id: `${move.type}:${move.chipId}:${targetId}`,
              kind: 'chip',
              chipId: move.chipId,
              extraStake:
                move.type === 'pickUp' ? 0 : move.type === 'restake' ? move.to : move.extraStake,
              from: fromRect,
              to: toRect,
              arc: 26,
              durationMs: CHIP_FLIGHT_MS,
              delayMs: 0,
            },
          ],
        });

        await wait(CHIP_FLIGHT_MS, signal);
        patch({ flights: [] });
      }
    },
    [animated, anchorRect, outerRect, myHome, patch],
  );

  const runBoardReveal = useCallback(
    async (targetIds: readonly TargetId[], signal: AbortSignal, budgetMs: number) => {
      if (!softAnimated || targetIds.length === 0) {
        patch({ revealedTargets: new Set(targetIds) });
        return;
      }

      // 先全部收成背面，再逐张翻开
      patch({ revealedTargets: new Set() });
      await wait(Math.min(160, budgetMs), signal);

      const step = Math.max(
        60,
        Math.min(FLIP_STEP_MS, Math.floor((budgetMs - 160) / Math.max(1, targetIds.length))),
      );

      const opened = new Set<TargetId>();
      for (const id of targetIds) {
        if (signal.aborted) {
          patch({ revealedTargets: new Set(targetIds) });
          return;
        }
        opened.add(id);
        patch({ revealedTargets: new Set(opened) });
        playFlipCue();
        await wait(step, signal);
      }

      patch({ revealedTargets: new Set(targetIds) });
    },
    [softAnimated, patch],
  );

  const runSettlement = useCallback(
    async (
      ledger: readonly PlayerRoundLedgerView[],
      signal: AbortSignal,
      budgetMs: number,
      myPlayerId: string | null,
    ) => {
      if (!animated || budgetMs <= 0) {
        setState((current) => ({ ...current, displayScores: {}, bankActive: false }));
        return;
      }

      patch({ bankActive: true });

      // 演出开始时把各账本玩家钉在结算前的分数上，收款落袋时再逐个释放，
      // 这样数字的变化和筹码的到达是同一个瞬间。
      const beforeScores: Record<string, number> = {};
      for (const entry of ledger) beforeScores[entry.playerId] = entry.scoreBefore;
      setState((current) => ({ ...current, displayScores: beforeScores }));

      const bank = anchorRect('bank');
      const home = myHome();

      // 第一步：银行收回输掉的附加注
      const losers = ledger.filter((entry) => entry.loss > 0);
      // 第二步：银行派出赢得的筹码与作者奖励
      const winners = ledger.filter((entry) => entry.winProfit > 0 || entry.authorBonus > 0);

      const legs = losers.length + winners.length;
      const perLeg = legDuration(budgetMs, legs, MAX_LEG_MS);

      for (const entry of losers) {
        if (signal.aborted) break;
        const seat = seatRect(entry.playerId);
        const from =
          entry.playerId === myPlayerId
            ? { x: home.x, y: home.y, width: 32, height: 32 }
            : (seat ?? bank);
        if (from && bank) {
          patch({
            flights: [
              {
                id: `loss:${entry.playerId}`,
                kind: 'chip',
                chipId: 'B',
                extraStake: entry.loss,
                from,
                to: bank,
                arc: 30,
                durationMs: Math.min(CHIP_FLIGHT_MS, perLeg),
                delayMs: 0,
              },
            ],
          });
        }
        await wait(perLeg, signal);
        patch({ flights: [] });
      }

      for (const entry of winners) {
        if (signal.aborted) break;
        const seat = seatRect(entry.playerId);
        // 我的收款朝屏幕下方（我的手边），他人的朝各自座位
        const to =
          entry.playerId === myPlayerId
            ? { x: home.x, y: home.y, width: 32, height: 32 }
            : (seat ?? bank);
        if (bank && to) {
          patch({
            flights: [
              {
                id: `win:${entry.playerId}`,
                kind: 'chip',
                chipId: 'A',
                extraStake: entry.winProfit + entry.authorBonus,
                from: bank,
                to,
                arc: 34,
                durationMs: Math.min(CHIP_FLIGHT_MS, perLeg),
                delayMs: 0,
              },
            ],
          });
        }
        await wait(Math.floor(perLeg * 0.6), signal);
        // 筹码落袋的同时释放该玩家的覆盖值，座位数字随即跳到服务端的 scoreAfter：
        // 收款与数字变化是同一件事，而权威值始终来自服务端。
        setState((current) => {
          const next = { ...current.displayScores };
          delete next[entry.playerId];
          return { ...current, displayScores: next };
        });
        await wait(perLeg - Math.floor(perLeg * 0.6), signal);
        patch({ flights: [] });
      }

      setState((current) => ({
        ...current,
        // 清空覆盖值：座位重新显示服务端的权威分数，演出不再遮挡真实账本
        displayScores: {},
        flights: [],
        bankActive: false,
      }));
    },
    [animated, anchorRect, seatRect, myHome, patch],
  );

  /** 我的估数被接受：一张背面牌从我面前（底部托盘）飞到毡面上。 */
  const runGuessAccepted = useCallback(
    async (signal: AbortSignal) => {
      if (!animated) return;
      const felt = anchorRect('felt');
      if (!felt) return;
      const home = myHome();
      const from = outerRect('tray') ?? { x: home.x - 32, y: home.y - 22, width: 64, height: 44 };
      const to = {
        x: felt.x + felt.width / 2 - 32,
        y: felt.y + felt.height * 0.62,
        width: 64,
        height: 44,
      };
      patch({
        flights: [
          {
            id: 'guess-card',
            kind: 'card',
            from,
            to,
            arc: 48,
            durationMs: 420,
            delayMs: 0,
          },
        ],
      });
      await wait(460, signal);
      patch({ flights: [] });
    },
    [animated, anchorRect, outerRect, myHome, patch],
  );

  // 主循环：view 变化 → 差分 → 串行播放
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;

    const memory = createStageMemory(view.roundToken);

    // 首帧（含刷新重连）直接落终态，绝不重演上一笔派奖
    if (prev === null) {
      memory.keepOnly(view.roundToken);
      applyFinalState(view);
      return;
    }

    const events = deriveStageEvents(prev, view);
    if (events.length === 0) {
      // 没有演出事件时跟上版图的最新值；分数本就回落到服务端权威值，无需处理
      setState((current) =>
        current.isPlaying ? current : { ...current, revealedTargets: allRevealed(view) },
      );
      return;
    }

    // 换轮或进入结算：中断正在进行的演出。
    // 结算必须立刻开演——它受服务端 deadlineAt 约束，不能排在上一段动画后面等。
    const hardCut = events.some(
      (e) => e.kind === 'roundReset' || e.kind === 'winningRevealed' || e.kind === 'gameOver',
    );
    if (hardCut) {
      abortRef.current?.abort();
      // 丢弃排队中的残余演出，否则结算会被上一段动画的 await 拖住
      queueRef.current = Promise.resolve();
      if (events.some((e) => e.kind === 'roundReset')) {
        memory.keepOnly(view.roundToken);
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const pending: StageEvent[] = [];
    for (const event of events) {
      const key = stageEventKey(event);
      if (key !== null) {
        if (memory.has(key)) continue;
        // 开始播放即标记：演到一半刷新也不会重播
        memory.mark(key);
      }
      pending.push(event);
    }

    if (pending.length === 0) {
      applyFinalState(view);
      return;
    }

    const myPlayerId = view.me?.playerId ?? null;
    const now = Date.now();

    queueRef.current = queueRef.current.then(async () => {
      if (signal.aborted) return;
      patch({ isPlaying: true });

      for (const event of pending) {
        if (signal.aborted) break;
        playCueFor(event);

        switch (event.kind) {
          case 'roundReset':
            // 清桌：收手、撤筹码、把牌收回背面，等新一轮的翻牌演出重新摊开
            setState({
              revealedTargets: new Set(),
              flights: [],
              isPlaying: true,
              bankActive: false,
              displayScores: {},
            });
            break;

          case 'guessAccepted':
            await runGuessAccepted(signal);
            break;

          case 'boardRevealed':
            await runBoardReveal(
              event.targetIds,
              signal,
              fitToDeadline(event.targetIds.length * FLIP_STEP_MS + 200, view.deadlineAt, now, 600),
            );
            break;

          case 'myBetsAccepted':
            await runChipMoves(event.moves, signal);
            break;

          case 'winningRevealed':
            patch({ revealedTargets: allRevealed(view) });
            await wait(animated ? 320 : 0, signal);
            break;

          case 'settlementLedger':
            await runSettlement(
              event.ledger,
              signal,
              fitToDeadline(2600, view.deadlineAt, now, 1200),
              myPlayerId,
            );
            break;

          default:
            // otherSubmitted / publicBetsChanged / gameOver 只有音效与徽章，无时间线
            break;
        }
      }

      if (!signal.aborted) {
        // 收尾一律对齐服务端：演出可以慢半拍，但结束时看到的必须是权威状态。
        // 这也兜住了"换轮清桌后本轮没有翻牌演出"导致桌面空着的情况。
        patch({
          isPlaying: false,
          flights: [],
          revealedTargets: allRevealed(view),
          displayScores: {},
        });
      }
    });
    // view 是唯一驱动源；回调依赖都是稳定引用
  }, [
    view,
    animated,
    applyFinalState,
    patch,
    runBoardReveal,
    runChipMoves,
    runGuessAccepted,
    runSettlement,
  ]);

  // 卸载时中断演出，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, stageRef };
}
