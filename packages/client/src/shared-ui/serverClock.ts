/**
 * 服务端时钟同步与倒计时工具（Contract F / T08）。
 *
 * - 在连接层收到有效 envelope 时固定采样 {serverNow, receivedAtMonotonic}；
 * - adjustedNow = sample.serverNow + (currentMonotonic - sample.receivedAtMonotonic)；
 * - 纯函数设计，monotonic 当前值作为入参传入，测试不依赖真实等待；
 * - 容忍本地 Date.now 偏差（±5分钟以上仍正确），document.hidden 恢复时使用最新 performance.now() 重算。
 */

export interface ServerClockSample {
  readonly serverNow: number;
  readonly receivedAtMonotonic: number;
}

export function createServerClockSample(serverNow: number, receivedAtMonotonic: number): ServerClockSample {
  return { serverNow, receivedAtMonotonic };
}

export function calculateAdjustedNow(
  sample: ServerClockSample | null | undefined,
  currentMonotonic?: number,
): number {
  if (!sample || !Number.isFinite(sample.serverNow)) {
    return Date.now();
  }
  const monotonic = currentMonotonic ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return sample.serverNow + (monotonic - sample.receivedAtMonotonic);
}

export function calculateRemainingSeconds(
  deadlineAt: number | null | undefined,
  sample: ServerClockSample | null | undefined,
  currentMonotonic?: number,
): number {
  if (deadlineAt === null || deadlineAt === undefined || !Number.isFinite(deadlineAt)) {
    return 0;
  }
  const adjustedNow = calculateAdjustedNow(sample, currentMonotonic);
  const remain = Math.ceil(Math.max(0, deadlineAt - adjustedNow) / 1000);
  return remain;
}

export interface TimelineTimerDisplay {
  readonly status: 'paused' | 'waiting' | 'broadcasting' | 'counting' | 'idle';
  readonly label: string;
  readonly secondsLeft: number;
}

export function formatTimelineTimer(
  timeline: {
    readonly mode: 'manual' | 'auto';
    readonly paused: boolean;
    readonly pauseRemainingMs?: number | null;
    readonly startedAt?: number;
    readonly endsAt: number | null;
    readonly actionDeadlineAt?: number | null;
    readonly segment?: string;
    readonly cue?: string | null;
  } | null | undefined,
  sample: ServerClockSample | null | undefined,
  currentMonotonic?: number,
): TimelineTimerDisplay {
  if (!timeline) {
    return { status: 'idle', label: '', secondsLeft: 0 };
  }

  // 1. 暂停
  if (timeline.paused) {
    const remMs = timeline.pauseRemainingMs ?? (
      timeline.endsAt !== null && timeline.startedAt !== undefined
        ? Math.max(0, timeline.endsAt - timeline.startedAt)
        : 0
    );
    const sec = Math.ceil(Math.max(0, remMs) / 1000);
    return {
      status: 'paused',
      label: '已暂停',
      secondsLeft: sec,
    };
  }

  // 2. 手动模式或无截止时间（如 confirm）
  if (timeline.mode === 'manual' || timeline.endsAt === null) {
    return {
      status: 'waiting',
      label: '等待主持人',
      secondsLeft: 0,
    };
  }

  // 3. 正在播报有语音环节且非 action 操作
  const isBroadcastingSegment = timeline.cue !== null && timeline.cue !== undefined && (
    timeline.segment === 'intro' ||
    timeline.segment === 'open' ||
    timeline.segment === 'close' ||
    timeline.segment === 'dawn'
  );
  if (isBroadcastingSegment && !timeline.actionDeadlineAt) {
    const sec = calculateRemainingSeconds(timeline.endsAt, sample, currentMonotonic);
    return {
      status: 'broadcasting',
      label: '正在播报',
      secondsLeft: sec,
    };
  }

  // 4. action 截止或 endsAt 倒计时
  const deadline = timeline.actionDeadlineAt ?? timeline.endsAt;
  const sec = calculateRemainingSeconds(deadline, sample, currentMonotonic);
  return {
    status: 'counting',
    label: `${sec}s`,
    secondsLeft: sec,
  };
}
