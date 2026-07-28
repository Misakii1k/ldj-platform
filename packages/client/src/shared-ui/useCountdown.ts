/**
 * 倒计时 hook（§7.4：颜色 + 数字双信号）。
 * 基于 deadlineAt（服务端绝对毫秒时间戳）计算剩余秒数；
 * 用 serverNow 与本地 now 的偏移做时钟校正，避免时钟漂移。
 */
import { useEffect, useState } from 'react';

export interface Countdown {
  /** 剩余秒数（向下取整，<0 则为 0） */
  secondsLeft: number;
  /** 是否已到期 */
  expired: boolean;
}

function nowMs(): number {
  return Date.now();
}

/**
 * @param deadlineAt 服务端绝对时间戳（毫秒）；null 表示无倒计时
 * @param serverNow 最近一次服务端 serverNow（用于时钟校正，可选）
 */
export function useCountdown(deadlineAt: number | null, serverNow?: number): Countdown {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (deadlineAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [deadlineAt]);

  // 时钟偏移：服务端时间 - 本地时间（>0 表示本地慢）
  const offset = serverNow !== undefined && serverNow > 0 ? serverNow - nowMs() : 0;
  // 用 tick 强制重算
  void tick;

  if (deadlineAt === null) {
    return { secondsLeft: 0, expired: false };
  }
  const adjustedNow = nowMs() + offset;
  const remain = Math.ceil((deadlineAt - adjustedNow) / 1000);
  return {
    secondsLeft: Math.max(0, remain),
    expired: remain <= 0,
  };
}
