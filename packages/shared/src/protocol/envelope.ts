import { z } from 'zod';

/** 协议版本（SPEC §9.1） */
export const PROTOCOL_VERSION = 1;

/** 客户端消息类型（SPEC §9.2） */
export const CLIENT_MESSAGE_TYPES = [
  'create_room',
  'join_room',
  'resume_room',
  'leave_room',
  'room_command',
  'game_action',
  'chat_send',
  'resync',
  'room_status',
] as const;
export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

/** 服务端消息类型（SPEC §9.3） */
export const SERVER_MESSAGE_TYPES = [
  'welcome',
  'ack',
  'error',
  'room_snapshot',
  'game_state',
  'game_event',
  'chat_batch',
  'session_replaced',
  'resync_required',
] as const;
export type ServerMessageType = (typeof SERVER_MESSAGE_TYPES)[number];

/**
 * 客户端 envelope（SPEC §9.1）。
 * requestId 由客户端生成，在同一玩家会话内唯一；
 * expectedSeq 表示动作所基于的房间版本，状态依赖型命令必须携带。
 */
export const clientEnvelopeSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.enum(CLIENT_MESSAGE_TYPES),
    requestId: z.string().min(1).max(64),
    expectedSeq: z.number().int().nonnegative().optional(),
    payload: z.unknown(),
  })
  .strict();

export type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>;

export interface ServerEnvelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: ServerMessageType;
  requestId?: string;
  roomSeq?: number;
  serverNow: number;
  payload: T;
}

/** 单条 WebSocket 消息上限（SPEC §9.5） */
export const MAX_MESSAGE_BYTES = 32 * 1024;
