/**
 * 房间页（Task 2）：成员列表、房间码展示、聊天区、房主操作栏。
 * 同步未完成（connState !== 'synced'）时禁用会改变状态的按钮，但聊天草稿保留。
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useConnection } from '../connection/useConnection.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { describeError } from '../shared-ui/errors.ts';
import {
  getGameCatalogEntry,
  GAME_CATALOG,
  type RoomMemberView,
  type RoomSnapshotView,
} from '@ldj/shared';
import { GameSetupPanel } from '../shared-ui/GameSetupPanel.tsx';
import { ConfirmDialog } from '../shared-ui/ConfirmDialog.tsx';
import { ChatMessageList } from '../shared-ui/ChatMessageList.tsx';
import { GameIcon } from '../shared-ui/GameIcon.tsx';
import { RoomCodeCard } from './RoomCodeCard.tsx';
import { buildModuleConfig, readRoomGameConfig, type SetupConfig } from '../shared-ui/setupState.ts';
import { UserProfileBadge } from '../user/UserProfileBadge.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';

function statusText(status: string): string {
  switch (status) {
    case 'LOBBY': return '大厅筹备中';
    case 'IN_GAME': return '激战进行中';
    case 'POST_GAME': return '对局已结算';
    case 'CLOSED': return '房间已解散';
    default: return status;
  }
}

function memberStatusBadge(m: RoomMemberView): { label: string; cls: string } {
  switch (m.connectionStatus) {
    case 'CONNECTED':
      return m.ready ? { label: '已就绪', cls: 'online ready' } : { label: '待准备', cls: 'online' };
    case 'DISCONNECTED_RESERVED': return { label: '保留席位', cls: 'reserved' };
    case 'EXPIRED': return { label: '已过期', cls: 'expired' };
    case 'KICKED': return { label: '已移出', cls: 'kicked' };
    default: return { label: m.connectionStatus, cls: '' };
  }
}


/** 全员就绪时的自动开局倒计时横幅（服务端 5 秒后 auto_start） */
function AutoStartBanner({ active }: { active: boolean }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (!active) {
      setLeft(5);
      return;
    }
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div className="autostart-banner" role="status">
      <span className="autostart-banner__dot" aria-hidden="true" />
      <span>全员就绪 · {left} 秒后自动开局…</span>
    </div>
  );
}

