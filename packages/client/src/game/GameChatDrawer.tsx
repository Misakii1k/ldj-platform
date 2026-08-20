import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { ChatMessageList } from '../shared-ui/ChatMessageList.tsx';
import { useDragPanel } from '../shared-ui/useDragPanel.ts';

export function GameChatDrawer() {
  const { state, me, send } = useConnection();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialCursor = state.chat.at(-1)?.cursor ?? 0;
  const [lastSeenCursor, setLastSeenCursor] = useState(initialCursor);
  const [maxUp, setMaxUp] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { onPointerDown, offsetY, dragging, reset } = useDragPanel({
    maxUp,
    // 档位：0 = 完全展开（底部弹出态），-maxUp/2 = 半折叠上拉
    snapPoints: [0, -Math.round(maxUp / 2)],
  });

  // 打开时根据视口高度计算可上拖的最大距离，并重置拖拽偏移
  useEffect(() => {
    if (!open) return;
    const vh = window.innerHeight;
    // 面板默认占视口底部约 78dvh，最多可上拉到顶部留 12dvh
    setMaxUp(Math.max(0, Math.round(vh * 0.66)));
    reset();
  }, [open, reset]);

  const memberNames = useMemo(() => {
    const entries = state.room?.members.map((member) => [member.playerId, member.nickname] as const) ?? [];
    return new Map(entries);
  }, [state.room]);

  const isSimulator = (state.game?.view as { mode?: string } | undefined)?.mode === 'simulator';
  if (isSimulator) return null;

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
          <section
            className={`game-chat-drawer ${dragging ? 'is-dragging' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-chat-title"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            <header className="game-chat-header game-chat-header--draggable" onPointerDown={onPointerDown}>
              <div>
                <h2 id="game-chat-title">对局聊天</h2>
              </div>
              <button type="button" className="game-chat-close" onClick={() => setOpen(false)} aria-label="关闭对局聊天">×</button>
            </header>

            <div className="game-chat-notice">提示：聊天内容房间全员可见，切勿暴露自己的秘密词条！</div>
            <div className="game-chat-messages" ref={listRef} aria-live="polite">
              {state.chat.length === 0 ? (
                <div className="game-chat-empty"><span aria-hidden="true">···</span><strong>暂无消息记录</strong><p>发一条消息，与这一桌好友打个招呼吧。</p></div>
              ) : (
                <ChatMessageList messages={state.chat} myPlayerId={me?.playerId ?? null} memberNames={memberNames} />
              )}
            </div>

            <form className="game-chat-compose" onSubmit={(event) => void handleSend(event)}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="发送消息到房间大厅…"
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
