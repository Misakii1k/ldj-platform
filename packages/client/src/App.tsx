import { useConnection } from './connection/useConnection.ts';
import { ConnectionProvider } from './connection/ConnectionContext.tsx';
import { ToastProvider } from './shared-ui/ToastContext.tsx';
import { BackgroundProvider } from './shared-ui/BackgroundContext.tsx';
import { BackgroundManager } from './shared-ui/BackgroundManager.tsx';
import { MotionProvider } from './motion/MotionContext.tsx';
import { GameHomePage } from './app/GameHomePage.tsx';
import { RoomPage } from './room/RoomPage.tsx';
import { GamePage } from './game/GamePage.tsx';
import { TabletopStatusBanner } from './game/TabletopStatusBanner.tsx';

function Router() {
  const { state, me, reset, resync } = useConnection();
  const { connState, room, game, isRefreshing, isRecovering } = state;

  // D4-UI0：断线重连 / 服务端恢复期间，只要已有内容（房间或对局）就保留当前
  // 渲染视图并在顶部叠一条非模态状态横幅，而不是用全屏 loader 替换桌子。
  const hasContent = room !== null || game !== null;
  const showBanner = isRefreshing || isRecovering;

  if (connState === 'seat_expired') {
    return (
      <main className="app error-screen">
        <h1>席位已被其他设备接管</h1>
        <p>{state.closeReason?.message ?? '本连接已断开'}</p>
        <button type="button" className="primary-btn" onClick={reset}>返回首页</button>
      </main>
    );
  }

  if (connState === 'connecting') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在连接服务器…</p>
      </main>
    );
  }

  if (connState === 'reconnecting' && !hasContent) {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">连接断开，正在重连…</p>
        {me && <p className="loading-hint">将自动恢复你的席位</p>}
      </main>
    );
  }

  if (connState === 'server_recovering' && !hasContent) {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>正在重新同步</h1>
        <p className="loading">服务端正在恢复对局状态，请稍候…</p>
      </main>
    );
  }

  if (me === null) return <GameHomePage />;

  let view;
  if (room === null) {
    view = (
      <main className="app loading-screen">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在恢复房间…</p>
        <button type="button" className="text-btn" onClick={reset}>放弃恢复，返回首页</button>
      </main>
    );
  } else if (room.status === 'CLOSED') {
    view = (
      <main className="app error-screen">
        <h1>房间已关闭</h1>
        <button type="button" className="primary-btn" onClick={reset}>返回首页</button>
      </main>
    );
  } else if (room.status === 'IN_GAME') {
    view = game !== null ? <GamePage /> : (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>对局已开始</h1>
        <p className="loading">正在同步牌局数据…</p>
        <button type="button" className="primary-btn" onClick={resync}>重新同步</button>
      </main>
    );
  } else {
    view = <RoomPage />;
  }

  if (showBanner) {
    return (
      <>
        <TabletopStatusBanner state={state} />
        {view}
      </>
    );
  }
  return view;
}

export function App() {
  return (
    <ConnectionProvider>
      <ToastProvider>
        <MotionProvider>
          <BackgroundProvider>
            <BackgroundManager>
              <Router />
            </BackgroundManager>
          </BackgroundProvider>
        </MotionProvider>
      </ToastProvider>
    </ConnectionProvider>
  );
}
