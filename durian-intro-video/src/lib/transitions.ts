/**
 * 场景转场动画工具函数
 */
import { interpolate } from 'remotion';

/**
 * 计算淡入淡出的 opacity 值
 * 场景开头 fadeIn 帧淡入，结尾 fadeOut 帧淡出
 */
export function fadeInOut(
  frame: number,
  totalDuration: number,
  fadeIn = 15,
  fadeOut = 15,
): number {
  return interpolate(
    frame,
    [0, fadeIn, totalDuration - fadeOut, totalDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/**
 * 从底部滑入的 translateY 值（px）
 */
export function slideFromBottom(
  frame: number,
  delay = 0,
  distance = 60,
  duration = 20,
): number {
  return interpolate(
    frame - delay,
    [0, duration],
    [distance, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/**
 * 通用延迟淡入 opacity
 */
export function delayedFadeIn(
  frame: number,
  delay: number,
  duration = 15,
): number {
  return interpolate(
    frame - delay,
    [0, duration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}
