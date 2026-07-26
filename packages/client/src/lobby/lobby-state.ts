import type { ProtocolErrorCode, RoomSnapshotPayload, ServerMessage } from '@lan-party/shared';

import type { LobbyField, LobbyFieldErrors, LobbyForm, LobbyMode } from './envelopes';

export interface PendingRequest {
  requestId: string;
  kind: 'create' | 'join' | 'resume';
  roomCode?: string;
}

export interface LobbyState {
  mode: LobbyMode;
  form: LobbyForm;
  fieldErrors: LobbyFieldErrors;
  pending: PendingRequest | undefined;
  notice: { tone: 'info' | 'error' | 'success'; text: string } | undefined;
  room: RoomSnapshotPayload | undefined;
  roomSeq: number;
  synchronized: boolean;
  resyncPending: boolean;
}

export type LobbyAction =
  | { type: 'mode_changed'; mode: LobbyMode }
  | { type: 'field_changed'; field: LobbyField | 'role'; value: string }
  | { type: 'validation_failed'; errors: LobbyFieldErrors }
  | { type: 'request_started'; request: PendingRequest }
  | { type: 'request_send_failed' }
  | { type: 'resync_started' }
  | { type: 'resync_send_failed' }
  | { type: 'server_message'; message: ServerMessage }
  | { type: 'connection_lost' };

export const initialLobbyState: LobbyState = {
  mode: 'create',
  form: { nickname: '', roomCode: '', password: '', role: 'player' },
  fieldErrors: {},
  pending: undefined,
  notice: undefined,
  room: undefined,
  roomSeq: 0,
  synchronized: false,
  resyncPending: false,
};

export type SnapshotDisposition = 'accept' | 'stale' | 'gap';

export function getSnapshotDisposition(state: LobbyState, incomingSeq: number): SnapshotDisposition {
  if (state.room === undefined) return 'accept';
  if (incomingSeq < state.roomSeq) return 'stale';
  if (state.pending?.kind === 'resume' || state.resyncPending) return 'accept';
  if (incomingSeq > state.roomSeq + 1) return 'gap';
  return 'accept';
}

const errorMessages: Record<ProtocolErrorCode, string> = {
  INVALID_MESSAGE: '请求格式未被服务器接受，请检查输入后再试。',
  UNSUPPORTED_PROTOCOL: '网页与主机版本不兼容，请刷新页面。',
  ROOM_NOT_FOUND: '没有找到这个房间，请核对房间码。',
  ROOM_CLOSED: '这个房间已经关闭。',
  ROOM_FULL: '房间已经坐满了。',
  INVALID_PASSWORD: '房间密码不正确。',
  NICKNAME_TAKEN: '这个昵称已经有人使用。',
  NOT_AUTHORIZED: '你没有执行此操作的权限。',
  INVALID_RESUME_TOKEN: '恢复凭证无效，请重新加入房间。',
  RESERVATION_EXPIRED: '席位保留已过期，请重新加入房间。',
  SESSION_REPLACED: '该席位已在另一台设备上接管。',
  STALE_CLIENT_STATE: '本页状态已落后，正在等待重新同步。',
  ACTION_NOT_ALLOWED: '主机尚未开放此房间功能，请稍后再试。',
  RATE_LIMITED: '操作太频繁了，请稍后再试。',
  RECOVERY_IN_PROGRESS: '主机正在恢复对局，请稍后再试。',
  PERSISTENCE_FAILED: '主机暂时无法保存操作，请使用同一请求重试。',
  INTERNAL_ERROR: '主机遇到问题，请联系房主检查服务。',
};

function fieldForError(code: ProtocolErrorCode): LobbyField | undefined {
  if (code === 'INVALID_PASSWORD') return 'password';
  if (code === 'NICKNAME_TAKEN') return 'nickname';
  if (code === 'ROOM_NOT_FOUND') return 'roomCode';
  return undefined;
}

export function lobbyReducer(state: LobbyState, action: LobbyAction): LobbyState {
  switch (action.type) {
    case 'mode_changed':
      return {
        ...state,
        mode: action.mode,
        fieldErrors: {},
        notice: undefined,
      };
    case 'field_changed': {
      const value = action.field === 'roomCode' ? action.value.toUpperCase() : action.value;
      return {
        ...state,
        form: { ...state.form, [action.field]: value },
        fieldErrors: { ...state.fieldErrors, [action.field]: undefined },
        notice: state.notice?.tone === 'error' ? undefined : state.notice,
      };
    }
    case 'validation_failed':
      return { ...state, fieldErrors: action.errors, notice: undefined };
    case 'request_started':
      return {
        ...state,
        pending: action.request,
        fieldErrors: {},
        synchronized: false,
        notice: { tone: 'info', text: '请求已发送，正在等待主机确认…' },
      };
    case 'request_send_failed':
      return {
        ...state,
        pending: undefined,
        notice: { tone: 'error', text: '连接尚未就绪，请等待重连后再试。' },
      };
    case 'resync_started':
      return {
        ...state,
        resyncPending: true,
        synchronized: false,
        notice: { tone: 'info', text: '检测到状态断档，正在请求完整同步…' },
      };
    case 'resync_send_failed':
      return {
        ...state,
        resyncPending: false,
        synchronized: false,
        notice: { tone: 'error', text: '完整同步请求发送失败，将在重连后重试。' },
      };
    case 'connection_lost':
      return {
        ...state,
        pending: undefined,
        resyncPending: false,
        synchronized: false,
        notice:
          state.room === undefined
            ? state.notice
            : { tone: 'info', text: '连接已中断，重新连接后将自动恢复席位。' },
      };
    case 'server_message': {
      const message = action.message;
      if (message.type === 'error' && message.requestId === state.pending?.requestId) {
        const field = fieldForError(message.payload.code);
        const resumeExpired =
          state.pending.kind === 'resume' &&
          (message.payload.code === 'INVALID_RESUME_TOKEN' ||
            message.payload.code === 'RESERVATION_EXPIRED');
        return {
          ...state,
          pending: undefined,
          synchronized: false,
          room: resumeExpired ? undefined : state.room,
          fieldErrors: field === undefined ? {} : { [field]: errorMessages[message.payload.code] },
          notice:
            field === undefined
              ? { tone: 'error', text: errorMessages[message.payload.code] }
              : undefined,
        };
      }
      if (message.type === 'ack' && message.requestId === state.pending?.requestId) {
        return {
          ...state,
          notice: { tone: 'info', text: '主机已接受请求，正在等待房间状态同步…' },
        };
      }
      if (message.type === 'room_snapshot') {
        const disposition = getSnapshotDisposition(state, message.roomSeq);
        if (disposition === 'stale') return state;
        if (disposition === 'gap') {
          return {
            ...state,
            synchronized: false,
            notice: { tone: 'info', text: '检测到状态断档，正在请求完整同步…' },
          };
        }
        return {
          ...state,
          pending: undefined,
          room: message.payload,
          roomSeq: message.roomSeq,
          synchronized: true,
          resyncPending: false,
          notice: { tone: 'success', text: '房间状态已同步。' },
        };
      }
      if (message.type === 'resync_required') {
        return {
          ...state,
          synchronized: false,
          notice: { tone: 'info', text: '房间状态有更新，正在等待重新同步…' },
        };
      }
      if (message.type === 'session_replaced') {
        return {
          ...state,
          pending: undefined,
          synchronized: false,
          notice: { tone: 'error', text: '该席位已在另一台设备上接管。' },
        };
      }
      return state;
    }
  }
}
