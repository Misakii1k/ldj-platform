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

/** 共享聊天消息列表（P1-9）：房间大厅与对局内共用同一渲染结构与时间格式。 */
export function ChatMessageList({ messages, myPlayerId, memberNames }: ChatMessageListProps): ReactNode {
  return (
    <>
      {messages.map((message) => {
        if (message.kind === 'system') {
          return (
            <div key={message.cursor} className="game-chat-system">
              <span>{message.text}</span>
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
