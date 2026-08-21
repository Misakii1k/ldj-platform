/**
 * 原生 APP 环境检测：Capacitor WebView 内运行返回 true；浏览器/Node 单测返回 false。
 */
import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
