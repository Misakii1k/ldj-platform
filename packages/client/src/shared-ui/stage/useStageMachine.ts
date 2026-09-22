import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../../motion/MotionContext.tsx';
import { createStageMemory } from './stageMemory.ts';

/** 播放单个事件时可用的上下文。 */
export interface StagePlayContext {
  /** 换轮/硬切时会 abort；每段 await 都应把它传下去 */
  readonly signal: AbortSignal;
  /** 本批事件开始编排的时刻，用于 fitToDeadline 的 now */
  readonly startedAt: number;
  /** level === 'full'：完整位移演出 */
  readonly animated: boolean;
  /** level === 'full' | 'reduced'：保留信息性动效（翻牌、光晕） */
  readonly softAnimated: boolean;
}

export interface StageMachineOptions<View, Event> {
  /** 唯一驱动源：服务端视角。本地永不预测成功 */
  readonly view: View;
  /** 记忆命名空间，一般用游戏 id */
  readonly namespace: string;
  /** 本轮标识：变化即换轮，用于隔离与清理播放记忆 */
  readonly roundToken: (view: View) => string;
  /** 视角差分 → 演出事件。不含任何 UI */
  readonly derive: (prev: View, next: View) => readonly Event[];
  /**
   * 一次性演出的去重键（如 `board:${round}:${phaseEpoch}`）。
   * 返回 null 表示每次都播（纯音效、徽章一类无时间线的事件）。
   */
  readonly eventKey: (event: Event) => string | null;
  /** 需要立刻中断在播演出的事件（换轮、进入结算、终局） */
  readonly isHardCut?: (event: Event) => boolean;
  /** 换轮事件：触发记忆清理，只保留当前 roundToken */
  readonly isRoundReset?: (event: Event) => boolean;
  /** 首帧 / 刷新重连 / 全部已播过：直接落终态，绝不重演 */
  readonly applyFinalState: (view: View) => void;
  /** 无演出事件时的对齐（一般是跟上最新的服务端值） */
  readonly onIdle?: (view: View) => void;
  /** 播放一个事件。内部所有 await 必须尊重 ctx.signal */
  readonly play: (event: Event, ctx: StagePlayContext) => Promise<void> | void;
  /** 一批事件播完（未被中断）后的收尾，一律对齐服务端 */
  readonly onSettle?: (view: View) => void;
}

export interface StageMachineApi {
  /** 挂到舞台根节点：锚点查找限定在这棵子树内，避免同页多实例串味 */
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  /** 正在演出：用于压住"正在结算"之类的提示，不阻塞交互 */
  readonly isPlaying: boolean;
  /** 精简飞行：非 full 档只做淡入淡出，不翻不飘不做景深 */
  readonly simplifiedFlights: boolean;
  readonly animated: boolean;
  readonly softAnimated: boolean;
}

/**
 * 演出状态机骨架（共享版，从 wits-wagers/stage/useWitsWagersStage.ts 抽出）。
 *
 * 这里只保留与业务无关的三条不可动摇的规则；具体演什么由各游戏的
 * derive（差分）与 play（时间线）提供：
 *
 * 1. 只有服务端视角的差分能驱动演出，本地永不预测成功；
 * 2. 一次性演出按 eventKey 去重，且**开始播放时**就写入记忆，
 *    这样演到一半刷新也不会重播；
 * 3. 演出时长必须收敛在服务端 deadlineAt 之内（用 flip.ts 的 fitToDeadline），
 *    超时就压缩间隔而不是拖延阶段。
 */
export function useStageMachine<View, Event>(
  options: StageMachineOptions<View, Event>,
): StageMachineApi {
  const { level } = useMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 低动效档位：不做位移，全部直落终态
  const animated = level === 'full';
  const softAnimated = level === 'full' || level === 'reduced';

  const prevViewRef = useRef<View | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // 回调每帧都是新引用；放进 ref 让主效应只依赖 view 与动效档位，
  // 否则每次渲染都会重跑差分，把正在播的演出打断。
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { view } = options;

  useEffect(() => {
    const opts = optionsRef.current;
    const prev = prevViewRef.current;
    prevViewRef.current = view;

    const roundToken = opts.roundToken(view);
    const memory = createStageMemory(roundToken, { namespace: opts.namespace });

    // 首帧（含刷新重连）直接落终态，绝不重演上一笔演出
    if (prev === null) {
      memory.keepOnly(roundToken);
      opts.applyFinalState(view);
      return;
    }

    const events = opts.derive(prev, view);
    if (events.length === 0) {
      opts.onIdle?.(view);
      return;
    }

    // 换轮或进入结算：中断正在进行的演出。
    // 结算必须立刻开演——它受服务端 deadlineAt 约束，不能排在上一段动画后面等。
    const hardCut = opts.isHardCut ? events.some((e) => opts.isHardCut!(e)) : false;
    if (hardCut) {
      abortRef.current?.abort();
      // 丢弃排队中的残余演出，否则结算会被上一段动画的 await 拖住
      queueRef.current = Promise.resolve();
      if (opts.isRoundReset && events.some((e) => opts.isRoundReset!(e))) {
        memory.keepOnly(roundToken);
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const pending: Event[] = [];
    for (const event of events) {
      const key = opts.eventKey(event);
      if (key !== null) {
        if (memory.has(key)) continue;
        // 开始播放即标记：演到一半刷新也不会重播
        memory.mark(key);
      }
      pending.push(event);
    }

    if (pending.length === 0) {
      opts.applyFinalState(view);
      return;
    }

    const startedAt = Date.now();
    const ctx: StagePlayContext = { signal, startedAt, animated, softAnimated };

    queueRef.current = queueRef.current.then(async () => {
      if (signal.aborted) return;
      setIsPlaying(true);

      for (const event of pending) {
        if (signal.aborted) break;
        await opts.play(event, ctx);
      }

      if (!signal.aborted) {
        // 收尾一律对齐服务端：演出可以慢半拍，但结束时看到的必须是权威状态
        setIsPlaying(false);
        opts.onSettle?.(view);
      }
    });
  }, [view, animated, softAnimated]);

  // 卸载时中断演出，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    stageRef,
    isPlaying,
    simplifiedFlights: level !== 'full',
    animated,
    softAnimated,
  };
}
