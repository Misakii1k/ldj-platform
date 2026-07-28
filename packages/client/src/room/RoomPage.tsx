/**
 * 房间页（Task 2）：成员列表、房间码展示、聊天区、房主操作栏。
 * 同步未完成（connState !== 'synced'）时禁用会改变状态的按钮，但聊天草稿保留。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { describeError } from '../shared-ui/errors.ts';
import {
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  type RoomMemberView,
  type RoomSnapshotView,
} from '@ldj/shared';

function statusText(status: string): string {
  switch (status) {
    case 'LOBBY': return '等待开始';
    case 'IN_GAME': return '对局中';
    case 'POST_GAME': return '已结束';
    case 'CLOSED': return '已关闭';
    default: return status;
  }
}

function memberStatusBadge(m: RoomMemberView): { label: string; cls: string } {
  switch (m.connectionStatus) {
    case 'CONNECTED': return { label: '在线', cls: 'online' };
    case 'DISCONNECTED_RESERVED': return { label: '断线保留', cls: 'reserved' };
    case 'EXPIRED': return { label: '已过期', cls: 'expired' };
    case 'KICKED': return { label: '已踢出', cls: 'kicked' };
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

  const synced = state.connState === 'synced';
  const isHost = me !== null && room !== null && room.members.some(
    (m) => m.playerId === me.playerId && m.isHost,
  );
  const myPlayerId = me?.playerId ?? null;

  const onlinePlayers = room?.members.filter(
    (m) => m.seatRole === 'player' && m.connectionStatus === 'CONNECTED',
  ) ?? [];
  const canStart =
    room?.status === 'LOBBY' &&
    onlinePlayers.length >= MIN_PLAYERS_TO_START &&
    onlinePlayers.length <= MAX_PLAYERS;

  // 聊天滚动到底
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length]);

  async function doRoomCommand(payload: unknown, label: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', payload);
    } catch (err) {
      setActionError(`${label}失败：${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleStartGame() {
    void doRoomCommand({ command: 'start_game' }, '开始游戏');
  }

  function handleKick(playerId: string) {
    if (!confirm('确定要移出该玩家吗？')) return;
    void doRoomCommand({ command: 'kick_player', targetPlayerId: playerId }, '踢人');
  }

  function handleTransfer(playerId: string) {
    if (!confirm('确定要把房主转让给该玩家吗？')) return;
    void doRoomCommand({ command: 'transfer_host', targetPlayerId: playerId }, '转让房主');
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

  if (room === null) {
    return (
      <main className="room-page">
        <div className="loading">正在加载房间信息…</div>
      </main>
    );
  }

  const sortedMembers = [...room.members].sort((a, b) => {
    if (a.seatRole !== b.seatRole) return a.seatRole === 'player' ? -1 : 1;
    return (a.seat ?? 999) - (b.seat ?? 999);
  });

  return (
    <main className="room-page">
      <header className="room-header">
        <div className="room-code-box">
          <span className="room-code-label">房间码</span>
          <span className="room-code">{room.roomCode}</span>
          <button
            type="button"
            className="copy-btn"
            aria-label="复制房间码"
            onClick={() => {
              void navigator.clipboard?.writeText(room.roomCode);
              showToast('房间码已复制', 'success');
            }}
          >
            复制
          </button>
        </div>
        <div className="room-status">{statusText(room.status)}</div>
      </header>

      {actionError && <div className="error-banner" role="alert">{actionError}</div>}

      <section className="members-section">
        <h2>
          成员（{onlinePlayers.length}/{MAX_PLAYERS}）
          {room.members.some((m) => m.connectionStatus !== 'CONNECTED' && m.connectionStatus !== 'KICKED') && (
            <span className="members-hint">（含断线保留）</span>
          )}
        </h2>
        <ul className="members-list">
          {sortedMembers.map((m) => {
            const badge = memberStatusBadge(m);
            const isMe = m.playerId === myPlayerId;
            return (
              <li key={m.playerId} className={`member ${badge.cls}`}>
                <span className="member-seat">
                  {m.seatRole === 'player' ? `#${m.seat ?? '?'}` : '观'}
                </span>
                <span className="member-name">
                  {m.nickname}
                  {m.isHost && <span className="host-icon" title="房主">★</span>}
                  {isMe && <span className="me-tag">（我）</span>}
                </span>
                <span className={`member-status ${badge.cls}`}>{badge.label}</span>
                {isHost && m.playerId !== myPlayerId && m.connectionStatus === 'CONNECTED' && (
                  <span className="member-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      aria-label={`踢出玩家 ${m.nickname}`}
                      onClick={() => handleKick(m.playerId)}
                      disabled={busy || !synced || room.status === 'CLOSED'}
                    >
                      踢出
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      aria-label={`转让房主给 ${m.nickname}`}
                      onClick={() => handleTransfer(m.playerId)}
                      disabled={busy || !synced || room.status === 'CLOSED'}
                    >
                      转让房主
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="chat-section">
        <h2>聊天</h2>
        <div className="chat-box" ref={chatBoxRef}>
          {state.chat.length === 0 ? (
            <div className="chat-empty">还没有消息</div>
          ) : (
            state.chat.map((msg: ChatLine) => (
              <div key={msg.cursor} className={`chat-line ${msg.kind}`}>
                <span className="chat-time">{formatTime(msg.at)}</span>
                {msg.kind === 'system' ? (
                  <span className="chat-system">{msg.text}</span>
                ) : (
                  <span className="chat-text">
                    <b>{msg.fromPlayerId === myPlayerId ? '我' : room.members.find((mm) => mm.playerId === msg.fromPlayerId)?.nickname ?? '未知'}</b>
                    ：{msg.text}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <form className="chat-input-row" onSubmit={handleSendChat}>
          <input
            ref={chatInputRef}
            type="text"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value.slice(0, 300))}
            placeholder={synced ? '输入消息…' : '同步中…暂不能发送'}
            maxLength={300}
            disabled={!synced}
            aria-label="聊天输入"
          />
          <button type="submit" aria-label="发送消息" disabled={!synced || !chatDraft.trim() || busy}>
            发送
          </button>
        </form>
      </section>

      {room.status === 'POST_GAME' && isHost && (
        <button
          type="button"
          className="primary-btn"
          onClick={handleReturnToLobby}
          disabled={busy || !synced}
        >
          返回大厅
        </button>
      )}

      <section className="action-bar">
        <button
          type="button"
          className="leave-btn"
          onClick={handleLeaveRoom}
          disabled={busy}
        >
          离开房间
        </button>
        {isHost && room.status === 'LOBBY' && (
          <button
            type="button"
            className="primary-btn"
            onClick={handleStartGame}
            disabled={busy || !synced || !canStart}
            title={!canStart ? `需要 ${MIN_PLAYERS_TO_START}-${MAX_PLAYERS} 名在线玩家` : ''}
          >
            开始游戏
          </button>
        )}
        {isHost && room.status === 'IN_GAME' && (
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (confirm('确定要终止本局吗？')) {
                void doRoomCommand({ command: 'abort_game' }, '终止对局');
              }
            }}
            disabled={busy || !synced}
          >
            终止对局
          </button>
        )}
        {isHost && !confirmClose && room.status !== 'CLOSED' && (
          <button
            type="button"
            className="danger-btn"
            onClick={() => setConfirmClose(true)}
            disabled={busy || !synced}
          >
            关闭房间
          </button>
        )}
        {confirmClose && (
          <div className="confirm-row">
            <span>确认关闭？</span>
            <button type="button" className="danger-btn" onClick={handleCloseRoom} disabled={busy}>
              确认关闭
            </button>
            <button type="button" onClick={() => setConfirmClose(false)} disabled={busy}>
              取消
            </button>
          </div>
        )}
      </section>

      {state.connState === 'server_recovering' && (
        <div className="status-banner recovering">正在重新同步房间状态…</div>
      )}
      {state.connState === 'reconnecting' && (
        <div className="status-banner reconnecting">连接断开，正在重连…</div>
      )}
    </main>
  );
}
