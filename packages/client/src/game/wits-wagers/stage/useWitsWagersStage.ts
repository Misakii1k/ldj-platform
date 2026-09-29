import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotion } from '../../../motion/MotionContext.tsx';
import { playerColorFor } from '../seats.ts';
import type { TargetId, WitsWagersPlayerView } from '../types.ts';
import { deriveStageEvents, stageEventKey, type ChipMove, type StageEvent } from './deriveStageEvents.ts';
import { createStageMemory } from '../../../shared-ui/stage/stageMemory.ts';
import { fitToDeadline, measure, measureAnchor, wait, type Rect } from '../../../shared-ui/stage/flip.ts';
import { playCueFor, playFlipCue } from './audioCues.ts';

/** 飞行筹码的外观：颜色 = 主人玩家色；label = A/B 或座位号；extraStake 挂「+N / −N」签 */
export interface FlightChip {
  readonly color: string;
  readonly label: string;
  readonly extraStake?: number;
}

export interface FlightSpec {
  readonly id: string;
  /** note = 一枚筹码（2026-09-27 起一次下注 / 收付只飞一枚）；card = 一张背面朝上的答案牌 */
  readonly kind: 'note' | 'card';
  /** 首枚筹码的角标：标明这是永久筹码 A 还是 B */
  readonly badge?: 'A' | 'B' | null;
  /** 筹码直径（px） */
  readonly noteWidth?: number;
  /** 筹码外观 */
  readonly chip?: FlightChip;
  readonly from: Rect;
  readonly to: Rect;
  readonly arc: number;
  readonly durationMs: number;
  readonly delayMs: number;
  /** 单枚飞行 + 落袋停顿的节拍预算 */
  readonly budgetMs?: number;
}

export interface StageState {
  /** 已翻开的槽位；不在其中的牌保持背面 */
  readonly revealedTargets: ReadonlySet<TargetId>;
  readonly flights: readonly FlightSpec[];
  /** 正在演出：用于压住"正在结算"之类的提示，不阻塞交互 */
  readonly isPlaying: boolean;
  /**
   * 收付演出期间的积分覆盖值（稀疏）。
   * 只在派彩动画进行时填充，演完即清空 —— 平时一律显示服务端的权威分数，
   * 否则任何没有账本的玩家都会被钉在一个过期的数字上。
   */
  readonly displayScores: Readonly<Record<string, number>>;
  /** 结算演出：桌上筹码已飞回主人（隐藏格内筹码摞） */
  readonly hideTableChips: boolean;
  /** 结算演出：已放出增减徽章 / 作者签的玩家 */
  readonly settleRevealed: Readonly<Record<string, boolean>>;
  /** 结算演出：名次章已统一放出 */
  readonly ranksRevealed: boolean;
  /** 结算演出：第一名（皇冠） */
  readonly crownedId: string | null;
}

export interface WitsStageApi extends StageState {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  /** 精简飞行：reduced 档只做淡入淡出，不翻不飘不做景深 */
  readonly simplifiedFlights: boolean;
}

const FLIP_STEP_MS = 220;
/** 单枚筹码的飞行时长基准 */
const NOTE_FLIGHT_MS = 640;
/** 筹码直径：桌面格内 34px，托盘/手边 46px（A2 方向稿） */
const NOTE_W_TABLE = 34;
const NOTE_W_HAND = 46;

function allRevealed(view: WitsWagersPlayerView): Set<TargetId> {
  return new Set(view.board.map((t) => t.id));
}

/** 结算终态的 staging 字段：落终态 / 低动效档 / 演出被打断后的兜底共用 */
function settlementFinalFields(view: WitsWagersPlayerView): Pick<
  StageState,
  'hideTableChips' | 'settleRevealed' | 'ranksRevealed' | 'crownedId'
> {
  const revealed = view.revealed;
  const inSettlement = view.phase === 'settlement' || view.phase === 'game_over';
  if (!inSettlement || !revealed) {
    return { hideTableChips: false, settleRevealed: {}, ranksRevealed: false, crownedId: null };
  }
  const settleRevealed: Record<string, boolean> = {};
  let crownedId: string | null = null;
  let best = -Infinity;
  for (const entry of revealed.ledger) {
    settleRevealed[entry.playerId] = true;
    if (entry.scoreAfter > best) {
      best = entry.scoreAfter;
      crownedId = entry.playerId;
    }
  }
  return { hideTableChips: true, settleRevealed, ranksRevealed: true, crownedId };
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
    displayScores: {},
    ...settlementFinalFields(view),
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
      displayScores: {},
      ...settlementFinalFields(v),
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
   * 找不到底部托盘锚点时用它兜底，筹码从我面前飞出、也飞回我面前。
   */
  const myHome = useCallback((): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.82 };
  }, []);

