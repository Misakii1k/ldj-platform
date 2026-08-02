/**
 * 房间页（Task 2）：成员列表、房间码展示、聊天区、房主操作栏。
 * 同步未完成（connState !== 'synced'）时禁用会改变状态的按钮，但聊天草稿保留。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { describeError } from '../shared-ui/errors.ts';
import {
  getGameCatalogEntry,
  type RoomMemberView,
  type RoomSnapshotView,
} from '@ldj/shared';
import { GameSetupPanel } from '../game/tabletop/GameSetupPanel.tsx';
import { buildModuleConfig, readRoomGameConfig, type SetupConfig } from '../game/tabletop/setupState.ts';

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

interface ChatLine {
  cursor: number;
  kind: 'player' | 'system';
  fromPlayerId: string | null;
  text: string;
  at: number;
}

function formatTime(at: number): string {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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
    <div className="status-banner auto-start-banner" role="status">
      <span className="auto-start-pulse" aria-hidden="true" />
      全员就绪 · {left} 秒后自动开局…
    </div>
  );
}

export function RoomPage() {
  const { state, me, send, clearMe } = useConnection();
  const { showToast } = useToast();
  const room: RoomSnapshotView | null = state.room;
  const [chatDraft, setChatDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const roomCommandInFlightRef = useRef(false);
  const [gameConfig, setGameConfig] = useState<SetupConfig>({});

  const synced = state.connState === 'synced';
  const isHost = me !== null && room !== null && room.members.some(
    (m) => m.playerId === me.playerId && m.isHost,
  );
  const myPlayerId = me?.playerId ?? null;

  const onlinePlayers = room?.members.filter(
    (m) => m.seatRole === 'player' && m.connectionStatus === 'CONNECTED',
  ) ?? [];

  const selectedGame = getGameCatalogEntry(room?.gameId);

  useEffect(() => {
    if (!selectedGame) return;
    setGameConfig(readRoomGameConfig(selectedGame.setup, room?.config));
  }, [room?.config, selectedGame]);

  // 聊天滚动到底
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length]);

  async function doRoomCommand(payload: unknown, label: string) {
    if (roomCommandInFlightRef.current) return;
    roomCommandInFlightRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', payload);
    } catch (err) {
      setActionError(`${label}失败：${describeError(err)}`);
    } finally {
      roomCommandInFlightRef.current = false;
      setBusy(false);
    }
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

  function handleKick(playerId: string) {
    if (!confirm('确定要移出该玩家吗？')) return;
    void doRoomCommand({ command: 'kick_player', targetPlayerId: playerId }, '踢人');
  }

  function handleTransfer(playerId: string) {
    if (!confirm('确定要把房主转让给该玩家吗？')) return;
    void doRoomCommand({ command: 'transfer_host', targetPlayerId: playerId }, '转让房主');
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

  function handleCloseRoom() {
    setConfirmClose(false);
    void doRoomCommand({ command: 'close_room' }, '关闭房间');
  }

  function handleReturnToLobby() {
    void doRoomCommand({ command: 'return_to_lobby' }, '返回大厅');
  }

  async function handleLeaveRoom() {
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
  const canStart =
    room.status === 'LOBBY' &&
    onlinePlayers.length >= minimumPlayersToStart &&
    onlinePlayers.length <= maximumPlayers &&
    notReadyCount === 0;

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
          <div className="home-brand">
            <span className="home-brand__tile" aria-hidden="true">{roomGame.displayName.slice(0, 1)}</span>
            <span>{roomGame.displayName} · 房间大厅</span>
          </div>
          <div className="home-header__actions">
            <span className="home-local-badge">局域网极速联机</span>
            <span className="room-status">{statusText(room.status)}</span>
          </div>
        </header>

        <section className="room-hero" aria-labelledby="room-title">
          <div className="room-hero__panel">
            <p className="home-hero__eyebrow room-hero__eyebrow">READY WHEN YOU ARE</p>
            <h1 id="room-title" className="room-hero__title">
              等待好友<span>入座</span>
            </h1>
            <p className="room-hero__description">
              本局游戏：{roomGame.displayName} · 适合 {minimumPlayersToStart}–{maximumPlayers} 人。将房间码分享给身边的朋友，准备就绪后即可开启本局对局。
            </p>
          </div>

          <div className="game-card game-card--sunset room-share-note room-code-card">
            <div className="game-card__meta">
              <span className="game-card__availability">ROOM CODE</span>
              <span className="game-card__players">{onlinePlayers.length}/{maximumPlayers} 在线</span>
            </div>
            <div className="room-code-card__body">
              <span className="room-code-label">房间码</span>
              <strong className="room-code">{room.roomCode}</strong>
              <button type="button" className="game-card__action room-code-card__copy" aria-label="复制房间码" onClick={() => { void navigator.clipboard?.writeText(room.roomCode); showToast('房间码已复制', 'success'); }}>
                <span>复制房间码</span><span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="game-card__ticket" aria-label="当前游戏">卧</div>
          </div>
        </section>

        {actionError && <div className="error-banner room-sheet__error" role="alert">{actionError}</div>}

        <GameSetupPanel
          setup={roomGame.setup}
          value={gameConfig}
          disabled={!isHost || busy || !synced || room.status !== 'LOBBY'}
          onChange={handleGameConfigChange}
        />

        <div className="room-content-grid">
          <section className="game-card game-card--berry room-players-panel members-section room-panel">
            <div className="room-panel__head">
              <div>
                <p className="room-panel__eyebrow">THE TABLE</p>
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
                    <span className="member-name">
                      {m.nickname}
                      {m.isHost && <span className="host-icon" title="房主">★</span>}
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
                    {isHost && m.botKind !== null && room.status === 'LOBBY' && (
                      <span className="member-actions">
                        <button type="button" className="mini-btn" aria-label={'移除 ' + m.nickname} onClick={() => handleRemoveBot(m.playerId)} disabled={busy || !synced}>移除</button>
                      </span>
                    )}
                    {isHost && m.botKind === null && m.playerId !== myPlayerId && m.connectionStatus === 'CONNECTED' && (
                      <span className="member-actions">
                        <button type="button" className="mini-btn" aria-label={'踢出玩家 ' + m.nickname} onClick={() => handleKick(m.playerId)} disabled={busy || !synced || room.status === 'CLOSED'}>踢出</button>
                        <button type="button" className="mini-btn" aria-label={'转让房主给 ' + m.nickname} onClick={() => handleTransfer(m.playerId)} disabled={busy || !synced || room.status === 'CLOSED'}>转让房主</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="game-card game-card--violet room-chat-panel chat-section room-panel">
            <div className="room-panel__head">
              <div>
                <p className="room-panel__eyebrow">SIDE CHAT</p>
                <h2 className="room-panel__title">聊天</h2>
              </div>
              <span className="room-panel__glyph" aria-hidden="true">✦</span>
            </div>
            <div className="chat-box room-chat-box" ref={chatBoxRef}>
              {state.chat.length === 0 ? <div className="chat-empty">还没有消息</div> : state.chat.map((msg: ChatLine) => (
                <div key={msg.cursor} className={'chat-line ' + msg.kind}>
                  <span className="chat-time">{formatTime(msg.at)}</span>
                  {msg.kind === 'system' ? <span className="chat-system">{msg.text}</span> : <span className="chat-text"><b>{msg.fromPlayerId === myPlayerId ? '我' : room.members.find((mm) => mm.playerId === msg.fromPlayerId)?.nickname ?? '未知'}</b>：{msg.text}</span>}
                </div>
              ))}
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
              <p className="home-hero__eyebrow room-console__eyebrow">HOST CONSOLE</p>
              <h2 id="room-actions-title" className="room-console__title">{room.status === 'LOBBY' ? '对局准备中' : '当前状态：' + statusText(room.status)}</h2>
            </div>
          </div>
          <div className="action-bar room-console__actions">
            <button type="button" className="leave-btn" onClick={handleLeaveRoom} disabled={busy}>离开房间</button>
            {room.status === 'POST_GAME' && isHost && <button type="button" className="game-card__action room-inline-btn" onClick={handleReturnToLobby} disabled={busy || !synced}>返回大厅</button>}
            {isHost && room.status === 'LOBBY' && <button type="button" className="game-card__action room-inline-btn" onClick={handleStartGame} disabled={busy || !synced || !canStart} title={!canStart ? '需要 ' + minimumPlayersToStart + '–' + maximumPlayers + ' 名在线玩家' + (notReadyCount > 0 ? '，还有 ' + notReadyCount + ' 人未准备' : '') : ''}>开始游戏</button>}
            {isHost && room.status === 'LOBBY' && roomGame.botSupport !== 'none' && <button type="button" className="game-card__action room-inline-btn" onClick={() => handleAddBot('rule')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '随机合法出牌规则机器人，适合凑人数试玩'}>添加规则机器人</button>}
            {isHost && room.status === 'LOBBY' && roomGame.botSupport === 'rule_and_llm' && state.llmAvailable && <button type="button" className="game-card__action room-inline-btn" onClick={() => handleAddBot('llm')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '由 AI 大模型智能决策，超时或异常自动降级为规则策略'}>添加 AI 大模型玩家</button>}
            {isHost && room.status === 'LOBBY' && roomGame.botSupport !== 'none' && botCount > 0 && <button type="button" className="game-card__action room-inline-btn" onClick={() => handleRemoveBot()} disabled={busy || !synced} title="移除最后加入的机器人">移除机器人（{botCount}）</button>}
            {isHost && room.status === 'IN_GAME' && <button type="button" className="danger-btn" onClick={() => { if (confirm('确定要终止本局吗？')) void doRoomCommand({ command: 'abort_game' }, '终止对局'); }} disabled={busy || !synced}>终止对局</button>}
            {isHost && !confirmClose && room.status !== 'CLOSED' && <button type="button" className="danger-btn" onClick={() => setConfirmClose(true)} disabled={busy || !synced}>解散房间</button>}
            {confirmClose && <div className="confirm-row"><span>确认解散？</span><button type="button" className="danger-btn" onClick={handleCloseRoom} disabled={busy}>确认解散</button><button type="button" onClick={() => setConfirmClose(false)} disabled={busy}>取消</button></div>}
          </div>
        </section>

        {state.connState === 'server_recovering' && <div className="status-banner recovering">正在重新同步房间状态…</div>}
        {state.connState === 'reconnecting' && <div className="status-banner reconnecting">连接断开，正在重连…</div>}
        <AutoStartBanner active={autoStartActive && synced} />
      </div>
    </main>
  );
}
