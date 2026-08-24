import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../app/nativePlatform.ts';

interface ImmersivePluginInterface {
  enable(): Promise<{ immersive: boolean }>;
  disable(): Promise<{ immersive: boolean }>;
  setImmersive(options: { enabled: boolean }): Promise<{ immersive: boolean }>;
  isEnabled(): Promise<{ immersive: boolean }>;
}

const ImmersivePlugin = registerPlugin<ImmersivePluginInterface>('ImmersiveMode');

let isAppImmersive = false;

/**
 * 启用或退出沉浸全屏模式。
 * 在 Android 原生环境下隐藏状态栏并允许从顶部下滑瞬态呼出通知栏。
 */
export async function setAppImmersiveMode(enabled: boolean): Promise<void> {
  isAppImmersive = enabled;

  if (typeof document !== 'undefined') {
    if (enabled) {
      document.body.classList.add('is-immersive');
    } else {
      document.body.classList.remove('is-immersive');
    }
  }

  if (isNativeApp()) {
    try {
      await ImmersivePlugin.setImmersive({ enabled });
    } catch {
      // 非原生或插件未就绪时降级
    }
  }
}

export function isAppImmersiveActive(): boolean {
  return isAppImmersive;
}
