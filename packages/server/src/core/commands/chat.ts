/**
 * 聊天命令（FR-CHAT-001~005、§9.1）：
 * chat_send 落库 + 独立游标（chat_messages.id），不推动 roomSeq；
 * listChatAfter 供 resync / 重连补发（单批 ≤100，FR-CHAT-004）。
 */
import type { ChatMessageView } from '@ldj/shared';
import { chatTextSchema } from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import type { TxContext } from '../executor.ts';
import { CommandError } from '../executor.ts';

export const CHAT_BATCH_LIMIT = 100;

interface ChatRow {
  id: number;
  kind: string;
  from_player_id: string | null;
  text: string;
  created_at: number;
}

function toView(row: ChatRow): ChatMessageView {
  return {
    cursor: row.id,
    kind: row.kind as 'player' | 'system',
    fromPlayerId: row.from_player_id,
    text: row.text,
    at: row.created_at,
  };
}

/** 玩家发言：文本规范化校验（1–300）；kind 恒为 player（FR-CHAT-005 服务端控制） */
export function applyChatSend(
  tx: TxContext,
  roomId: string,
  fromPlayerId: string,
  rawText: string,
): ChatMessageView {
  const { db, now } = tx;
  const parsed = chatTextSchema.safeParse(rawText);
  if (!parsed.success) {
    throw new CommandError('INVALID_MESSAGE', '消息长度需为 1–300 字符');
  }

  // 发言者必须是房间内活跃成员
  const member = db
    .prepare('SELECT connection_status FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, fromPlayerId) as { connection_status: string } | undefined;
  if (!member || member.connection_status === 'KICKED' || member.connection_status === 'EXPIRED') {
    throw new CommandError('NOT_AUTHORIZED', '不在该房间中');
  }

  const info = db
    .prepare(
      `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at)
       VALUES (?, NULL, ?, 'player', ?, ?)`,
    )
    .run(roomId, fromPlayerId, parsed.data, now);
  return {
    cursor: Number(info.lastInsertRowid),
    kind: 'player',
    fromPlayerId,
    text: parsed.data,
    at: now,
  };
}

/** 系统消息（加入/离开/被踢等提示，FR-CHAT-005）：事务内调用 */
export function insertSystemChat(tx: TxContext, roomId: string, text: string): ChatMessageView {
  const info = tx.db
    .prepare(
      `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at)
       VALUES (?, NULL, NULL, 'system', ?, ?)`,
    )
    .run(roomId, text, tx.now);
  return { cursor: Number(info.lastInsertRowid), kind: 'system', fromPlayerId: null, text, at: tx.now };
}

/** 游标之后的消息（补发用，FR-CHAT-004）；cursor 为 null 取最近一批 */
export function listChatAfter(db: Db, roomId: string, cursor: number | null): ChatMessageView[] {
  if (cursor === null) {
    // 无游标：取最近 CHAT_BATCH_LIMIT 条，按游标升序返回
    const rows = db
      .prepare(
        `SELECT id, kind, from_player_id, text, created_at FROM chat_messages
         WHERE room_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(roomId, CHAT_BATCH_LIMIT) as unknown as ChatRow[];
    return rows.reverse().map(toView);
  }
  const rows = db
    .prepare(
      `SELECT id, kind, from_player_id, text, created_at FROM chat_messages
       WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(roomId, cursor, CHAT_BATCH_LIMIT) as unknown as ChatRow[];
  return rows.map(toView);
}
