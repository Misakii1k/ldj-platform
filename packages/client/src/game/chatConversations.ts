/**
 * 客户端聊天会话与私聊管理纯逻辑（Contract E / T10）。
 *
 * - 会话 key = 'public' 或对方 playerId
 * - 纯函数：public / peer 归类与过滤
 * - 重名玩家：显示名自动注入席位号或玩家标识后缀
 * - 每会话独立 draft、lastSeenCursor 与未读数计算
 * - send 绑定发送瞬间的 snapshot；ACK 仅安全清空原稿，不覆盖等待期间的新输入
 * - 房间/身份切换时状态重置判定
 */

import type { RoomMemberView } from '@ldj/shared';

export type ConversationId = 'public' | string;

export interface ConversationTarget {
  readonly playerId: string;
  readonly nickname: string;
  readonly displayName: string;
  readonly seat: number | null;
  readonly isOnline: boolean;
}

export interface MinimalChatMessage {
  readonly cursor: number;
  readonly fromPlayerId: string | null;
  readonly toPlayerId?: string | null;
  readonly text: string;
  readonly at: number;
  readonly kind: 'player' | 'system';
}

/**
 * 提取可私聊的目标成员列表：
 * - 属于同房成员
 * - 排除自己
 * - 排除机器人（botKind !== null）
 * - 包含断线/离线保留成员（isOnline: false）
 * - 重名成员注入席位号或玩家标识后缀以区分
 */
export function buildPeerTargets(
  members: readonly RoomMemberView[],
  myPlayerId: string | null,
): readonly ConversationTarget[] {
  const eligible = members.filter((m) => {
    if (!m.playerId || m.playerId === myPlayerId) return false;
    if (m.botKind !== null && m.botKind !== undefined) return false;
    // 排除已离开房间的成员（已过期或被踢除）
    if (m.connectionStatus === 'EXPIRED' || m.connectionStatus === 'KICKED') return false;
    return true;
  });

  const nameCounts = new Map<string, number>();
  for (const m of eligible) {
    nameCounts.set(m.nickname, (nameCounts.get(m.nickname) ?? 0) + 1);
  }

  return eligible.map((m) => {
    const isDup = (nameCounts.get(m.nickname) ?? 0) > 1;
    let displayName = m.nickname;
    if (isDup) {
      if (typeof m.seat === 'number') {
        displayName = `${m.nickname} (${m.seat}号位)`;
      } else {
        displayName = `${m.nickname} (#${m.playerId.slice(-4)})`;
      }
    }
    const isOnline = m.connectionStatus === 'CONNECTED';
    return {
      playerId: m.playerId,
      nickname: m.nickname,
      displayName,
      seat: m.seat,
      isOnline,
    };
  });
}

/**
 * 判定消息是否属于指定会话：
 * - public: 无 toPlayerId
 * - peerId: toPlayerId 存在，且双方为 myPlayerId 与 peerId
 */
export function isMessageInConversation(
  message: { readonly fromPlayerId: string | null; readonly toPlayerId?: string | null },
  conversationId: ConversationId,
  myPlayerId: string | null,
): boolean {
  if (conversationId === 'public') {
    return !message.toPlayerId;
  }
  if (!message.toPlayerId || !myPlayerId) {
    return false;
  }
  return (
    (message.fromPlayerId === myPlayerId && message.toPlayerId === conversationId) ||
    (message.fromPlayerId === conversationId && message.toPlayerId === myPlayerId)
  );
}

/**
 * 过滤出属于指定会话的消息子集
 */
export function filterMessagesByConversation<T extends { readonly fromPlayerId: string | null; readonly toPlayerId?: string | null }>(
  messages: readonly T[],
  conversationId: ConversationId,
  myPlayerId: string | null,
): readonly T[] {
  return messages.filter((m) => isMessageInConversation(m, conversationId, myPlayerId));
}

/**
 * 计算单个会话的未读数（仅计算 cursor > lastSeenCursor 且不是自己发出的消息）
 */
export function calculateUnreadCount(
  messages: readonly { readonly cursor: number; readonly fromPlayerId: string | null; readonly toPlayerId?: string | null }[],
  conversationId: ConversationId,
  myPlayerId: string | null,
  lastSeenCursor: number,
): number {
  const convMsgs = filterMessagesByConversation(messages, conversationId, myPlayerId);
  return convMsgs.filter((m) => m.cursor > lastSeenCursor && m.fromPlayerId !== myPlayerId).length;
}

/**
 * 计算全部活跃会话的未读数与未读总数
 */
export function calculateAllUnread(
  messages: readonly { readonly cursor: number; readonly fromPlayerId: string | null; readonly toPlayerId?: string | null }[],
  conversationIds: readonly ConversationId[],
  myPlayerId: string | null,
  lastSeenCursors: Readonly<Record<ConversationId, number>>,
): {
  readonly byConversation: Record<ConversationId, number>;
  readonly totalUnread: number;
} {
  const byConversation: Record<ConversationId, number> = {};
  let totalUnread = 0;
  for (const cid of conversationIds) {
    const unread = calculateUnreadCount(messages, cid, myPlayerId, lastSeenCursors[cid] ?? 0);
    byConversation[cid] = unread;
    totalUnread += unread;
  }
  return { byConversation, totalUnread };
}

/**
 * 当会话处于打开且可见状态时，更新已读游标至当前会话最新消息 cursor
 */
export function updateSeenCursor(
  messages: readonly { readonly cursor: number; readonly fromPlayerId: string | null; readonly toPlayerId?: string | null }[],
  conversationId: ConversationId,
  myPlayerId: string | null,
  currentLastSeen: number,
): number {
  const convMsgs = filterMessagesByConversation(messages, conversationId, myPlayerId);
  if (convMsgs.length === 0) return currentLastSeen;
  const maxCursor = Math.max(...convMsgs.map((m) => m.cursor));
  return Math.max(currentLastSeen, maxCursor);
}

/**
 * 发送成功 ACK 后解析最新草稿：
 * - 若草稿与当时发送的 snapshot 严格相等，清空草稿
 * - 若草稿以 snapshot 开头（用户等待 ACK 期间继续键入），保留剩余新输入，绝不误清空
 * - 其它情况返回原草稿
 */
export function resolveDraftAfterAck(
  currentDraft: string,
  sentSnapshot: string,
): string {
  if (currentDraft === sentSnapshot) {
    return '';
  }
  if (currentDraft.startsWith(sentSnapshot)) {
    return currentDraft.slice(sentSnapshot.length).trimStart();
  }
  return currentDraft;
}

/**
 * 判定是否跨房或身份改变，需要清空本地会话状态
 */
export function shouldResetChatState(
  prevRoomCode: string | null,
  currentRoomCode: string | null,
  prevPlayerId: string | null,
  currentPlayerId: string | null,
): boolean {
  if (prevRoomCode !== currentRoomCode) return true;
  if (prevPlayerId !== currentPlayerId) return true;
  return false;
}
