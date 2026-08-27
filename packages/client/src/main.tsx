import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { isNativeApp } from './app/nativePlatform.ts';
import { initGestureLock } from './shared-ui/gestureLock.ts';
import './styles.css';
import './shared-ui/GameMotion.css';
import './shared-ui/game-ui.css';

initGestureLock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 注册 PWA Service Worker；失败不影响应用运行。
// 原生 APP 内跳过：WebView 资源随 APK 打包，SW 缓存会掩盖版本更新。
if (!isNativeApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
