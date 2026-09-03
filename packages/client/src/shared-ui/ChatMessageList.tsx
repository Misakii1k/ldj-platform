import type { ReactNode } from 'react';
import { formatChatTime } from './chatFormat.ts';

export interface ChatMessageViewLike {
  cursor: number;
  kind: 'player' | 'system';
  fromPlayerId: string | null;
  text: string;
  at: number;
}

interface ChatMessageListProps {
  messages: readonly ChatMessageViewLike[];
  myPlayerId: string | null;
  memberNames: ReadonlyMap<string, string>;
}

/**
 * 格式化系统消息中的内部玩家 ID（如 p_7d777f6f-0518-4f93-ad6c-f07cd955dda3 或 p0/p1），
 * 将其优雅替换为房间成员的真实昵称（如“麦田捕手”或“麦田捕手 (我)”）。
 */
export function formatSystemMessage(
  text: string,
  memberNames: ReadonlyMap<string, string>,
  myPlayerId: string | null,
): string {
  let result = text;

  // 1. 优先根据房间成员字典精准替换
  for (const [id, name] of memberNames) {
    if (!id || !name) continue;
    const isMe = id === myPlayerId;
    const humanName = isMe ? `${name} (我)` : name;

    // 替换 "玩家 <id>" 或单独的 "<id>"
    if (result.includes(`玩家 ${id}`)) {
      result = result.replaceAll(`玩家 ${id}`, humanName);
    } else if (result.includes(`玩家${id}`)) {
      result = result.replaceAll(`玩家${id}`, humanName);
    } else if (result.includes(id)) {
      result = result.replaceAll(id, humanName);
    }
  }

  // 2. 兜底替换：如果依然存在未匹配成功的机器内部 UUID 格式（如 p_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）
  // 避免将底层的机器标识暴露给终端用户
  result = result.replace(/p_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '某位玩家');

  return result;
}

/** 共享聊天消息列表（P1-9）：房间大厅与对局内共用同一渲染结构与时间格式。 */
export function ChatMessageList({ messages, myPlayerId, memberNames }: ChatMessageListProps): ReactNode {
  return (
    <>
      {messages.map((message) => {
        if (message.kind === 'system') {
          const displayText = formatSystemMessage(message.text, memberNames, myPlayerId);
          return (
            <div key={message.cursor} className="game-chat-system">
              <span>{displayText}</span>
            </div>
          );
        }
        const mine = message.fromPlayerId === myPlayerId;
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
    </>
  );
}
