/**
 * 应用根组件（Task 4）：根据连接状态路由到对应页面。
 * connecting → 连接中；connected + me=null → 连接页；
 * me!=null + room=null → 恢复中；synced + room.status=IN_GAME → 游戏页；
 * 其他 → 房间页；seat_expired → 席位失效；reconnecting → 重连中。
 */
import { useConnection } from './connection/useConnection.ts';
import { ConnectionProvider } from './connection/ConnectionContext.tsx';
import { ToastProvider } from './shared-ui/ToastContext.tsx';
import { ConnectPage } from './app/ConnectPage.tsx';
import { RoomPage } from './room/RoomPage.tsx';
import { GamePage } from './game/GamePage.tsx';

function Router() {
  const { state, me, reset } = useConnection();
  const { connState, room, game } = state;

  // 席位被接管
  if (connState === 'seat_expired') {
    return (
      <main className="app error-screen">
        <h1>席位已被其他设备接管</h1>
        <p>{state.closeReason?.message ?? '本连接已断开'}</p>
        <button type="button" className="primary-btn" onClick={reset}>
          返回连接页
        </button>
      </main>
    );
  }

  // 正在连接
  if (connState === 'connecting') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在连接服务器…</p>
      </main>
    );
  }

  // 正在重连
  if (connState === 'reconnecting') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">连接断开，正在重连…</p>
        {me && <p className="loading-hint">将自动恢复你的席位</p>}
      </main>
    );
  }

  // 服务端恢复中
  if (connState === 'server_recovering') {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>正在重新同步</h1>
        <p className="loading">服务端正在恢复对局状态，请稍候…</p>
      </main>
    );
  }

  // 已连接但无身份 → 连接页
  if (me === null) {
    return <ConnectPage />;
  }

  // 有身份但无房间数据 → 恢复中
  if (room === null) {
    return (
      <main className="app loading-screen">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在恢复房间…</p>
        <button type="button" className="text-btn" onClick={reset}>
          放弃恢复，返回连接页
        </button>
      </main>
    );
  }

  // 房间已关闭（理论上服务端会断开连接，此处兜底）
  if (room.status === 'CLOSED') {
    return (
      <main className="app error-screen">
        <h1>房间已关闭</h1>
        <button type="button" className="primary-btn" onClick={reset}>
          返回连接页
        </button>
      </main>
    );
  }

  // 对局中且有游戏数据 → 游戏页
  if (room.status === 'IN_GAME' && game !== null) {
    return <GamePage />;
  }

  // 其他 → 房间页（LOBBY / POST_GAME / IN_GAME 但游戏数据未到）
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
