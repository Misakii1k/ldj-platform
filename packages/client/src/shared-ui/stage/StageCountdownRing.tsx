import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../../motion/MotionContext.tsx';
import { webAudio } from '../WebAudioManager.ts';

export interface StageCountdownRingProps {
  /** 服务端给的截止时刻；null 表示当前阶段不计时 */
  readonly deadlineAt: number | null;
  /** 阶段标识：变化时重新测量本阶段的总时长 */
  readonly phaseKey: string;
  /** 是否显示。纯展示阶段（排牌、结算）不需要催促玩家行动 */
  readonly active: boolean;
  /** 额外类名：各游戏可挂自己的尺寸/配色修饰 */
  readonly className?: string;
}

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 进入"紧张"状态的剩余秒数 */
const URGENT_SEC = 10;
/** 开始每秒滴答的剩余秒数 */
const TICK_SEC = 5;

function formatRemaining(sec: number): string {
  if (sec < 60) return String(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function playTickCue(): void {
  try {
    webAudio.playTick();
  } catch {
    // 音频上下文尚未解锁等情况不应打断演出
  }
}

/**
 * 阶段倒计时进度环（共享版，从 wits-wagers/stage/WitsCountdown.tsx 上提）。
 *
 * 原先各游戏的倒计时藏在阶段横幅的一行小字里（"…… · 剩余 00:30"），
 * 信息冗余且看不见。这里独立成一个大号数字 + 进度环。
 *
 * 阶段总时长不从配置读——客户端拿不到服务端 config，而且老房间的时长可能不同。
 * 改为在首次见到某个 deadlineAt 时测一次"还剩多少"，把它当作满格，
 * 这样进度环对任何时长都自适应，刷新重连也只是从当时的剩余量重新满格计算。
 */
export function StageCountdownRing({
  deadlineAt,
  phaseKey,
  active,
  className,
}: StageCountdownRingProps) {
  const { level } = useMotion();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // 本阶段的满格时长：首次见到这个 deadline 时测得
  const spanRef = useRef<{ key: string; deadlineAt: number; totalMs: number } | null>(null);
  // 已经滴答过的秒数，避免同一秒重复触发音效
  const tickedRef = useRef<number | null>(null);

  useEffect(() => {
    if (deadlineAt === null || !active) {
      setRemainingMs(null);
      spanRef.current = null;
      tickedRef.current = null;
      return;
    }

    const signature = `${phaseKey}:${deadlineAt}`;
    if (spanRef.current === null || spanRef.current.key !== signature) {
      spanRef.current = {
        key: signature,
        deadlineAt,
        totalMs: Math.max(1000, deadlineAt - Date.now()),
      };
      tickedRef.current = null;
    }

    const update = () => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemainingMs(left);

      const sec = Math.ceil(left / 1000);
      if (sec > 0 && sec <= TICK_SEC && tickedRef.current !== sec) {
        tickedRef.current = sec;
        playTickCue();
      }
    };

    update();
    // 200ms 一跳：进度环走得连续，整秒的数字变化也不会迟半拍
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [deadlineAt, phaseKey, active]);

  if (remainingMs === null) return null;

  const totalMs = spanRef.current?.totalMs ?? 1;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  const sec = Math.ceil(remainingMs / 1000);
  const urgent = sec <= URGENT_SEC;
  // 低动效档位只变色，不脉冲
  const pulsing = urgent && (level === 'full' || level === 'reduced');

  return (
    <div
      className={className ? `stage-countdown ${className}` : 'stage-countdown'}
      data-urgent={urgent ? 'true' : undefined}
      data-pulsing={pulsing ? 'true' : undefined}
      role="timer"
      aria-live="off"
      aria-label={`本阶段剩余 ${sec} 秒`}
    >
      <svg className="stage-countdown__ring" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
        <circle className="stage-countdown__track" cx="30" cy="30" r={RADIUS} />
        <circle
          className="stage-countdown__bar"
          cx="30"
          cy="30"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        />
      </svg>
      <span className="stage-countdown__value">{formatRemaining(sec)}</span>
    </div>
  );
}
