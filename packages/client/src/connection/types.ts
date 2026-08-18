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
  /** connState === 'reconnecting'：断线自动重连中（D4-UI0 派生标志） */
  isRefreshing: boolean;
  /** connState === 'server_recovering'：服务端恢复对局状态中（D4-UI0 派生标志） */
  isRecovering: boolean;
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
  /**
   * 服务端是否配置了大模型接口（welcome 携带的能力位）。
   * false 时房主只能加规则机器人，"加 AI 玩家"按钮隐藏。
   */
  llmAvailable: boolean;
}

/**
 * 由 connState 纯派生标志（D4-UI0）。
 * 组件据此决定：已有 room/game 内容时保留当前视图并显示横幅，
 * 而不是用全屏 loader 替换已渲染的对局/房间。
 */
export function derivedFlags(
  connState: ConnState,
): Pick<ConnectionSnapshot, 'isRefreshing' | 'isRecovering'> {
  return {
    isRefreshing: connState === 'reconnecting',
    isRecovering: connState === 'server_recovering',
  };
}

/** 设置 connState 并同步派生标志（保持快照自洽；状态机迁移本身不变） */
export function withConnState(
  state: ConnectionSnapshot,
  connState: ConnState,
): ConnectionSnapshot {
  return { ...state, connState, ...derivedFlags(connState) };
}

export const INITIAL_CONNECTION_STATE: ConnectionSnapshot = {
  connState: 'connecting',
  isRefreshing: false,
  isRecovering: false,
  serverVersion: null,
  connectionId: null,
  room: null,
  roomSeq: null,
  chat: [],
  chatCursor: null,
  game: null,
  lastError: null,
  closeReason: null,
  llmAvailable: false,
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
  isViewingHome: boolean;
  setViewingHome: (viewing: boolean) => void;
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
  | 'resync'
  | 'room_status';

/** 状态依赖型命令：需要附带 expectedSeq */
export function isStateDependent(type: ClientMessageType): boolean {
  return type === 'room_command' || type === 'game_action';
}

/** localStorage 存储键 */
export const ME_STORAGE_KEY = 'ldj:session';
