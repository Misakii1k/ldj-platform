import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Gamepad2, Home, LogOut, Play, RotateCcw } from 'lucide-react';
import { useConnection } from '../connection/useConnection.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import { nameFor } from './useGameAction.ts';
import { RollingNumber } from '../shared-ui/RollingNumber.tsx';

export function TabletopSettlementDock() {
  const { state, me, send, clearMe, setViewingHome } = useConnection();
  const { profile } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(3);

  const room = state.room;
  const isPostGame = Boolean(room && room.status === 'POST_GAME');

  const members = isPostGame ? (room!.members ?? []) : [];
  const playerMembers = members.filter((m) => m.seatRole === 'player');
  const myMember = members.find((m) => m.playerId === me?.playerId);
  const isHost = Boolean(myMember?.isHost);
  const isMeReady = Boolean(myMember?.ready);
  const isSpectator = myMember?.seatRole === 'spectator';

  const readyCount = playerMembers.filter((m) => m.ready).length;
  const totalPlayers = playerMembers.length;
  const isAllReady = totalPlayers > 0 && readyCount === totalPlayers;

  const isWerewolf = room?.gameId === 'werewolf';

  // 全员就绪 3 秒倒计时逻辑（狼人杀等深度长时推理游戏禁用自动开局，保留充足大复盘交流时间）
  // D-FIX：useEffect 必须在 early return 之前调用，否则违反 React Hooks 规则
  useEffect(() => {
    if (!isPostGame || !isAllReady || isWerewolf) {
      setCountdown(3);
      return;
    }
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (isHost) {
            void send('room_command', { command: 'start_game' });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPostGame, isAllReady, isWerewolf, isHost, send]);

  // 仅在房间处于 POST_GAME 结算阶段时展示
  if (!isPostGame) {
    return null;
  }

  // 准备 / 取消准备
  const handleToggleReady = async () => {
    if (busy || isSpectator) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'ready', ready: !isMeReady });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  // 房主跳过倒计时直接立即开局
  const handleStartImmediately = async () => {
    if (busy || !isHost) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'start_game' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '开局失败');
    } finally {
      setBusy(false);
    }
  };

  // 房主返回房间大厅
  const handleReturnToLobby = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '返回大厅失败');
    } finally {
      setBusy(false);
    }
  };

  // 离开房间
  const handleLeaveRoom = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send('leave_room', {});
    } catch {
      // 忽略离开房间网络异常，前端无论如何都清理本地状态退出
    } finally {
      clearMe();
      setBusy(false);
    }
  };

  const portalTheme = isWerewolf
    ? (typeof document !== 'undefined' ? document.getElementById('werewolf-portal-root')?.getAttribute('data-ww-theme') : null) ?? 'woodcut-day'
    : undefined;

  return createPortal(
    <aside className="tabletop-settlement-dock" data-ww-theme={portalTheme} role="region" aria-label="对局结算与再来一局操作坞">
      {/* 顶部玩家准备状态卡片条 */}
      <div className="settlement-dock-strip">
        <div className="settlement-dock-status">
          <div className="settlement-dock-title">
            {isAllReady ? (
              <>
                <Clock size={15} strokeWidth={2.4} aria-hidden="true" />
                <span>{isWerewolf ? '全员已就绪 · 由房主点击立即开局' : <>全员已就绪，{countdown > 0 ? <>{<RollingNumber value={countdown} />} 秒后</> : '正在'}自动开局</>}</span>
              </>
            ) : (
              <>
                <Gamepad2 size={15} strokeWidth={2.4} aria-hidden="true" />
                <span>对局已结算 · 已准备 <RollingNumber value={readyCount} /> / <RollingNumber value={totalPlayers} /></span>
              </>
            )}
          </div>
          <div className="settlement-dock-players" aria-label="玩家准备进度">
            {playerMembers.map((m) => {
              const isSelf = m.playerId === me?.playerId;
              const avatar = resolveMemberAvatar(m, { isMe: isSelf, myAvatar: profile.avatar });
              const name = isSelf ? '我' : nameFor(members, m.playerId);
              const isReady = Boolean(m.ready);

              return (
                <div
                  key={m.playerId}
                  className={`settlement-player-chip ${isReady ? 'is-ready' : 'is-waiting'}`}
                  title={`${name}：${isReady ? '已准备再来一局' : '思考中/待准备'}`}
                >
                  <div className="settlement-avatar-wrap">
                    <UserAvatar avatar={avatar} nickname={name} size={28} />
                    <span className={`settlement-badge ${isReady ? 'badge--ready' : 'badge--waiting'}`}>
                      {isReady ? '✓' : '…'}
                    </span>
                  </div>
                  <span className="settlement-player-name">{name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 核心操作按钮组 */}
        <div className="settlement-dock-actions">
          {!isSpectator && (
            <button
              type="button"
              className={`settlement-btn settlement-btn--primary ${isMeReady ? 'is-ready-state' : ''}`}
              onClick={handleToggleReady}
              disabled={busy}
            >
              {isMeReady ? (
                <>
                  <RotateCcw size={16} strokeWidth={2.5} aria-hidden="true" />
                  <span>{isAllReady && !isWerewolf ? `已准备 (${countdown}s)` : '已准备 (取消)'}</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} strokeWidth={2.5} aria-hidden="true" />
                  <span>再来一局</span>
                </>
              )}
            </button>
          )}

          {isHost && isAllReady && (
            <button
              type="button"
              className="settlement-btn settlement-btn--fast-start"
              onClick={handleStartImmediately}
              disabled={busy}
              title="跳过倒计时立即开始对局"
            >
              <Play size={16} strokeWidth={2.5} aria-hidden="true" />
              <span>立即开局</span>
            </button>
          )}

          {isHost && (
            <button
              type="button"
              className="settlement-btn settlement-btn--secondary"
              onClick={handleReturnToLobby}
              disabled={busy}
              title="房主将所有成员带回房间大厅（可切换游戏或调整配置）"
            >
              <span>返回大厅</span>
            </button>
          )}

          <button
            type="button"
            className="settlement-btn settlement-btn--secondary"
            onClick={() => setViewingHome(true)}
            disabled={busy}
            title="暂离返回主页，可在主页随时返回或自由体验其他游戏"
          >
            <Home size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>暂离返回首页</span>
          </button>

          <button
            type="button"
            className="settlement-btn settlement-btn--danger"
            onClick={handleLeaveRoom}
            disabled={busy}
            title="退出当前房间并释放席位"
          >
            <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>退出房间</span>
          </button>
        </div>
      </div>

      {error && <div className="settlement-dock-error" role="alert">{error}</div>}
    </aside>,
    document.body
  );
}
