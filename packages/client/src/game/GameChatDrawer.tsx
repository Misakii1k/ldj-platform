import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { ChatMessageList } from '../shared-ui/ChatMessageList.tsx';
import { useDragPanel } from '../shared-ui/useDragPanel.ts';
import type { ConversationId } from './chatConversations.ts';
import {
  buildPeerTargets,
  calculateAllUnread,
  filterMessagesByConversation,
  resolveDraftAfterAck,
  shouldResetChatState,
  updateSeenCursor,
} from './chatConversations.ts';

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
  const [activeConversationId, setActiveConversationId] = useState<ConversationId>('public');
  const [drafts, setDrafts] = useState<Record<ConversationId, string>>({});
  const [lastSeenCursors, setLastSeenCursors] = useState<Record<ConversationId, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxUp, setMaxUp] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prevRoomRef = useRef<string | null>(null);
  const prevPlayerRef = useRef<string | null>(null);

  // 跨房或身份改变清理本地 conversation/draft/seen（Contract E）
  useEffect(() => {
    const curRoom = state.room?.roomCode ?? null;
    const curPlayer = me?.playerId ?? null;
    if (shouldResetChatState(prevRoomRef.current, curRoom, prevPlayerRef.current, curPlayer)) {
      prevRoomRef.current = curRoom;
      prevPlayerRef.current = curPlayer;
      setDrafts({});
      setLastSeenCursors({});
      setActiveConversationId('public');
      setError(null);
    }
  }, [state.room?.roomCode, me?.playerId]);

  const { onPointerDown, offsetY, dragging, reset } = useDragPanel({
    maxUp,
    snapPoints: [0, -Math.round(maxUp / 2)],
  });

  // 打开时根据视口高度计算可上拖的最大距离，并重置拖拽偏移
  useEffect(() => {
    if (!open) return;
    const vh = window.innerHeight;
    setMaxUp(Math.max(0, Math.round(vh * 0.66)));
    reset();
  }, [open, reset]);

  const memberNames = useMemo(() => {
    const entries = state.room?.members.map((member) => [member.playerId, member.nickname] as const) ?? [];
    return new Map(entries);
  }, [state.room]);

  // 提取同房真人目标列表（排除自己与机器人，重名带席位号区分）
  const peerTargets = useMemo(
    () => buildPeerTargets(state.room?.members ?? [], me?.playerId ?? null),
    [state.room?.members, me?.playerId],
  );

  const allConversationIds = useMemo<readonly ConversationId[]>(() => {
    const ids: ConversationId[] = ['public'];
    for (const t of peerTargets) {
      ids.push(t.playerId);
    }
    // 包含历史消息中虽然离房但与我有私聊的会话 key
    for (const msg of state.chat) {
      if (msg.toPlayerId) {
        const peer = msg.fromPlayerId === me?.playerId ? msg.toPlayerId : msg.fromPlayerId;
        if (peer && !ids.includes(peer)) {
          ids.push(peer);
        }
      }
    }
    return ids;
  }, [peerTargets, state.chat, me?.playerId]);

  // 当前激活会话的消息过滤（Contract E / T10）
  const activeMessages = useMemo(
    () => filterMessagesByConversation(state.chat, activeConversationId, me?.playerId ?? null),
    [state.chat, activeConversationId, me?.playerId],
  );

  // 计算全部会话未读计数
  const { byConversation, totalUnread } = useMemo(
    () => calculateAllUnread(state.chat, allConversationIds, me?.playerId ?? null, lastSeenCursors),
    [state.chat, allConversationIds, me?.playerId, lastSeenCursors],
  );

  const synced = state.connState === 'synced';
  const isSimulator = (state.game?.view as { mode?: string } | undefined)?.mode === 'simulator';
  const isWerewolf = state.game?.moduleId === 'werewolf';

  // 广播未读总计数，供狼人杀顶栏等独立入口同步徽标
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ldj:chat-unread', { detail: { unreadCount: totalUnread } }));
  }, [totalUnread]);

  // 监听外部打开聊天抽屉事件（如狼人杀顶栏聊天按钮）
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('ldj:open-chat', handleOpen);
    return () => window.removeEventListener('ldj:open-chat', handleOpen);
  }, []);

  // 标已读逻辑：仅在抽屉打开且页面可见时，更新当前激活会话的已读游标（Contract E / T10）
  useEffect(() => {
    if (!open) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    setLastSeenCursors((prev) => {
      const currentSeen = prev[activeConversationId] ?? 0;
      const nextSeen = updateSeenCursor(state.chat, activeConversationId, me?.playerId ?? null, currentSeen);
      if (nextSeen === currentSeen) return prev;
      return {
        ...prev,
        [activeConversationId]: nextSeen,
      };
    });

    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, activeConversationId, state.chat, me?.playerId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 聊天按钮拖拽位置支持与持久化
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [snapping, setSnapping] = useState(false);
  const dragMovedRef = useRef(false);

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
    setSnapping(false);
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
          setBtnPos(null);
        } else {
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

  const currentDraft = drafts[activeConversationId] ?? '';

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = currentDraft.trim();
    if (!text || busy || !synced) return;

    const targetConvId = activeConversationId;
    const sentSnapshot = text;

    // 发送前预清除原稿；若用户在发送期间继续键入，ACK 判定将保护新输入
    setDrafts((prev) => ({
      ...prev,
      [targetConvId]: resolveDraftAfterAck(prev[targetConvId] ?? '', sentSnapshot),
    }));

    setBusy(true);
    setError(null);

    try {
      const payload: { text: string; toPlayerId?: string } = { text: sentSnapshot };
      if (targetConvId !== 'public') {
        payload.toPlayerId = targetConvId;
      }
      await send('chat_send', payload);
      inputRef.current?.focus();
    } catch (err) {
      // 失败或超时：恢复原稿，绝不丢失未投递文本
      setDrafts((prev) => {
        const cur = prev[targetConvId] ?? '';
        const restored = cur ? `${sentSnapshot} ${cur}` : sentSnapshot;
        return {
          ...prev,
          [targetConvId]: restored,
        };
      });
      setError(`发送失败：${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // 模拟模式不渲染聊天
  if (isSimulator) return null;

  const currentPeer = peerTargets.find((t) => t.playerId === activeConversationId);
  const currentTargetName = currentPeer ? currentPeer.displayName : (memberNames.get(activeConversationId) ?? '私聊玩家');

  return (
    <>
      {/* 狼人杀游戏桌面由顶栏集成聊天按钮，对其他游戏保留悬浮按钮 */}
      {!isWerewolf && (
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
          aria-label={totalUnread > 0 ? `打开对局聊天，${totalUnread} 条未读消息` : '打开对局聊天'}
          aria-expanded={open}
        >
          <span className="chat-trigger-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>聊天</span>
          {totalUnread > 0 && <strong className="chat-unread-badge">{totalUnread > 99 ? '99+' : totalUnread}</strong>}
        </button>
      )}

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
                <h2 id="game-chat-title">对局交流</h2>
              </div>
              <button type="button" className="game-chat-close" onClick={() => setOpen(false)} aria-label="关闭对局聊天">×</button>
            </header>

            {/* 频道/会话选择条（全员公屏 + 真人同伴私聊） */}
            <div className="game-chat-channels" role="tablist" aria-label="聊天会话列表">
              <button
                type="button"
                role="tab"
                aria-selected={activeConversationId === 'public'}
                className={`game-chat-channel-tab ${activeConversationId === 'public' ? 'is-active' : ''}`}
                onClick={() => setActiveConversationId('public')}
              >
                <span>📢 全员公屏</span>
                {(byConversation['public'] ?? 0) > 0 && (
                  <span className="game-chat-channel-badge">{byConversation['public']}</span>
                )}
              </button>

              {peerTargets.map((target) => {
                const unread = byConversation[target.playerId] ?? 0;
                const isActive = activeConversationId === target.playerId;
                return (
                  <button
                    key={target.playerId}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`game-chat-channel-tab ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveConversationId(target.playerId)}
                  >
                    <span>💬 {target.displayName}</span>
                    {!target.isOnline && <small style={{ opacity: 0.7, fontSize: '0.65rem' }}>(离线)</small>}
                    {unread > 0 && <span className="game-chat-channel-badge">{unread}</span>}
                  </button>
                );
              })}
            </div>

            {/* 提示条（区分公聊全员警示与私聊加密提示，紧凑极简） */}
            <div className="game-chat-notice">
              {activeConversationId === 'public'
                ? '📢 公屏全房可见，请勿泄露底牌'
                : `🔒 与【${currentTargetName}】私聊中（仅双方可见）`}
            </div>

            <div className="game-chat-messages" ref={listRef} aria-live="polite">
              {activeMessages.length === 0 ? (
                <div className="game-chat-empty">
                  <span aria-hidden="true">···</span>
                  <strong>暂无消息记录</strong>
                  <p>{activeConversationId === 'public' ? '发一条消息，与大家打个招呼吧。' : `发一条私聊，与【${currentTargetName}】交换情报。`}</p>
                </div>
              ) : (
                <ChatMessageList messages={activeMessages} myPlayerId={me?.playerId ?? null} memberNames={memberNames} />
              )}
            </div>

            <form className="game-chat-compose" onSubmit={(event) => void handleSend(event)}>
              <input
                ref={inputRef}
                value={currentDraft}
                onChange={(event) => {
                  const val = event.target.value;
                  setDrafts((prev) => ({ ...prev, [activeConversationId]: val }));
                }}
                placeholder={activeConversationId === 'public' ? '发送消息到房间公屏…' : `私聊发送给【${currentTargetName}】…`}
                maxLength={300}
                aria-label={activeConversationId === 'public' ? '公屏聊天输入' : `私聊【${currentTargetName}】输入`}
                disabled={!synced}
              />
              <button type="submit" disabled={!currentDraft.trim() || busy || !synced}>
                {busy ? '发送中' : '发送'}
              </button>
            </form>
            {error && <div className="game-chat-error" role="alert">{error}</div>}
          </section>
        </div>
      )}
    </>
  );
}
