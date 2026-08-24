/**
 * 全局手势与缩放锁定工具
 * 1. 拦截 iOS/Safari 与移动端浏览器的双指 pinch-to-zoom 手势（gesturestart / touchstart 多点触控）；
 * 2. 拦截双击快速放大（double-tap zoom）；
 * 3. 智能豁免：带有 .allow-zoom 或位于图片裁切器 (.profile-crop-canvas-wrapper) 内部的区域允许自由缩放。
 */

export function initGestureLock() {
  if (typeof window === 'undefined') return;

  // 1. 拦截 Safari / WebKit 的 gesture 事件
  document.addEventListener(
    'gesturestart',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.allow-zoom, .profile-crop-canvas-wrapper')) {
        return;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    'gesturechange',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.allow-zoom, .profile-crop-canvas-wrapper')) {
        return;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    'gestureend',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.allow-zoom, .profile-crop-canvas-wrapper')) {
        return;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // 2. 拦截多点触控双指缩放（Pinch-to-zoom）
  document.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length > 1) {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('.allow-zoom, .profile-crop-canvas-wrapper')) {
          return;
        }
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 3. 拦截移动端双击放大（Double-tap to zoom，间隔小于 300ms）
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const now = Date.now();
      const target = e.target as HTMLElement | null;
      // 表单输入框与裁切区允许正常交互
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.closest?.('.allow-zoom, .profile-crop-canvas-wrapper')
      ) {
        lastTouchEnd = now;
        return;
      }

      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}