export function RoomPage() {
  const { state, me, send, clearMe, setViewingHome } = useConnection();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const room: RoomSnapshotView | null = state.room;
  const [chatDraft, setChatDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGameSwitcher, setShowGameSwitcher] = useState(false);
  // P1-6：共享确认弹窗状态机（替代原生 confirm 与内联 confirm-row）
  const [confirmState, setConfirmState] = useState<{
    kind: 'kick' | 'transfer' | 'abort' | 'close' | 'leave';
    targetPlayerId?: string;
    name?: string;
  } | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const roomCommandInFlightRef = useRef(false);
  const [gameConfig, setGameConfig] = useState<SetupConfig>({});

  const synced = state.connState === 'synced';
  const isHost = me !== null && room !== null && room.members.some(
    (m) => m.playerId === me.playerId && m.isHost,
  );
  const myPlayerId = me?.playerId ?? null;

  // P1-9：成员昵称索引（聊天渲染共用）
  const memberNames = useMemo(() => {
    const entries = room?.members.map((m) => [m.playerId, m.nickname] as const) ?? [];
    return new Map(entries);
  }, [room]);

  const onlinePlayers = room?.members.filter(
    (m) => m.seatRole === 'player' && m.connectionStatus === 'CONNECTED',
  ) ?? [];

  const selectedGame = getGameCatalogEntry(room?.gameId);

  useEffect(() => {
    if (!selectedGame) return;
    setGameConfig(readRoomGameConfig(selectedGame.setup, room?.config));
  }, [selectedGame, room?.config]);

  // 聊天滚动到底
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length]);

  async function doRoomCommand(payload: unknown, label: string): Promise<boolean> {
    if (roomCommandInFlightRef.current) return false;
    roomCommandInFlightRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', payload);
      return true;
    } catch (err) {
      setActionError(`${label}失败：${describeError(err)}`);
      return false;
    } finally {
      roomCommandInFlightRef.current = false;
      setBusy(false);
    }
  }

  // 房主切换当前房间的游戏
  function handleSelectGame(gameId: string) {
    setShowGameSwitcher(false);
    void doRoomCommand({ command: 'select_game', gameId }, '切换游戏');
  }

  // P1-6：确认弹窗执行（提交中保持弹窗与对象；成功关闭、失败保留）
  async function runConfirmAction() {
    if (!confirmState) return;
    const { kind } = confirmState;
    let ok = false;
    if (kind === 'kick' && confirmState.targetPlayerId) {
      ok = await doRoomCommand({ command: 'kick_player', targetPlayerId: confirmState.targetPlayerId }, '踢人');
    } else if (kind === 'transfer' && confirmState.targetPlayerId) {
      ok = await doRoomCommand({ command: 'transfer_host', targetPlayerId: confirmState.targetPlayerId }, '转让房主');
    } else if (kind === 'abort') {
      ok = await doRoomCommand({ command: 'abort_game' }, '终止对局');
    } else if (kind === 'close') {
      ok = await doRoomCommand({ command: 'close_room' }, '关闭房间');
    } else if (kind === 'leave') {
      await performLeave();
      setConfirmState(null);
      return;
    }
    if (ok) setConfirmState(null);
  }

  async function performLeave() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await send('leave_room', {});
    } catch (err) {
      setActionError(`离开失败：${describeError(err)}`);
      setBusy(false);
      return;
    }
    clearMe();
  }

  async function performDissolve() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', { command: 'close_room' });
    } catch (err) {
      setActionError(`解散失败：${describeError(err)}`);
      setBusy(false);
      return;
    }
    clearMe();
  }

  function handleStartGame() {
    if (!selectedGame) return;
    void doRoomCommand({ command: 'start_game', gameConfig: buildModuleConfig(selectedGame.setup, gameConfig) }, '开始游戏');
  }

  function handleGameConfigChange(next: SetupConfig) {
    if (!selectedGame) return;
    setGameConfig(next);
    void doRoomCommand({ command: 'update_config', config: { gameConfig: buildModuleConfig(selectedGame.setup, next) } }, '保存规则');
  }

  function handleToggleReady(ready: boolean) {
    void doRoomCommand({ command: 'ready', ready: !ready }, ready ? '取消准备' : '准备');
  }

  function handleKick(playerId: string, name: string) {
    setConfirmState({ kind: 'kick', targetPlayerId: playerId, name });
  }

  function handleTransfer(playerId: string, name: string) {
    setConfirmState({ kind: 'transfer', targetPlayerId: playerId, name });
  }

  function handleAddBot(kind: 'rule' | 'llm') {
    void doRoomCommand({ command: 'add_bot', kind }, kind === 'llm' ? '添加 AI 玩家' : '添加机器人');
  }

  function handleRemoveBot(targetPlayerId?: string) {
    void doRoomCommand(
      targetPlayerId === undefined
        ? { command: 'remove_bot' }
        : { command: 'remove_bot', targetPlayerId },
      '移除机器人',
    );
  }


  function handleReturnToLobby() {
    void doRoomCommand({ command: 'return_to_lobby' }, '返回大厅');
  }

  function handleLeaveRoom() {
    if (busy) return;
    if (isHost) {
      setConfirmState({ kind: 'leave' });
    } else {
      void performLeave();
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || !synced || busy) return;
    setBusy(true);
    const draftBackup = chatDraft;
    setChatDraft('');
    try {
      await send('chat_send', { text });
      chatInputRef.current?.focus();
    } catch (err) {
      setChatDraft(draftBackup);
      setActionError(`发送失败：${describeError(err)}`);
      showToast(`发送失败：${describeError(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (room === null || selectedGame === undefined) {
    return (
      <main className="room-page game-home-page">
        <div className="game-home-page__content room-layout">
          <div className="loading room-loading">
            正在加载房间信息…
          </div>
        </div>
      </main>
    );
  }

  const roomGame = selectedGame;
  const minimumPlayersToStart = roomGame.minPlayers;
  const maximumPlayers = roomGame.maxPlayers;
  const notReadyCount = onlinePlayers.filter((p) => !p.ready).length;
  // 自己是否还没准备：机器人加入即就绪，最容易出现"人数够了但卡在 1 人未准备"的就是房主本人
  const meNotReady = me !== null && room !== null
    && (room.members.find((m) => m.playerId === me.playerId)?.ready === false);
  const canStart =
    (room.status === 'LOBBY' || room.status === 'POST_GAME') &&
    onlinePlayers.length >= minimumPlayersToStart &&
    onlinePlayers.length <= maximumPlayers &&
    notReadyCount === 0;
  const startDisabledReason = !canStart
    ? meNotReady
      ? '你还未准备：先点击成员列表中自己（我）的「准备」按钮'
      : onlinePlayers.length < minimumPlayersToStart
        ? `需要 ${minimumPlayersToStart}–${maximumPlayers} 名在线玩家（当前 ${onlinePlayers.length}）`
        : notReadyCount > 0
          ? `还有 ${notReadyCount} 人未准备`
          : `需要 ${minimumPlayersToStart}–${maximumPlayers} 名在线玩家`
    : '';

  const botCount = room.members.filter((m) => m.botKind !== null).length;
  // 席位满了就不能再加：服务端也会拒，这里提前禁用避免无效往返
  const seatsFull = onlinePlayers.length >= maximumPlayers;
  const autoStartActive =
    (room.status === 'LOBBY' || room.status === 'POST_GAME') &&
    onlinePlayers.length >= minimumPlayersToStart &&
    onlinePlayers.length <= maximumPlayers &&
    onlinePlayers.length > 0 &&
    notReadyCount === 0;

  const sortedMembers = [...room.members].sort((a, b) => {
    if (a.seatRole !== b.seatRole) return a.seatRole === 'player' ? -1 : 1;
    return (a.seat ?? 999) - (b.seat ?? 999);
  });

  return (
    <main className="room-page game-home-page" data-game-id={roomGame.id}>
      <div className="game-home-page__content room-layout">
        <header className="home-header room-header">
          <div className="home-brand room-header__brand">
            <img
              src={`/icons/${roomGame.id}.png`}
              alt=""
              style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px' }}
              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            />
            <span className="room-header__title">{roomGame.displayName}</span>
            <span className="room-status-badge">
              <span className="room-status-badge__dot" />
              {statusText(room.status)}
            </span>
          </div>
          <div className="home-header__actions room-header__actions">
            {isHost && room.status !== 'IN_GAME' && (
              <button
                type="button"
                className="room-action-btn room-action-btn--switch"
                onClick={() => setShowGameSwitcher(true)}
                title="更换房间游玩的游戏"
              >
                切换游戏
              </button>
            )}
            <button
              type="button"
              className="room-action-btn room-action-btn--leave"
              onClick={() => setViewingHome(true)}
              title="暂离返回主页，可在主页随时返回或自由体验其他游戏"
            >
              暂离大厅
            </button>
            <UserProfileBadge />
          </div>
        </header>

        <section className="room-hero" aria-labelledby="room-title">
          <div className="room-hero__panel">
            <h1 id="room-title" className="room-hero__title">
              等待好友<span>入座</span>
            </h1>
            <p className="room-hero__description">
              本局游戏：{roomGame.displayName} · 适合 {minimumPlayersToStart}–{maximumPlayers} 人。将房间码分享给身边的朋友，准备就绪后即可开启本局对局。
            </p>
          </div>

          <RoomCodeCard
            gameName={roomGame.displayName}
            roomCode={room.roomCode}
            inviteUrl={`${window.location.origin}/join/${room.roomCode}`}
            online={onlinePlayers.length}
            max={maximumPlayers}
          />
        </section>

        {actionError && <div className="error-banner room-sheet__error" role="alert">{actionError}</div>}

        <GameSetupPanel
          setup={roomGame.setup}
          value={gameConfig}
          disabled={!isHost || busy || !synced || room.status !== 'LOBBY'}
          onChange={handleGameConfigChange}
        />

        <div className="room-content-grid">
          <section className="room-panel room-players-panel members-section">
            <div className="room-panel__head">
              <div>
                <h2 className="room-panel__title">成员（{onlinePlayers.length}/{maximumPlayers}）</h2>
              </div>
              {room.members.some((m) => m.connectionStatus !== 'CONNECTED' && m.connectionStatus !== 'KICKED') && <span className="members-hint room-panel__hint">含断线保留</span>}
            </div>
            <ul className="members-list room-members-list" aria-label="房间成员列表">
              {sortedMembers.map((m) => {
                const badge = memberStatusBadge(m);
                const isMe = m.playerId === myPlayerId;
                return (
                  <li key={m.playerId} className={'member ' + badge.cls}>
                    <span className="member-seat">{m.seatRole === 'player' ? '#' + (m.seat ?? '?') : '观'}</span>
                    <UserAvatar avatar={isMe ? profile.avatar : 'preset:fox'} nickname={m.nickname} size={32} style={{ marginRight: '6px' }} />
                    <span className="member-name">
                      {m.nickname}
                      {m.isHost && (
                        <span className="host-icon" title="房主">
                          <GameIcon name="crown" size={15} style={{ marginLeft: '4px' }} />
                        </span>
                      )}
                      {isMe && <span className="me-tag">（我）</span>}
                      {m.botKind === 'llm' && <span className="bot-tag bot-tag--llm" title="由大模型决策">AI</span>}
                      {m.botKind === 'rule' && <span className="bot-tag" title="随机合法出牌">机器人</span>}
                    </span>
                    <span className={'member-status ' + badge.cls}>{badge.label}</span>
                    {/* 我自己的准备/取消准备（非机器人；机器人自动就绪） */}
                    {isMe && m.botKind === null && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
                      <span className="member-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          aria-label={m.ready ? '取消准备' : '准备'}
                          onClick={() => handleToggleReady(m.ready)}
                          disabled={busy || !synced}
                        >
                          {m.ready ? '取消准备' : '准备'}
                        </button>
                      </span>
                    )}
                    {/* 机器人不能当房主、也不叫"踢出"，只给一个移除入口 */}
                    {isHost && m.botKind !== null && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
                      <span className="member-actions">
                        <button type="button" className="mini-btn" aria-label={'移除 ' + m.nickname} onClick={() => handleRemoveBot(m.playerId)} disabled={busy || !synced}>移除</button>
                      </span>
                    )}
                    {isHost && m.botKind === null && m.playerId !== myPlayerId && m.connectionStatus === 'CONNECTED' && (
                      <span className="member-actions">
                        <button type="button" className="mini-btn" aria-label={'踢出玩家 ' + m.nickname} onClick={() => handleKick(m.playerId, m.nickname)} disabled={busy || !synced || room.status === 'CLOSED'}>踢出</button>
                        <button type="button" className="mini-btn" aria-label={'转让房主给 ' + m.nickname} onClick={() => handleTransfer(m.playerId, m.nickname)} disabled={busy || !synced || room.status === 'CLOSED'}>转让房主</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="room-panel room-chat-panel chat-section">
            <div className="room-panel__head">
              <div>
                <h2 className="room-panel__title">聊天</h2>
              </div>
              <span className="room-panel__glyph" aria-hidden="true">✦</span>
            </div>
            <div className="chat-box room-chat-box" ref={chatBoxRef}>
              {state.chat.length === 0 ? <div className="chat-empty">还没有消息</div> : (
                <ChatMessageList messages={state.chat} myPlayerId={myPlayerId} memberNames={memberNames} />
              )}
            </div>
            <form className="chat-input-row" onSubmit={handleSendChat}>
              <input ref={chatInputRef} type="text" value={chatDraft} onChange={(e) => setChatDraft(e.target.value.slice(0, 300))} placeholder={synced ? '输入消息…' : '同步中…暂不能发送'} maxLength={300} disabled={!synced} aria-label="聊天输入" />
              <button type="submit" className="game-card__action room-inline-btn" aria-label="发送消息" disabled={!synced || !chatDraft.trim() || busy}>发送</button>
            </form>
          </section>
        </div>

        <section className="home-join-callout room-share-note room-console" aria-labelledby="room-actions-title">
          <div className="room-console__head">
            <span className="home-join-callout__icon" aria-hidden="true">♟</span>
            <div>
              <h2 id="room-actions-title" className="room-console__title">{(room.status === 'LOBBY' || room.status === 'POST_GAME') ? '对局准备中' : '当前状态：' + statusText(room.status)}</h2>
            </div>
            {(room.status === 'LOBBY' || room.status === 'POST_GAME') && (
              <div className="room-console__ready" role="status" aria-label="就绪进度">
                <span className="room-console__ready-label">已就绪 {onlinePlayers.filter((p) => p.ready).length} / {onlinePlayers.length}</span>
                <div className="room-console__ready-track">
                  <span style={{ width: `${onlinePlayers.length > 0 ? (onlinePlayers.filter((p) => p.ready).length / onlinePlayers.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="action-bar room-console__actions">
            <button type="button" className="leave-btn" onClick={handleLeaveRoom} disabled={busy}>离开房间</button>
            {room.status === 'POST_GAME' && isHost && <button type="button" className="room-console__secondary room-inline-btn" onClick={handleReturnToLobby} disabled={busy || !synced}>返回大厅</button>}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && <button type="button" className="game-card__action room-inline-btn" onClick={handleStartGame} disabled={busy || !synced || !canStart}>开始游戏</button>}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport !== 'none' && <button type="button" className="room-console__secondary room-inline-btn" onClick={() => handleAddBot('rule')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '凑人数用，按规则自动参与'}>添加机器人</button>}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport === 'rule_and_llm' && state.llmAvailable && <button type="button" className="room-console__secondary room-inline-btn" onClick={() => handleAddBot('llm')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '由 AI 大模型智能陪玩，异常时自动退回普通机器人'}>添加 AI 玩家</button>}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport !== 'none' && botCount > 0 && <button type="button" className="room-console__secondary room-inline-btn" onClick={() => handleRemoveBot()} disabled={busy || !synced} title="移除最后加入的机器人">移除机器人（{botCount}）</button>}
            {isHost && room.status === 'IN_GAME' && <button type="button" className="danger-btn" onClick={() => setConfirmState({ kind: 'abort' })} disabled={busy || !synced}>终止对局</button>}
            {isHost && !confirmState && room.status !== 'CLOSED' && <button type="button" className="danger-btn" onClick={() => setConfirmState({ kind: 'close' })} disabled={busy || !synced}>解散房间</button>}
          </div>
          {/* 2-5：开始游戏禁用原因常驻可见（替代仅 title 提示与重复横幅） */}
          {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && !canStart && (
            <p className="room-console__reason" role="status">{startDisabledReason}</p>
          )}
        </section>

        {/* 连接断线/服务端恢复状态由 App 顶部 TabletopStatusBanner 统一表达（1-1 去重） */}
        {/* 2-7 横幅互斥：错误横幅存在时不叠加自动开局倒计时 */}
        <AutoStartBanner active={autoStartActive && synced && !actionError} />
      </div>

      {/* 游戏切换弹窗 */}
      {showGameSwitcher && createPortal(
        <div className="game-switcher-backdrop" onClick={() => setShowGameSwitcher(false)}>
          <div className="game-switcher-modal" onClick={(e) => e.stopPropagation()}>
            <header className="game-switcher-header">
              <h3>切换房间玩法</h3>
              <button type="button" className="profile-modal__close-btn" onClick={() => setShowGameSwitcher(false)}>×</button>
            </header>
            <div className="game-switcher-grid">
              {GAME_CATALOG.filter((g) => g.availability === 'playable').map((g) => {
                const isCurrent = g.id === roomGame.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`game-switcher-card ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => handleSelectGame(g.id)}
                    disabled={isCurrent}
                  >
                    <div className="game-switcher-card__icon-box">
                      <GameIcon name={g.id as any} size={28} />
                    </div>
                    <div className="game-switcher-card__info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong className="game-switcher-card__name">{g.displayName}</strong>
                        <span className="game-switcher-card__players">{g.minPlayers}–{g.maxPlayers}人</span>
                      </div>
                      <span className="game-switcher-card__desc">{g.summary}</span>
                    </div>
                    {isCurrent ? <span className="game-switcher-card__badge">当前玩法</span> : <span className="game-switcher-card__btn">选用</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* P1-6：共享确认弹窗（踢出/转让/终止/解散） */}
      {confirmState && (
        <ConfirmDialog
          title={
            confirmState.kind === 'kick' ? '移出玩家'
              : confirmState.kind === 'transfer' ? '转让房主'
                : confirmState.kind === 'abort' ? '终止本局'
                  : confirmState.kind === 'leave' ? '退出选项'
                  : '解散房间'
          }
          message={
            confirmState.kind === 'kick' ? ('确定要移出 ' + (confirmState.name ?? '该玩家') + ' 吗？移出后其席位将释放。')
              : confirmState.kind === 'transfer' ? ('确定要把房主转让给 ' + (confirmState.name ?? '该玩家') + ' 吗？')
                : confirmState.kind === 'abort' ? '确定要终止当前对局吗？本局进度将作废。'
                  : confirmState.kind === 'leave' ? '你是房主。选择「仅退出」将自动转让房主给其他玩家；选择「解散房间」将关闭房间并踢出所有人。'
                  : '确定要解散房间吗？所有成员将被移出。'
          }
          confirmLabel={
            confirmState.kind === 'kick' ? '移出'
              : confirmState.kind === 'transfer' ? '转让'
                : confirmState.kind === 'abort' ? '终止对局'
                  : confirmState.kind === 'leave' ? '仅退出'
                  : '确认解散'
          }
          secondaryLabel={
            confirmState.kind === 'leave' ? '解散房间' : undefined
          }
          onSecondary={
            confirmState.kind === 'leave' ? () => {
              void performDissolve();
              setConfirmState(null);
            } : undefined
          }
          busy={busy}
          destructive={confirmState.kind === 'abort' || confirmState.kind === 'close'}
          onConfirm={() => void runConfirmAction()}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </main>
  );
}
