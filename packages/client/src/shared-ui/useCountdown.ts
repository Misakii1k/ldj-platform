/**
 * 倒计时 hook（§7.4：颜色 + 数字双信号 / T08 固定采样时钟）。
 * 基于 deadlineAt（服务端绝对毫秒时间戳）计算剩余秒数；
 * 支持 ServerClockSample 固定时钟样本或旧 serverNow 偏移，保持对所有既有游戏 100% 兼容。
 */
import { useEffect, useState } from 'react';
import type { ServerClockSample } from './serverClock.ts';
import { calculateAdjustedNow } from './serverClock.ts';

export interface Countdown {
  /** 剩余秒数（向下取整，<0 则为 0） */
  secondsLeft: number;
  /** 是否已到期 */
  expired: boolean;
}

function toDeadlineMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useCountdown(
  deadlineAt: number | null | undefined,
  serverNowOrSample?: number | ServerClockSample | null,
): Countdown {
  const deadlineMs = toDeadlineMs(deadlineAt);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (deadlineMs === null) return;

    let timeoutId = 0;
    let cancelled = false;

    const schedule = () => {
      window.clearTimeout(timeoutId);
      if (cancelled || (typeof document !== 'undefined' && document.hidden)) return;
      setTick((current) => current + 1);
      const currentNow = typeof serverNowOrSample === 'object' && serverNowOrSample !== null
        ? calculateAdjustedNow(serverNowOrSample)
        : Date.now();
      const remaining = Math.max(0, deadlineMs - currentNow);
      const delay = Math.min(1000, Math.max(120, remaining % 1000 || 1000));
      timeoutId = window.setTimeout(schedule, delay);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        window.clearTimeout(timeoutId);
        return;
      }
      schedule();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [deadlineMs, serverNowOrSample]);

  // 用 tick 强制组件依调度重算
  void tick;

  if (deadlineMs === null) {
    return { secondsLeft: 0, expired: false };
  }

  let adjustedNow: number;
  if (typeof serverNowOrSample === 'object' && serverNowOrSample !== null) {
    adjustedNow = calculateAdjustedNow(serverNowOrSample);
  } else if (typeof serverNowOrSample === 'number' && serverNowOrSample > 0) {
    const offset = serverNowOrSample - Date.now();
    adjustedNow = Date.now() + offset;
  } else {
    adjustedNow = Date.now();
  }

  const remain = Math.ceil((deadlineMs - adjustedNow) / 1000);
  return {
    secondsLeft: Math.max(0, remain),
    expired: remain <= 0,
  };
}
