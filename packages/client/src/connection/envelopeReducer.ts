/**
 * 纯函数 reducer：处理收到的 server envelope（Task 1）。
 * 不执行副作用，只返回新状态 + 副作用提示；由 Provider 解释执行。
 */
import type {
  ChatMessageView,
  RoomSnapshotView,
  ServerEnvelope,
} from '@ldj/shared';
import type {
  ConnectionSnapshot,
  ReducerResult,
  ReducerSideEffect,
} from './types.ts';
import {
  INITIAL_CONNECTION_STATE,
} from './types.ts';
import {
  parseGameStatePayload,
} from '../game/types.ts';

// —— payload 形状的最小校验（不引入 zod） ——

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseWelcomePayload(p: unknown): {
  protocolVersion: number;
  connectionId: string;
  serverVersion: string;
  llmAvailable: boolean;
} | null {
  if (!isObject(p)) return null;
  const { protocolVersion, connectionId, serverVersion, llmAvailable } = p;
  if (typeof protocolVersion !== 'number') return null;
  if (typeof connectionId !== 'string') return null;
  if (typeof serverVersion !== 'string') return null;
  // 能力位缺失（旧服务端）按"未启用"处理，不因此丢掉整个 welcome
  return { protocolVersion, connectionId, serverVersion, llmAvailable: llmAvailable === true };
}

function parseRoomSnapshot(p: unknown): RoomSnapshotView | null {
  if (!isObject(p)) return null;
  const { roomCode, status, seq, gameId, config, members } = p;
  if (typeof roomCode !== 'string') return null;
  if (typeof status !== 'string') return null;
  if (typeof seq !== 'number') return null;
  if (gameId !== null && typeof gameId !== 'string') return null;
  if (!Array.isArray(members)) return null;
  // 不过度校验 members 内部结构，信任服务端白名单构造
  return {
    roomCode,
    status: status as RoomSnapshotView['status'],
    seq,
    gameId: gameId as string | null,
    config,
    members: members as RoomSnapshotView['members'],
  };
}

function parseChatBatch(p: unknown): ChatMessageView[] | null {
  if (!isObject(p)) return null;
  const { messages } = p;
  if (!Array.isArray(messages)) return null;
  return messages as ChatMessageView[];
}

function parseErrorPayload(p: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
  currentSeq?: number;
} | null {
  if (!isObject(p)) return null;
  const { code, message, recoverable, retryAfterMs, currentSeq } = p;
  if (typeof code !== 'string' || typeof message !== 'string' || typeof recoverable !== 'boolean') return null;
  return {
    code,
    message,
    recoverable,
    ...(typeof retryAfterMs === 'number' ? { retryAfterMs } : {}),
    ...(typeof currentSeq === 'number' ? { currentSeq } : {}),
  };
}

/** 合并聊天消息（按 cursor 去重，按 cursor 排序） */
function mergeChat(existing: ChatMessageView[], incoming: ChatMessageView[]): {
  messages: ChatMessageView[];
  cursor: number | null;
} {
  const seen = new Set(existing.map((m) => m.cursor));
  const merged = [...existing];
  for (const m of incoming) {
    if (typeof m.cursor !== 'number') continue;
    if (seen.has(m.cursor)) continue;
    seen.add(m.cursor);
    merged.push(m);
  }
  merged.sort((a, b) => a.cursor - b.cursor);
  const cursor = merged.length > 0 ? merged[merged.length - 1]!.cursor : null;
  return { messages: merged, cursor };
}

/** 处理带 roomSeq 的 envelope：更新 seq，检测 gap */
function applyRoomSeq(
  state: ConnectionSnapshot,
  envelope: ServerEnvelope,
  effects: ReducerSideEffect[],
): ConnectionSnapshot {
  if (envelope.roomSeq === undefined) return state;
  const incoming = envelope.roomSeq;
  if (state.roomSeq === null) {
    return { ...state, roomSeq: incoming };
  }
  // gap 检测：incoming > roomSeq + 1 表示有遗漏
  if (incoming > state.roomSeq + 1) {
    effects.push({ type: 'send_resync' });
  }
  // 始终取较大值（room_snapshot 等权威更新可能跳号）
  if (incoming > state.roomSeq) {
    return { ...state, roomSeq: incoming };
  }
  return state;
}

/**
 * 主 reducer：处理一个 server envelope，返回新状态 + 副作用列表。
 * 纯函数，便于单元测试。
 */
