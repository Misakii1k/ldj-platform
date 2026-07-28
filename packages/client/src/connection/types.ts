/**
 * 连接层状态类型（Task 1）。
 * ConnState 状态机：
 *   connecting → connected（welcome）→ synced（room_snapshot）
 *                       ↘ reconnecting（断线重连）→ connected（welcome）
 *   任意 → seat_expired（session_replaced / close 4002）
 *   synced → server_recovering（STALE_CLIENT_STATE）→ synced（room_snapshot）
 */
import type {
  ChatMessageView,
  RoomSnapshotView,
  ServerEnvelope,
} from '@ldj/shared';
import type { GameStatePayload } from '../game/types.ts';

export type ConnState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'synced'
  | 'seat_expired'
  | 'server_recovering';

/** 当前用户身份（持久化到 localStorage 用于 resume） */
export interface Me {
  playerId: string;
  /** 创建/加入时返回；resume 不轮换，沿用旧值 */
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}

export type CloseReasonCode = 'kicked' | 'session_replaced' | 'room_closed';

export interface CloseReason {
  code: CloseReasonCode;
  message: string;
}

export interface LastError {
  requestId?: string;
  code: string;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
  currentSeq?: number;
}

/** 连接快照：reducer 管理的完整状态 */
export interface ConnectionSnapshot {
  connState: ConnState;
  serverVersion: string | null;
  connectionId: string | null;
  room: RoomSnapshotView | null;
  /** 最近一次接收到的 roomSeq（用于 expectedSeq 与 gap 检测） */
  roomSeq: number | null;
  chat: ChatMessageView[];
  /** 聊天去重游标（已见最大 cursor） */
  chatCursor: number | null;
  game: GameStatePayload | null;
  lastError: LastError | null;
  closeReason: CloseReason | null;
}

export const INITIAL_CONNECTION_STATE: ConnectionSnapshot = {
  connState: 'connecting',
  serverVersion: null,
  connectionId: null,
  room: null,
  roomSeq: null,
  chat: [],
  chatCursor: null,
  game: null,
  lastError: null,
  closeReason: null,
};

/** reducer 产出的副作用提示（保持 reducer 纯函数） */
export type ReducerSideEffect =
  | { type: 'send_resync' }
  | { type: 'clear_local_session' };

export interface ReducerResult {
  state: ConnectionSnapshot;
  effects: ReducerSideEffect[];
}

/** Provider 暴露的 API */
export interface ConnectionApi {
  state: ConnectionSnapshot;
  me: Me | null;
  send: (type: ClientMessageType, payload: unknown) => Promise<ServerEnvelope>;
  resync: () => void;
  setMe: (me: Me) => void;
  clearMe: () => void;
  reset: () => void;
}

/** 客户端可发的消息类型（与 shared CLIENT_MESSAGE_TYPES 对齐） */
export type ClientMessageType =
  | 'create_room'
  | 'join_room'
  | 'resume_room'
  | 'leave_room'
  | 'room_command'
  | 'game_action'
  | 'chat_send'
  | 'resync';

/** 状态依赖型命令：需要附带 expectedSeq */
export function isStateDependent(type: ClientMessageType): boolean {
  return type === 'room_command' || type === 'game_action';
}

/** localStorage 存储键 */
export const ME_STORAGE_KEY = 'ldj:session';
