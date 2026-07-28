import { useConnection } from './connection/useConnection.ts';
import { ConnectionProvider } from './connection/ConnectionContext.tsx';
import { ToastProvider } from './shared-ui/ToastContext.tsx';
import { GameHomePage } from './app/GameHomePage.tsx';
import { RoomPage } from './room/RoomPage.tsx';
import { GamePage } from './game/GamePage.tsx';

function Router() {
  const { state, me, reset, resync } = useConnection();
  const { connState, room, game } = state;

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

  if (connState === 'reconnecting') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">连接断开，正在重连…</p>
        {me && <p className="loading-hint">将自动恢复你的席位</p>}
      </main>
    );
  }

  if (connState === 'server_recovering') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>正在重新同步</h1>
        <p className="loading">服务端正在恢复对局状态，请稍候…</p>
      </main>
    );
  }

  if (me === null) return <GameHomePage />;

  if (room === null) {
    return (
      <main className="app loading-screen">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在恢复房间…</p>
        <button type="button" className="text-btn" onClick={reset}>放弃恢复，返回首页</button>
      </main>
    );
  }

  if (room.status === 'CLOSED') {
    return (
      <main className="app error-screen">
        <h1>房间已关闭</h1>
        <button type="button" className="primary-btn" onClick={reset}>返回首页</button>
      </main>
    );
  }

  if (room.status === 'IN_GAME') {
    if (game !== null) return <GamePage />;
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>对局已开始</h1>
        <p className="loading">正在同步牌局数据…</p>
        <button type="button" className="primary-btn" onClick={resync}>重新同步</button>
      </main>
    );
  }

  return <RoomPage />;
}

export function App() {
  return (
    <ConnectionProvider>
      <ToastProvider>
        <Router />
      </ToastProvider>
    </ConnectionProvider>
  );
}
