import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { isNativeApp } from './app/nativePlatform.ts';
import { initGestureLock } from './shared-ui/gestureLock.ts';
import './styles.css';
// 各游戏专属样式（由 styles.css 按游戏拆分而来）。顺序刻意保持与拆分前一致：
// 必须在 styles.css 之后、game-ui.css 之前，否则 game-ui.css 的归一化层会失去“源顺序在后”的压制力。
import './game/night-testimony/night-testimony.css';
import './game/echo-judge/echo-judge.css';
import './game/goose-relay/goose-relay.css';
import './game/cheese-thief/cheese-thief.css';
import './game/durian/durian.css';
import './game/landlord/landlord.css';
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