/**
 * 我的下注被服务端接受：一枚筹码在托盘与槽位之间飞。
 *
 * 加注/减注只飞差额那一枚（带 +N / −N 签）——整摞重飞会让"我只多押了一枚"
 * 看起来像重新下注。
 */
  const runChipMoves = useCallback(
    async (moves: readonly ChipMove[], signal: AbortSignal, myColor: string) => {
      if (!animated || moves.length === 0) return;

      const tray = outerRect('tray');
      const home = myHome();
      const handRect = tray ?? { x: home.x - 23, y: home.y - 23, width: 46, height: 46 };

      for (const move of moves) {
        if (signal.aborted) return;

        const targetId =
          move.type === 'pickUp' ? move.from : move.type === 'restake' ? move.at : move.to;
        const targetRect = anchorRect(`target:${targetId}`);
        if (!targetRect) continue;

        let from: Rect;
        let to: Rect;
        let chip: FlightChip;

        switch (move.type) {
          case 'place':
            from = handRect;
            to = targetRect;
            chip = { color: myColor, label: move.chipId, extraStake: move.extraStake };
            break;
          case 'pickUp':
            // 拿回：永久筹码收回手边
            from = targetRect;
            to = handRect;
            chip = { color: myColor, label: move.chipId, extraStake: 0 };
            break;
          case 'move':
            from = anchorRect(`target:${move.from}`) ?? targetRect;
            to = targetRect;
            chip = { color: myColor, label: move.chipId, extraStake: move.extraStake };
            break;
          case 'restake': {
            // 只飞差额：加注从手边补进去，减注从槽位退回来
            const delta = move.to - move.from;
            if (delta === 0) continue;
            chip = { color: myColor, label: '', extraStake: delta };
            if (delta > 0) {
              from = handRect;
              to = targetRect;
            } else {
              from = targetRect;
              to = handRect;
            }
            break;
          }
        }

        const budget = NOTE_FLIGHT_MS + 60;
        patch({
          flights: [
            {
              id: `${move.type}:${move.chipId}:${targetId}`,
              kind: 'note',
              chip,
              badge: move.type === 'restake' ? null : move.chipId,
              noteWidth: NOTE_W_HAND,
              from,
              to,
              arc: 64,
              durationMs: NOTE_FLIGHT_MS,
              delayMs: 0,
              budgetMs: budget,
            },
          ],
        });

        await wait(budget + 120, signal);
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

  /**
   * 结算演出（01-CONTRACT.md §4.5 / §5.2，A2 ④ 的节奏）：
   * 1. 筹码回收：桌上所有筹码飞回主人的座位章（押中高抛 150px/640ms，
   *    押错低掠 30px/460ms，逐枚间隔 70ms）；
   * 2. 逐个计分：从最低分到最高分，座位章弹一下 → 增减徽章 / 作者签放出 →
   *    余额从 scoreBefore 计到 scoreAfter（基准 500ms，被 deadline 压缩时按比例缩短）；
   * 3. 名次章统一放出，随后第一名戴冠。
   * 总时长必须收在 deadlineAt 内（fitToDeadline 已由调用方压过一轮）。
   */
  const runSettlement = useCallback(
    async (v: WitsWagersPlayerView, signal: AbortSignal, budgetMs: number) => {
      const revealed = v.revealed;
      if (!revealed) return;

      if (!animated || budgetMs <= 0) {
        // 低动效档 / 无预算：直接落终态（徽章、名次、皇冠全部就位）
        setState((current) => ({
          ...current,
          displayScores: {},
          ...settlementFinalFields(v),
        }));
        return;
      }

      const winSet = new Set(revealed.winningTargetIds);

      // —— 第一步：筹码回收（桌上筹码飞回主人座位章） ——
      const chipFlights: FlightSpec[] = [];
      let index = 0;
      for (const [pid, pair] of Object.entries(revealed.bets)) {
        for (const chip of pair) {
          if (!chip.targetId) continue;
          const from = anchorRect(`target:${chip.targetId}`);
          const to = seatRect(pid);
          if (!from || !to) continue;
          const win = winSet.has(chip.targetId);
          chipFlights.push({
            id: `return:${pid}:${chip.chipId}`,
            kind: 'note',
            chip: { color: playerColorFor(pid), label: chip.chipId, extraStake: chip.extraStake },
            noteWidth: NOTE_W_TABLE,
            from,
            to,
            arc: win ? 150 : 30,
            durationMs: win ? 640 : 460,
            delayMs: index * 70,
          });
          index += 1;
        }
      }

      let elapsed = 0;
      patch({ hideTableChips: true });
      if (chipFlights.length > 0) {
        patch({ flights: chipFlights });
        elapsed = Math.max(...chipFlights.map((f) => f.delayMs + f.durationMs)) + 60;
        await wait(elapsed, signal);
        patch({ flights: [] });
      }

      // —— 第二步：逐个计分（从最低分到最高分） ——
      const sorted = [...revealed.ledger].sort((a, b) => a.scoreAfter - b.scoreAfter);
      const remaining = Math.max(600, budgetMs - elapsed - 450);
      const perPlayer = Math.min(700, Math.floor(remaining / Math.max(1, sorted.length)));
      const countMs = Math.max(120, Math.floor(perPlayer * 0.7));
      const gapMs = Math.max(0, perPlayer - countMs);

      // 演出期间把各人钉在结算前的分数，计到谁头上谁释放
      const beforeScores: Record<string, number> = {};
      for (const entry of revealed.ledger) beforeScores[entry.playerId] = entry.scoreBefore;
      setState((current) => ({ ...current, displayScores: beforeScores }));

      for (const entry of sorted) {
        if (signal.aborted) break;

        // 座位章弹一下（元素不靠 transform 定位，用 scale 属性安全，§5.1 第 1 条）
        if (typeof document !== 'undefined') {
          const chipEl = document.querySelector(
            `[data-player-id="${CSS.escape(entry.playerId)}"] .ww-seat-card__chip`,
          );
          chipEl?.animate([{ scale: '1.3' }, { scale: '1' }], {
            duration: 260,
            easing: 'cubic-bezier(.34,1.56,.64,1)',
          });
        }

        // 增减徽章 / 作者签放出（CSS 弹入）
        setState((current) => ({
          ...current,
          settleRevealed: { ...current.settleRevealed, [entry.playerId]: true },
        }));

        // 余额计数：scoreBefore → scoreAfter（ease-out cubic）
        await new Promise<void>((resolve) => {
          if (entry.scoreBefore === entry.scoreAfter) {
            resolve();
            return;
          }
          const start = performance.now();
          const step = (now: number) => {
            if (signal.aborted) {
              resolve();
              return;
            }
            const t = Math.min(1, (now - start) / countMs);
            const eased = 1 - Math.pow(1 - t, 3);
            const val = Math.round(entry.scoreBefore + (entry.scoreAfter - entry.scoreBefore) * eased);
            setState((current) => ({
              ...current,
              displayScores: { ...current.displayScores, [entry.playerId]: val },
            }));
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });

        // 计完释放覆盖值，座位回落到服务端权威分数（= scoreAfter）
        setState((current) => {
          const next = { ...current.displayScores };
          delete next[entry.playerId];
          return { ...current, displayScores: next };
        });
        await wait(gapMs, signal);
      }

      // —— 第三步：名次章统一出现，第一名戴冠 ——
      await wait(450, signal);
      patch({ ranksRevealed: true });
      await wait(150, signal);

      let crownedId: string | null = null;
      let best = -Infinity;
      for (const entry of revealed.ledger) {
        if (entry.scoreAfter > best) {
          best = entry.scoreAfter;
          crownedId = entry.playerId;
        }
      }
      patch({ crownedId });

      setState((current) => ({ ...current, displayScores: {} }));
    },
    [animated, anchorRect, seatRect, patch],
  );

  /** 我的估数被接受：一张背面牌从我面前（底部托盘）飞到毡面上。 */
  const runGuessAccepted = useCallback(
    async (signal: AbortSignal) => {
      if (!animated) return;
      const felt = anchorRect('felt');
      if (!felt) return;
      const home = myHome();
      const from = outerRect('tray') ?? { x: home.x - 32, y: home.y - 45, width: 64, height: 90 };
      const to = {
        x: felt.x + felt.width / 2 - 32,
        y: felt.y + felt.height * 0.62,
        width: 64,
        height: 90,
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

    const memory = createStageMemory(view.roundToken, { namespace: 'wits-wagers' });

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

    const now = Date.now();

    queueRef.current = queueRef.current.then(async () => {
      if (signal.aborted) return;
      patch({ isPlaying: true });

      for (const event of pending) {
        if (signal.aborted) break;
        playCueFor(event);

        switch (event.kind) {
          case 'roundReset':
            // 清桌：收手、撤筹码、把牌收回背面，等新一轮的翻牌演出重新摊开；
            // 上一轮的结算 staging（徽章 / 名次 / 皇冠 / 筹码回收）一并复位
            setState({
              revealedTargets: new Set(),
              flights: [],
              isPlaying: true,
              displayScores: {},
              hideTableChips: false,
              settleRevealed: {},
              ranksRevealed: false,
              crownedId: null,
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
            await runChipMoves(event.moves, signal, playerColorFor(view.me?.playerId));
            break;

          case 'winningRevealed':
            patch({ revealedTargets: allRevealed(view) });
            await wait(animated ? 320 : 0, signal);
            break;

          case 'settlementLedger':
            await runSettlement(
              view,
              signal,
              fitToDeadline(4200, view.deadlineAt, now, 1500),
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

  return { ...state, stageRef, simplifiedFlights: level !== 'full' };
}
