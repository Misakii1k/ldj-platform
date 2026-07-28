import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';

function formatChatTime(at: number): string {
  const date = new Date(at);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function GameChatDrawer() {
  const { state, me, send } = useConnection();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialCursor = state.chat.at(-1)?.cursor ?? 0;
  const [lastSeenCursor, setLastSeenCursor] = useState(initialCursor);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const memberNames = useMemo(() => {
    const entries = state.room?.members.map((member) => [member.playerId, member.nickname] as const) ?? [];
    return new Map(entries);
  }, [state.room]);

  const unreadCount = open ? 0 : state.chat.filter((message) => message.cursor > lastSeenCursor).length;
  const synced = state.connState === 'synced';

  useEffect(() => {
    if (!open) return;
    const latestCursor = state.chat.at(-1)?.cursor ?? lastSeenCursor;
    setLastSeenCursor(latestCursor);
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, state.chat, lastSeenCursor]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || !synced) return;
    setBusy(true);
    setError(null);
    setDraft('');
    try {
      await send('chat_send', { text });
      inputRef.current?.focus();
    } catch (err) {
      setDraft(text);
      setError(`发送失败：${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`game-chat-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `打开对局聊天，${unreadCount} 条未读消息` : '打开对局聊天'}
        aria-expanded={open}
      >
        <span className="chat-trigger-icon" aria-hidden="true"><i /><i /><i /></span>
        <span>聊天</span>
        {unreadCount > 0 && <strong className="chat-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</strong>}
      </button>

      {open && (
        <div className="game-chat-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="game-chat-drawer" role="dialog" aria-modal="true" aria-labelledby="game-chat-title">
            <header className="game-chat-header">
              <div>
                <span className="section-kicker">TABLE TALK</span>
                <h2 id="game-chat-title">对局聊天</h2>
              </div>
              <button type="button" className="game-chat-close" onClick={() => setOpen(false)} aria-label="关闭对局聊天">×</button>
            </header>

            <div className="game-chat-notice">聊天内容全房间可见，请不要发送自己的秘密词。</div>
            <div className="game-chat-messages" ref={listRef} aria-live="polite">
              {state.chat.length === 0 ? (
                <div className="game-chat-empty"><span aria-hidden="true">···</span><strong>还没有消息</strong><p>可以先和大家打个招呼。</p></div>
              ) : state.chat.map((message) => {
                const mine = message.fromPlayerId === me?.playerId;
                if (message.kind === 'system') {
                  return <div key={message.cursor} className="game-chat-system"><span>{message.text}</span></div>;
                }
                return (
                  <article key={message.cursor} className={`game-chat-message ${mine ? 'mine' : ''}`}>
                    <div className="game-chat-meta">
                      <strong>{mine ? '我' : memberNames.get(message.fromPlayerId ?? '') ?? '玩家'}</strong>
                      <time>{formatChatTime(message.at)}</time>
                    </div>
                    <p>{message.text}</p>
                  </article>
                );
              })}
            </div>

            <form className="game-chat-compose" onSubmit={(event) => void handleSend(event)}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="发消息给这一桌…"
                maxLength={300}
                aria-label="对局聊天输入"
                disabled={!synced}
              />
              <button type="submit" disabled={!draft.trim() || busy || !synced}>{busy ? '发送中' : '发送'}</button>
            </form>
            {error && <div className="game-chat-error" role="alert">{error}</div>}
          </section>
        </div>
      )}
    </>
  );
}
