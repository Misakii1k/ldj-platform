import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { ChatMessageList } from '../shared-ui/ChatMessageList.tsx';
import { useDragPanel } from '../shared-ui/useDragPanel.ts';

/** 悬浮聊天按钮尺寸回退值（CSS min-width/min-height，运行时以 getBoundingClientRect 实测为准） */
const CHAT_BTN_FALLBACK_SIZE = { width: 94, height: 48 };
/** 拖拽/贴边时按钮与视口边缘的最小间距 */
const CHAT_BTN_EDGE_MARGIN = 8;
const CHAT_BTN_BOTTOM_AVOIDANCE = 84;

/** 贴边吸附：水平方向吸附到最近的左/右边缘，垂直方向避开顶部及底部关键操作区。 */
function snapChatBtn(pos: { x: number; y: number }, size: { width: number; height: number }): { x: number; y: number } {
  const centerX = pos.x + size.width / 2;
  const x = centerX < window.innerWidth / 2
    ? CHAT_BTN_EDGE_MARGIN
    : window.innerWidth - size.width - CHAT_BTN_EDGE_MARGIN;
  const maxY = window.innerHeight - size.height - CHAT_BTN_BOTTOM_AVOIDANCE;
  const y = Math.max(CHAT_BTN_EDGE_MARGIN, Math.min(Math.max(CHAT_BTN_EDGE_MARGIN, maxY), pos.y));
  return { x, y };
}

export function GameChatDrawer() {
  const { state, me, send } = useConnection();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastChat = state.chat[state.chat.length - 1];
  const initialCursor = lastChat?.cursor ?? 0;
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

  const unreadCount = open ? 0 : state.chat.filter((message) => message.cursor > lastSeenCursor).length;
  const synced = state.connState === 'synced';

  // 广播未读计数，供内嵌聊天入口同步状态
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ldj:chat-unread', { detail: { unreadCount } }));
  }, [unreadCount]);

  // 监听外部打开聊天抽屉事件（如狼人杀底栏常驻聊天胶囊）
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('ldj:open-chat', handleOpen);
    return () => window.removeEventListener('ldj:open-chat', handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const latestCursor = state.chat[state.chat.length - 1]?.cursor ?? lastSeenCursor;
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

  // 聊天按钮拖拽位置支持与持久化（松手自动吸附贴边）
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [snapping, setSnapping] = useState(false);
  const dragMovedRef = useRef(false);
  const isWerewolf = state.game?.moduleId === 'werewolf';

  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('ldj_chat_btn_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // 处于狼人杀等侧翼席位桌面时，清空行内拖拽坐标，确保悬浮聊天按钮规整停靠在右下角安全区，绝不覆盖席位
  useEffect(() => {
    if (isWerewolf && btnPos !== null) {
      setBtnPos(null);
    }
  }, [isWerewolf, btnPos]);

  const btnDragRef = useRef<{
    startX: number;
    startY: number;
    initLeft: number;
    initTop: number;
    lastX: number;
    lastY: number;
    hasDragged: boolean;
  } | null>(null);

  useEffect(() => {
    const clampSavedPos = () => {
      if (isWerewolf) {
        setBtnPos(null);
        return;
      }
      setBtnPos((prev) => {
        if (!prev) return prev;
        const rect = triggerRef.current?.getBoundingClientRect();
        const size = rect ? { width: rect.width, height: rect.height } : CHAT_BTN_FALLBACK_SIZE;
        // 视口变化（旋转/缩放）后同样按贴边规则归位
        const next = snapChatBtn(prev, size);
        if (next.x === prev.x && next.y === prev.y) return prev;
        try {
          localStorage.setItem('ldj_chat_btn_pos', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    };
    clampSavedPos();
    window.addEventListener('resize', clampSavedPos);
    window.addEventListener('orientationchange', clampSavedPos);
    return () => {
      window.removeEventListener('resize', clampSavedPos);
      window.removeEventListener('orientationchange', clampSavedPos);
    };
  }, [isWerewolf]);

  const handleBtnPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    setSnapping(false); // 重新拖拽时关闭吸附过渡，保证跟手
    dragMovedRef.current = false;
    btnDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initLeft: rect.left,
      initTop: rect.top,
      lastX: rect.left,
      lastY: rect.top,
      hasDragged: false,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!btnDragRef.current) return;
      const dx = moveEvent.clientX - btnDragRef.current.startX;
      const dy = moveEvent.clientY - btnDragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        btnDragRef.current.hasDragged = true;
        dragMovedRef.current = true;
      }
      if (btnDragRef.current.hasDragged) {
        const nextX = Math.max(CHAT_BTN_EDGE_MARGIN, Math.min(window.innerWidth - rect.width - CHAT_BTN_EDGE_MARGIN, btnDragRef.current.initLeft + dx));
        const nextY = Math.max(CHAT_BTN_EDGE_MARGIN, Math.min(window.innerHeight - rect.height - CHAT_BTN_EDGE_MARGIN, btnDragRef.current.initTop + dy));
        btnDragRef.current.lastX = nextX;
        btnDragRef.current.lastY = nextY;
        setBtnPos({ x: nextX, y: nextY });
      }
    };

    const handlePointerUp = () => {
      const drag = btnDragRef.current;
      if (drag?.hasDragged) {
        if (isWerewolf) {
          // 狼人杀桌面松手自动复位到底部右侧安全停靠区
          setBtnPos(null);
        } else {
          // 松手自动吸附贴边：水平吸到最近左/右边缘，垂直留在夹取位置并持久化
          const snapped = snapChatBtn({ x: drag.lastX, y: drag.lastY }, { width: rect.width, height: rect.height });
          setBtnPos(snapped);
          setSnapping(true);
          try {
            localStorage.setItem('ldj_chat_btn_pos', JSON.stringify(snapped));
          } catch {
            // ignore
          }
        }
      }
      btnDragRef.current = null;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  };

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

  // 模拟模式不渲染聊天；此判断置于全部 hooks 之后，遵守 Rules of Hooks
  if (isSimulator) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`game-chat-trigger ${snapping ? 'is-snapping' : ''} ${open ? 'is-open' : ''}`}
        onPointerDown={handleBtnPointerDown}
        onClick={() => {
          if (!dragMovedRef.current) setOpen(true);
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'left' || event.propertyName === 'top') setSnapping(false);
        }}
        style={btnPos ? { left: `${btnPos.x}px`, top: `${btnPos.y}px`, right: 'auto', bottom: 'auto', transform: 'none', touchAction: 'none' } : { touchAction: 'none' }}
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

            <div className="game-chat-notice">提示：聊天内容房间全员可见，请勿泄露自己的私密身份或词条！</div>
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
