import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useConnection } from '../connection/useConnection.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import { nameFor } from './useGameAction.ts';
import { plateFor } from '../shared-ui/platformSkin.ts';
import { webAudio } from '../shared-ui/WebAudioManager.ts';
import {
  computeSettlementDockModel,
  type SettlementDockPlayer,
} from './settlementDockModel.ts';
import './settlementDock.css';

/** 窄屏手机视口判定：≤640px 时签到牌头像缩小（对齐方向稿 .dock-m 的 32/24 规格） */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => (
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 640px)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const update = () => setNarrow(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return narrow;
}

export function TabletopSettlementDock() {
  const { state, me, send, clearMe, setViewingHome } = useConnection();
  const { profile } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);

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
  const skin = plateFor(room?.gameId).skin;
  const isNarrow = useNarrowViewport();

  // 上一帧 ready 的玩家 ID 集合，用于触发刚准备好的盖章动效
  const prevReadyIdsRef = useRef<Set<string>>(new Set());
  const freshReadyIdsRef = useRef<Set<string>>(new Set());

  const currentReadyIds = new Set(playerMembers.filter((m) => m.ready).map((m) => m.playerId));
  const newFresh = new Set<string>();
  for (const id of currentReadyIds) {
    if (!prevReadyIdsRef.current.has(id)) {
      newFresh.add(id);
    }
  }
  freshReadyIdsRef.current = newFresh;
  prevReadyIdsRef.current = currentReadyIds;

  // 全员就绪 3 秒倒计时逻辑（狼人杀等长时推理游戏禁用自动开局）
  // D-FIX：useEffect 必须在 early return 之前调用，否则违反 React Hooks 规则
  useEffect(() => {
    if (!isPostGame || !isAllReady || isWerewolf) {
      setCountdown(null);
      return;
    }
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return 3;
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

  // 倒计时数字变化触发滴答音效
  const prevCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (countdown !== null && countdown !== prevCountdownRef.current && countdown > 0) {
      webAudio.playTick();
    }
    prevCountdownRef.current = countdown;
  }, [countdown]);

  // 点击外部或按 Esc 关闭更多菜单
  useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  // 坞实际占位高度（含顶部吊牌）同步到 body CSS 变量，
  // 供 styles 里「坞出现时抬高聊天入口按钮」规则使用（10 人双行签到牌时坞更高）。
  useEffect(() => {
    if (!isPostGame) return undefined;
    const update = () => {
      const aside = dockRef.current;
      if (!aside) return;
      const tab = aside.querySelector('.settlement-dock__tab');
      const top = tab ? tab.getBoundingClientRect().top : aside.getBoundingClientRect().top;
      const clearance = Math.max(120, Math.ceil(window.innerHeight - top) + 8);
      document.body.style.setProperty('--settlement-dock-h', `${clearance}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.style.removeProperty('--settlement-dock-h');
    };
  }, [isPostGame, playerMembers.length, isAllReady, countdown]);

  // 仅在房间处于 POST_GAME 结算阶段时展示
  if (!isPostGame) {
    return null;
  }

  // 构建结算坞模型数据
  const dockPlayers: SettlementDockPlayer[] = playerMembers.map((m) => ({
    playerId: m.playerId,
    nickname: m.playerId === me?.playerId ? '我' : nameFor(members, m.playerId),
    avatar: resolveMemberAvatar(m, { isMe: m.playerId === me?.playerId, myAvatar: profile.avatar }),
    ready: Boolean(m.ready),
    isMe: m.playerId === me?.playerId,
    isHost: Boolean(m.isHost),
  }));

  const model = computeSettlementDockModel({
    players: dockPlayers,
    isHost,
    isSpectator,
    meReady: isMeReady,
    allReady: isAllReady,
    isWerewolf,
    countdown,
  });

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
      setMoreOpen(false);
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
      // 忽略网络异常，前端无论如何都清理本地状态退出
    } finally {
      clearMe();
      setBusy(false);
      setMoreOpen(false);
    }
  };

  const portalTheme = isWerewolf
    ? (typeof document !== 'undefined' ? document.getElementById('werewolf-portal-root')?.getAttribute('data-ww-theme') : null) ?? 'theater-night'
    : undefined;

  const inCountdown = countdown !== null;
  // countdown 到 0 时继续显示「1」，不显示「开局」「正在」字样，交棒给转场
  const displayDigit = inCountdown ? (countdown > 0 ? countdown : 1) : null;
  const isDense = dockPlayers.length > 5;

  return createPortal(
    <aside
      ref={dockRef}
      className="settlement-dock"
      data-dock-skin={skin}
      data-ww-theme={portalTheme}
      role="region"
      aria-label="对局结算与再来一局操作坞"
    >
      <div className="settlement-dock__board">
        {/* 顶部吊牌 (Tab) */}
        <div className={`settlement-dock__tab ${inCountdown ? 'is-countdown' : ''}`}>
          {inCountdown ? (
            <>
              <span key={displayDigit} className="settlement-dock__digit slam">
                {displayDigit}
              </span>
              <span className="settlement-dock__tab-sub">{model.statusLine}</span>
            </>
          ) : (
            <>
              <span>{model.statusLine}</span>
              <span className="settlement-dock__tab-ratio">
                · {model.readyCount}/{model.totalCount}
              </span>
            </>
          )}
        </div>

        {/* 签到牌网格 (Slips) */}
        <div className={`settlement-dock__slips ${isDense ? 'n10' : ''}`} aria-label="玩家准备进度">
          {dockPlayers.map((p) => {
            const isFresh = freshReadyIdsRef.current.has(p.playerId);
            // 对齐方向稿：桌面 38/密排26，窄屏手机 32/密排24
            const avatarSize = isDense ? (isNarrow ? 24 : 26) : (isNarrow ? 32 : 38);

            return (
              <div
                key={p.playerId}
                className={`settlement-dock__slip ${p.ready ? 'is-ready' : ''} ${isFresh ? 'is-fresh' : ''}`}
                title={`${p.nickname}：${p.ready ? '已准备' : '思考中/待准备'}`}
              >
                <div className="settlement-dock__avatar-wrap">
                  <UserAvatar avatar={p.avatar} nickname={p.nickname} size={avatarSize} />
                  {p.isHost && (
                    <span className="settlement-dock__host-crown" title="房主" aria-label="房主">
                      👑
                    </span>
                  )}
                </div>
                <span className="settlement-dock__slip-name">{p.nickname}</span>
                {p.ready && <span className="settlement-dock__stamp">备</span>}
              </div>
            );
          })}
        </div>

        {/* 操作按钮组 (Acts) */}
        <div className="settlement-dock__acts">
          {model.primary === 'again' && (
            <button
              type="button"
              className="settlement-dock__btn settlement-dock__btn--cta"
              onClick={handleToggleReady}
              disabled={busy}
            >
              ↻ 再来一局
            </button>
          )}

          {model.primary === 'start' && (
            <button
              type="button"
              className="settlement-dock__btn settlement-dock__btn--cta"
              onClick={handleStartImmediately}
              disabled={busy}
            >
              {inCountdown ? '▶ 立即开局' : '▶ 开局'}
            </button>
          )}

          {model.secondary === 'readyCancel' && (
            <button
              type="button"
              className="settlement-dock__btn settlement-dock__btn--ghost is-ready-state"
              onClick={handleToggleReady}
              disabled={busy}
            >
              ✓ 已准备 · 取消
            </button>
          )}

          {model.secondary === 'cancelReady' && (
            <button
              type="button"
              className="settlement-dock__btn settlement-dock__btn--ghost"
              onClick={handleToggleReady}
              disabled={busy}
            >
              取消准备
            </button>
          )}

          {/* 「⋯」更多菜单 */}
          <div className="settlement-dock__more-wrap" ref={moreRef}>
            <button
              type="button"
              className={`settlement-dock__btn settlement-dock__btn--more ${moreOpen ? 'is-active' : ''}`}
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label="更多操作"
              aria-expanded={moreOpen}
            >
              ⋯
            </button>

            {moreOpen && (
              <div className="settlement-dock__more-menu" role="menu">
                {isHost && (
                  <button
                    type="button"
                    className="settlement-dock__menu-item"
                    role="menuitem"
                    onClick={handleReturnToLobby}
                    disabled={busy}
                  >
                    <span>🏠</span>
                    <div>
                      <span>返回房间大厅</span>
                      <small>带全员回房间，可换游戏</small>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  className="settlement-dock__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setViewingHome(true);
                    setMoreOpen(false);
                  }}
                  disabled={busy}
                >
                  <span>↩</span>
                  <div>
                    <span>暂离回首页</span>
                    <small>席位保留，随时回来</small>
                  </div>
                </button>
                <div className="settlement-dock__menu-divider" />
                <button
                  type="button"
                  className="settlement-dock__menu-item settlement-dock__menu-item--danger"
                  role="menuitem"
                  onClick={handleLeaveRoom}
                  disabled={busy}
                >
                  <span>⏻</span>
                  <div>
                    <span>退出房间</span>
                    <small>释放你的席位</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="settlement-dock__error" role="alert">
            {error}
          </div>
        )}
      </div>
    </aside>,
    document.body
  );
}