export function applyEnvelope(
  state: ConnectionSnapshot,
  envelope: ServerEnvelope,
): ReducerResult {
  const effects: ReducerSideEffect[] = [];

  switch (envelope.type) {
    case 'welcome': {
      const payload = parseWelcomePayload(envelope.payload);
      if (!payload) return { state, effects };
      return {
        state: {
          ...state,
          connState: state.connState === 'reconnecting' ? 'connected' : 'connected',
          serverVersion: payload.serverVersion,
          connectionId: payload.connectionId,
          llmAvailable: payload.llmAvailable,
          // 重连后清空旧 closeReason
          closeReason: null,
        },
        effects,
      };
    }

    case 'ack': {
      // ack 不改变连接状态；roomSeq 更新由 applyRoomSeq 处理
      const next = applyRoomSeq(state, envelope, effects);
      return { state: next, effects };
    }

    case 'error': {
      const payload = parseErrorPayload(envelope.payload);
      if (!payload) return { state, effects };
      const lastError = {
        ...(envelope.requestId !== undefined ? { requestId: envelope.requestId } : {}),
        code: payload.code,
        message: payload.message,
        recoverable: payload.recoverable,
        ...(payload.retryAfterMs !== undefined ? { retryAfterMs: payload.retryAfterMs } : {}),
        ...(payload.currentSeq !== undefined ? { currentSeq: payload.currentSeq } : {}),
      };
      let nextState = { ...state, lastError };
      // STALE_CLIENT_STATE → 自动 resync（§9.4）
      if (payload.code === 'STALE_CLIENT_STATE') {
        nextState = { ...nextState, connState: 'server_recovering' };
        effects.push({ type: 'send_resync' });
        if (payload.currentSeq !== undefined) {
          nextState = { ...nextState, roomSeq: payload.currentSeq };
        }
      }
      return { state: nextState, effects };
    }

    case 'room_snapshot': {
      const payload = parseRoomSnapshot(envelope.payload);
      if (!payload) return { state, effects };
      const nextState: ConnectionSnapshot = {
        ...state,
        room: payload,
        // room_snapshot 是权威更新；roomSeq 来自 envelope 或 payload
        roomSeq: envelope.roomSeq ?? payload.seq,
        connState: state.connState === 'server_recovering' || state.connState === 'reconnecting'
          ? 'synced'
          : 'synced',
        closeReason: null,
      };
      // 如果 envelope.roomSeq 与 payload.seq 不一致，检测 gap
      if (envelope.roomSeq !== undefined && envelope.roomSeq > (state.roomSeq ?? -1) + 1) {
        effects.push({ type: 'send_resync' });
      }
      return { state: nextState, effects };
    }

    case 'chat_batch': {
      const payload = parseChatBatch(envelope.payload);
      if (!payload) return { state, effects };
      const { messages, cursor } = mergeChat(state.chat, payload);
      return {
        state: { ...state, chat: messages, chatCursor: cursor ?? state.chatCursor },
        effects,
      };
    }

    case 'game_state': {
      const payload = parseGameStatePayload(envelope.payload);
      if (!payload) return { state, effects };
      return {
        state: {
          ...state,
          game: payload,
        },
        effects,
      };
    }

    case 'game_event': {
      return { state: applyRoomSeq(state, envelope, effects), effects };
    }

    case 'session_replaced': {
      const payload = parseErrorPayload(envelope.payload);
      effects.push({ type: 'clear_local_session' });
      return {
        state: {
          ...state,
          connState: 'seat_expired',
          closeReason: { code: 'session_replaced', message: payload?.message ?? '已在其他设备登录' },
          lastError: payload
            ? {
                code: payload.code,
                message: payload.message,
                recoverable: payload.recoverable,
                ...(payload.retryAfterMs !== undefined ? { retryAfterMs: payload.retryAfterMs } : {}),
              }
            : state.lastError,
        },
        effects,
      };
    }

    case 'resync_required': {
      // 服务端要求客户端重同步
      let nextState = { ...state, connState: 'server_recovering' as const };
      effects.push({ type: 'send_resync' });
      const payload = parseErrorPayload(envelope.payload);
      if (payload?.currentSeq !== undefined) {
        nextState = { ...nextState, roomSeq: payload.currentSeq };
      }
      return { state: nextState, effects };
    }

    default:
      return { state, effects };
  }
}

/** 用于单元测试的辅助函数：从初始状态应用多个 envelope */
export function applyEnvelopes(envelopes: ServerEnvelope[]): ConnectionSnapshot {
  let state: ConnectionSnapshot = INITIAL_CONNECTION_STATE;
  for (const env of envelopes) {
    const result = applyEnvelope(state, env);
    state = result.state;
  }
  return state;
}
