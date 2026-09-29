import { useCallback, useEffect, useState } from 'react';

/**
 * 浏览器全屏能力封装（混合方案）。
 *
 * - 桌面 / 安卓 Chrome 等支持标准 Fullscreen API 的环境：直接对根元素请求全屏，达到类似 F11 的效果；
 * - iOS Safari 对非 <video> 元素不支持 Fullscreen API：`supported` 为 false，调用方需降级为
 *   「沉浸收起顶栏 + 100dvh」，并可引导用户「添加到主屏幕」以独立窗口运行。
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

type WebkitHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** 是否 iOS / iPadOS（含 iPadOS 13+ 伪装成 Mac 的情况）。 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iP(hone|ad|od)/.test(ua)) return true;
  // iPadOS 13+ 默认 UA 为桌面 Mac，靠触点数区分真实 Mac 与触屏 iPad。
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/** 是否处于 PWA 独立窗口（已添加到主屏幕并从图标启动）。 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return iosStandalone || displayStandalone;
}

/** 标准 Fullscreen API 是否可用（作用于普通 DOM 元素）。 */
export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  const el = document.documentElement as WebkitHTMLElement;
  const enabled = document.fullscreenEnabled || doc.webkitFullscreenEnabled || false;
  return Boolean(enabled && (el.requestFullscreen || el.webkitRequestFullscreen));
}

function currentFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as WebkitDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface FullscreenApi {
  /** 标准 Fullscreen API 是否可用；false 时（如 iOS Safari）调用方应降级。 */
  readonly supported: boolean;
  /** 当前是否 iOS / iPadOS。 */
  readonly ios: boolean;
  /** 当前是否处于（标准 API）全屏。 */
  readonly isFullscreen: boolean;
  /** 进入 / 退出全屏；返回 true 表示已由标准 API 处理，false 表示需要调用方自行降级。 */
  toggle: () => Promise<boolean>;
}

export function useFullscreen(): FullscreenApi {
  const supported = isFullscreenSupported();
  const ios = isIOS();
  const [isFullscreen, setIsFullscreen] = useState(() => currentFullscreenElement() !== null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(currentFullscreenElement() !== null);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    try {
      const el = document.documentElement as WebkitHTMLElement;
      const doc = document as WebkitDocument;
      if (currentFullscreenElement() === null) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
      return true;
    } catch {
      // 用户手势缺失 / 权限拒绝等：交由调用方降级
      return false;
    }
  }, [supported]);

  return { supported, ios, isFullscreen, toggle };
}
