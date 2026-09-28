import { useEffect, useState, useRef } from 'react';
import { useConnection } from './connection/useConnection.ts';
import { ConnectionProvider } from './connection/ConnectionContext.tsx';
import { ToastProvider, useToast } from './shared-ui/ToastContext.tsx';
import { BackgroundProvider } from './shared-ui/BackgroundContext.tsx';
import { BackgroundManager } from './shared-ui/BackgroundManager.tsx';
import { MotionProvider } from './motion/MotionContext.tsx';
import { GameHomePage } from './app/GameHomePage.tsx';
import { RoomPage } from './room/RoomPage.tsx';
import { GamePage } from './game/GamePage.tsx';
import { TabletopStatusBanner } from './game/TabletopStatusBanner.tsx';
import { GameStartTransition } from './shared-ui/GameStartTransition.tsx';
import { webAudio } from './shared-ui/WebAudioManager.ts';
import { UserProfileProvider } from './user/UserProfileContext.tsx';
import { UserProfileModal } from './user/UserProfileModal.tsx';
import { ErrorBoundary } from './shared-ui/ErrorBoundary.tsx';
import { AppModeProvider, useAppMode } from './app/AppModeContext.tsx';
import { isNativeApp } from './app/nativePlatform.ts';
import { OutdoorDisplayPage } from './display/OutdoorDisplayPage.tsx';

function Router() {
  const { state, me, isViewingHome, setViewingHome, reset, resync } = useConnection();
  const { backToModeSelection } = useAppMode();

  const isDisplayMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('display') === 'true' ||
    new URLSearchParams(window.location.search).get('display') === '1' ||
    new URLSearchParams(window.location.search).get('view') === 'display' ||
    window.location.pathname === '/display' ||
    window.location.pathname.startsWith('/display/')
  );

  if (isDisplayMode) {
    return <OutdoorDisplayPage />;
  }

  const { connState, room, game, isRefreshing, isRecovering } = state;
  const { showToast } = useToast();
  const [inGameTransition, setInGameTransition] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState<'dock' | 'room'>('dock');
  const prevRoomStatusRef = useRef<string | null>(null);

  // 原生 APP：连接类停留页提供身份/服务器切换逃生口
  const identitySwitchButton = isNativeApp() ? (
    <button type="button" className="text-btn" onClick={backToModeSelection}>切换身份或主机</button>
  ) : null;

  useEffect(() => {
    const prev = prevRoomStatusRef.current;
    const current = room?.status ?? null;
    prevRoomStatusRef.current = current;

    if (prev && prev !== 'IN_GAME' && current === 'IN_GAME') {
      setTransitionOrigin(prev === 'POST_GAME' ? 'dock' : 'room');
      webAudio.playDealCards();
      setInGameTransition(true);
    }
  }, [room?.status]);

  useEffect(() => {
    if (state.closeReason?.code === 'room_closed') {
      showToast('房主已解散房间');
      reset();
    }
  }, [state.closeReason?.code, showToast, reset]);

  // 邀请深链消费完成：一旦建立身份（加入成功/恢复席位），把 /join/房间码 从地址栏清掉，
  // 避免刷新后再次弹出加入层。
  useEffect(() => {
    if (me !== null && window.location.pathname.startsWith('/join/')) {
      window.history.replaceState(null, '', '/');
    }
  }, [me]);

  // D4-UI0：断线重连 / 服务端恢复期间，只要已有内容（房间或对局）就保留当前
  // 渲染视图并在顶部叠一条非模态状态横幅，而不是用全屏 loader 替换桌子。
  const hasContent = room !== null || game !== null;
  const showBanner = isRefreshing || isRecovering;

  // 如果用户尚未进入房间，或者用户主动选择了暂离返回大厅/首页，展示主页（可自由挑选/创建新游戏，顶部显示返回原房间）
  if (me === null || isViewingHome) {
    return <GameHomePage />;
  }

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
        {identitySwitchButton}
      </main>
    );
  }

  if (connState === 'reconnecting' && !hasContent) {
    return (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>局域网桌游平台</h1>
        <p className="loading">连接断开，正在重连…</p>
        {me && <p className="loading-hint">将自动恢复你的席位</p>}
        {identitySwitchButton}
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

  let view;
  if (room === null) {
    view = (
      <main className="app loading-screen">
        <h1>局域网桌游平台</h1>
        <p className="loading">正在恢复房间…</p>
        <button type="button" className="text-btn" onClick={() => setViewingHome(true)}>暂离返回首页</button>
      </main>
    );
  } else if (room.status === 'CLOSED') {
    view = (
      <main className="app error-screen">
        <h1>房间已关闭</h1>
        <button type="button" className="primary-btn" onClick={reset}>返回首页</button>
      </main>
    );
  } else if (room.status === 'IN_GAME' || (room.status === 'POST_GAME' && game !== null)) {
    view = game !== null ? <GamePage /> : (
      <main className="app loading-screen" aria-live="polite" aria-busy="true">
        <h1>对局已开始</h1>
        <p className="loading">正在同步牌局数据…</p>
        <button type="button" className="primary-btn" onClick={resync}>重新同步</button>
        {/* 逃生口：对局数据长时间无法同步时（如服务端会话残留），允许用户主动退出返回首页 */}
        <button type="button" className="text-btn" onClick={reset}>离开对局，返回首页</button>
      </main>
    );
  } else {
    view = <RoomPage />;
  }

  return (
    <>
      <GameStartTransition
        active={inGameTransition}
        onComplete={() => setInGameTransition(false)}
        gameId={room?.gameId}
        origin={transitionOrigin}
        playerCount={room?.members?.filter((m) => m.seatRole === 'player').length ?? 1}
      />
      {showBanner && <TabletopStatusBanner state={state} />}
      {view}
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppModeProvider>
        <UserProfileProvider>
          <ConnectionProvider>
            <ToastProvider>
              <MotionProvider>
                <BackgroundProvider>
                  <BackgroundManager>
                    <Router />
                    <UserProfileModal />
                  </BackgroundManager>
                </BackgroundProvider>
              </MotionProvider>
            </ToastProvider>
          </ConnectionProvider>
        </UserProfileProvider>
      </AppModeProvider>
    </ErrorBoundary>
  );
}


