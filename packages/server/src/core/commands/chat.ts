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
  to_player_id: string | null;
  text: string;
  created_at: number;
}

function toView(row: ChatRow): ChatMessageView {
  return {
    cursor: row.id,
    kind: row.kind as 'player' | 'system',
    fromPlayerId: row.from_player_id,
    ...(row.to_player_id ? { toPlayerId: row.to_player_id } : {}),
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
  toPlayerId?: string,
): ChatMessageView {
  const { db, now } = tx;
  const parsed = chatTextSchema.safeParse(rawText);
  if (!parsed.success) {
    throw new CommandError('INVALID_MESSAGE', '消息长度需为 1–300 字符');
  }

  // 发言者必须是房间内活跃成员
  const member = db
    .prepare('SELECT connection_status, is_bot FROM room_members WHERE room_id = ? AND player_id = ?')
    .get(roomId, fromPlayerId) as { connection_status: string; is_bot: number } | undefined;
  if (!member || member.connection_status === 'KICKED' || member.connection_status === 'EXPIRED') {
    throw new CommandError('NOT_AUTHORIZED', '不在该房间中');
  }

  if (toPlayerId !== undefined) {
    const recipient = db.prepare('SELECT connection_status, is_bot FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(roomId, toPlayerId) as { connection_status: string; is_bot: number } | undefined;
    if (member.is_bot || toPlayerId === fromPlayerId || !recipient || recipient.is_bot || ['KICKED', 'EXPIRED'].includes(recipient.connection_status)) {
      throw new CommandError('NOT_AUTHORIZED', '只能私聊本房间内的其他真人玩家');
    }
  }

  const info = db
    .prepare(
      `INSERT INTO chat_messages (room_id, session_id, from_player_id, kind, text, created_at, to_player_id)
       VALUES (?, NULL, ?, 'player', ?, ?, ?)`,
    )
    .run(roomId, fromPlayerId, parsed.data, now, toPlayerId ?? null);
  return {
    cursor: Number(info.lastInsertRowid),
    kind: 'player',
    fromPlayerId,
    ...(toPlayerId ? { toPlayerId } : {}),
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
export function canReadChat(message: ChatMessageView, viewerId: string | null): boolean {
  return !message.toPlayerId || (viewerId !== null && (message.fromPlayerId === viewerId || message.toPlayerId === viewerId));
}

/** Filter before LIMIT so unrelated private traffic cannot starve public resync. */
export function listChatAfter(db: Db, roomId: string, cursor: number | null, viewerId: string | null = null): ChatMessageView[] {
  const rows = db.prepare(`SELECT id, kind, from_player_id, to_player_id, text, created_at FROM chat_messages
    WHERE room_id = ? AND (to_player_id IS NULL OR from_player_id = ? OR to_player_id = ?)
    ${cursor === null ? '' : 'AND id > ?'} ORDER BY id ${cursor === null ? 'DESC' : 'ASC'} LIMIT ?`).all(
      roomId, viewerId, viewerId, ...(cursor === null ? [] : [cursor]), CHAT_BATCH_LIMIT,
    ) as unknown as ChatRow[];
  return (cursor === null ? rows.reverse() : rows).map(toView);
}
