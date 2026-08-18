/**
 * 连接层 Provider（Task 1）：
 * 单例 WebSocket、自动重连退避、消息分发器、请求/响应配对。
 */
import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PROTOCOL_VERSION, type ServerEnvelope } from '@ldj/shared';
import { applyEnvelope, parseServerEnvelope } from './envelopeReducer.ts';
import { ServerError, type ClientError } from '../shared-ui/errors.ts';
import {
  INITIAL_CONNECTION_STATE,
  ME_STORAGE_KEY,
  isStateDependent,
  withConnState,
  type ClientMessageType,
  type ConnectionApi,
  type ConnectionSnapshot,
  type Me,
} from './types.ts';
import { isRoomStatusStale } from './staleness.ts';

const ConnectionContext = createContext<ConnectionApi | null>(null);

interface PendingRequest {
  resolve: (envelope: ServerEnvelope) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const WS_CLOSE_KICKED = 4001;
const WS_CLOSE_SESSION_REPLACED = 4002;
const WS_CLOSE_ROOM_CLOSED = 4003;
const SEND_TIMEOUT_MS = 10_000;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
/** 心跳轮询间隔：房间内周期性查询权威状态（D7-A §6 遗留修复） */
const ROOM_STATUS_POLL_MS = 15_000;

function generateRequestId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function loadMeFromStorage(): Me | null {
  try {
    const raw = localStorage.getItem(ME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    const { playerId, resumeToken, roomCode, nickname, seatRole } = parsed;
    if (typeof playerId !== 'string' || typeof resumeToken !== 'string' ||
        typeof roomCode !== 'string' || typeof nickname !== 'string' ||
        (seatRole !== 'player' && seatRole !== 'spectator')) return null;
    return { playerId, resumeToken, roomCode, nickname, seatRole };
  } catch {
    return null;
  }
}

function parseErrorToClientError(payload: unknown): ClientError {
  if (!isObject(payload)) return { code: 'UNKNOWN', message: '未知错误', recoverable: false };
  return {
    code: typeof payload.code === 'string' ? payload.code : 'UNKNOWN',
    message: typeof payload.message === 'string' ? payload.message : '未知错误',
    recoverable: typeof payload.recoverable === 'boolean' ? payload.recoverable : false,
    ...(typeof payload.retryAfterMs === 'number' ? { retryAfterMs: payload.retryAfterMs } : {}),
    ...(typeof payload.currentSeq === 'number' ? { currentSeq: payload.currentSeq } : {}),
  };
}

function gameResumeIdentity(state: ConnectionSnapshot): { sessionId: string; viewVersion: number } | null {
  const game = state.game;
  return game && game.engineContractVersion === 2 && typeof game.viewVersion === 'number'
    ? { sessionId: game.sessionId, viewVersion: game.viewVersion }
    : null;
}

const VIEWING_HOME_KEY = 'ldj:viewing_home';

function loadViewingHomeFromStorage(): boolean {
  try {
    return sessionStorage.getItem(VIEWING_HOME_KEY) === 'true';
  } catch {
    return false;
  }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionSnapshot>(INITIAL_CONNECTION_STATE);
  const [me, setMeState] = useState<Me | null>(() => loadMeFromStorage());
  const [isViewingHome, setIsViewingHomeState] = useState<boolean>(() => loadViewingHomeFromStorage());

  const socketRef = useRef<WebSocket | null>(null);
  const stateRef = useRef(state);
  const meRef = useRef(me);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const shouldReconnectRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeAttemptedRef = useRef(false);
  const resumeRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { meRef.current = me; }, [me]);

  // 持久化 me
  useEffect(() => {
    try {
      if (me) {
        localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(me));
      } else {
        localStorage.removeItem(ME_STORAGE_KEY);
      }
    } catch {
      // localStorage 不可用时忽略
    }
  }, [me]);

  // 原始发送（无请求/响应配对）
  const sendRaw = useCallback((type: ClientMessageType, payload: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const envelope: Record<string, unknown> = {
      v: PROTOCOL_VERSION,
      type,
      requestId: generateRequestId(),
      payload,
    };
    try {
      socket.send(JSON.stringify(envelope));
    } catch {
      // 忽略发送失败（连接可能已关闭）
    }
  }, []);

  // 请求/响应配对发送
  const send = useCallback(
    (type: ClientMessageType, payload: unknown): Promise<ServerEnvelope> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('未连接到服务器'));
          return;
        }
        const requestId = generateRequestId();
        const expectedSeq = isStateDependent(type) ? stateRef.current.roomSeq : undefined;
        const envelope: Record<string, unknown> = {
          v: PROTOCOL_VERSION,
          type,
          requestId,
          payload,
        };
        if (expectedSeq !== null && expectedSeq !== undefined) {
          envelope.expectedSeq = expectedSeq;
        }
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error('请求超时，请重试'));
        }, SEND_TIMEOUT_MS);
        pendingRef.current.set(requestId, { resolve, reject, timeout });
        try {
          socket.send(JSON.stringify(envelope));
        } catch (err) {
          pendingRef.current.delete(requestId);
          clearTimeout(timeout);
          reject(new Error('发送失败：' + (err as Error).message));
        }
      });
    },
    [],
  );

  // 处理收到的 envelope
  const processEnvelope = useCallback((envelope: ServerEnvelope) => {
    const result = applyEnvelope(stateRef.current, envelope);
    stateRef.current = result.state;
    setState(result.state);

    // 配对的 ack/error 解析 pending 请求
    if (envelope.type === 'ack' || envelope.type === 'error') {
      if (envelope.requestId !== undefined) {
        const pending = pendingRef.current.get(envelope.requestId);
        if (pending) {
          pendingRef.current.delete(envelope.requestId);
          clearTimeout(pending.timeout);
          if (envelope.type === 'ack') {
            pending.resolve(envelope);
          } else {
            pending.reject(new ServerError(parseErrorToClientError(envelope.payload)));
          }
        }
      }
    }

    // 执行 reducer 产出的副作用
    for (const effect of result.effects) {
      switch (effect.type) {
        case 'send_resync':
          sendRaw('resync', {
            lastSeq: stateRef.current.roomSeq,
            chatCursor: stateRef.current.chatCursor,
            game: gameResumeIdentity(stateRef.current),
          });
          break;
        case 'clear_local_session':
          setMeState(null);
          break;
      }
    }
  }, [sendRaw]);

  // 安排重连
  const scheduleReconnect = useCallback(() => {
    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  // 连接 WebSocket
  const connect = useCallback(() => {
    const proto = globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${globalThis.location.host}/ws`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socketRef.current = socket;
    resumeAttemptedRef.current = false;

    socket.onopen = () => {
      backoffRef.current = INITIAL_BACKOFF_MS;
      // welcome 会通过 onmessage 到达
    };

    socket.onmessage = (event) => {
      // 严格 envelope 校验：版本/类型/序号/时间戳不合法的一律丢弃（D3 Task 9）。
      const envelope = parseServerEnvelope(event.data as string);
      if (envelope === null) return;
      processEnvelope(envelope);
    };

    socket.onclose = (event) => {
      // 清空 pending 请求
      for (const [, pending] of pendingRef.current) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('连接已断开'));
      }
      pendingRef.current.clear();

      const code = event.code;
      let closeReason: ConnectionSnapshot['closeReason'] = null;
      let shouldReconnect = true;

      if (code === WS_CLOSE_KICKED) {
        closeReason = { code: 'kicked', message: '你已被移出房间' };
        shouldReconnect = false;
      } else if (code === WS_CLOSE_SESSION_REPLACED) {
        closeReason = { code: 'session_replaced', message: '已在其他设备登录' };
        shouldReconnect = false;
      } else if (code === WS_CLOSE_ROOM_CLOSED) {
        closeReason = { code: 'room_closed', message: '房间已关闭' };
        shouldReconnect = false;
      }

      setState(prev => {
        const nextConnState: ConnectionSnapshot['connState'] = shouldReconnect
          ? (prev.connState === 'seat_expired' ? 'seat_expired' : 'reconnecting')
          : (code === WS_CLOSE_SESSION_REPLACED ? 'seat_expired' : prev.connState);
        const next: ConnectionSnapshot = {
          ...withConnState(prev, nextConnState),
          closeReason: closeReason ?? prev.closeReason,
        };
        stateRef.current = next;
        return next;
      });

      if (shouldReconnect && shouldReconnectRef.current) {
        scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // onclose 会处理重连
    };
  }, [processEnvelope, scheduleReconnect]);

  // 用 ref 持有最新的 connect，避免循环依赖
  const connectRef = useRef(connect);
  connectRef.current = connect;

  // 初始连接
  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (resumeRecoveryTimerRef.current !== null) {
        clearTimeout(resumeRecoveryTimerRef.current);
        resumeRecoveryTimerRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onopen = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {
          // 忽略
        }
      }
    };
  }, []);

  // 自动恢复（welcome 后如有 me 则发 resume_room）
  useEffect(() => {
    if (state.connState === 'connected' && !resumeAttemptedRef.current && meRef.current) {
      resumeAttemptedRef.current = true;
      const m = meRef.current;
      void send('resume_room', {
        roomCode: m.roomCode,
        playerId: m.playerId,
        resumeToken: m.resumeToken,
        lastSeq: stateRef.current.roomSeq,
        chatCursor: stateRef.current.chatCursor,
        game: gameResumeIdentity(stateRef.current),
      }).then(
        () => {
          // resume ACK 与 room_snapshot / game_state 是独立 envelope；若广播基线因乱序/丢帧未到，
          // 或已进入对局但视角帧未到达，主动补一次权威恢复（覆盖“正在恢复房间…”与
          // “对局已开始/正在同步牌局数据…”两种停留态；重发的帧携带当前 roomSeq 可自愈陈旧丢弃）。
          if (resumeRecoveryTimerRef.current !== null) clearTimeout(resumeRecoveryTimerRef.current);
          resumeRecoveryTimerRef.current = setTimeout(() => {
            const s = stateRef.current;
            const meStillHere = meRef.current?.roomCode === m.roomCode;
            const stuck =
              s.room === null
              || (s.room !== null && s.room.status === 'IN_GAME' && s.game === null);
            if (meStillHere && stuck) {
              sendRaw('resync', {
                lastSeq: s.roomSeq,
                chatCursor: s.chatCursor,
                game: gameResumeIdentity(s),
              });
            }
            resumeRecoveryTimerRef.current = null;
          }, 1_000);
        },
        () => {
          // resume 失败：清空 me，回到连接页
          setMeState(null);
        },
      );
    }
  }, [state.connState, send]);

  // 心跳：周期性查询权威房间状态（D7-A §6 遗留修复）。
  // 覆盖「浏览器停在 LOBBY/POST_GAME 但房间实际已 IN_GAME」的静默丢广播停留态：
  // 心跳返回权威状态后，本地非 IN_GAME 而权威 IN_GAME → 主动补一次权威恢复。
  useEffect(() => {
    if (state.connState !== 'connected' || meRef.current === null) return;
    const roomCode = meRef.current.roomCode;
    const timer = setInterval(() => {
      void send('room_status', {})
        .then((envelope) => {
          const s = stateRef.current;
          if (meRef.current?.roomCode !== roomCode) return; // 房间已切换，丢弃
          const payload = (envelope.payload ?? {}) as { roomCode?: string; status?: string };
          if (payload.roomCode !== roomCode) return;
          if (s.room !== null && isRoomStatusStale(s.room.status, payload.status ?? '')) {
            const next = withConnState(s, 'server_recovering');
            stateRef.current = next;
            setState(next);
            sendRaw('resync', {
              lastSeq: s.roomSeq,
              chatCursor: s.chatCursor,
              game: gameResumeIdentity(s),
            });
          }
        })
        .catch(() => {
          // 心跳失败静默（断线/超时由既有重连路径处理）
        });
    }, ROOM_STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [state.connState, send, sendRaw]);

  // 手动 resync
  const resync = useCallback(() => {
    setState(prev => {
      const next: ConnectionSnapshot = withConnState(prev, 'server_recovering');
      stateRef.current = next;
      return next;
    });
    sendRaw('resync', {
      lastSeq: stateRef.current.roomSeq,
      chatCursor: stateRef.current.chatCursor,
      game: gameResumeIdentity(stateRef.current),
    });
  }, [sendRaw]);

  const setViewingHome = useCallback((viewing: boolean) => {
    setIsViewingHomeState(viewing);
    try {
      if (viewing) {
        sessionStorage.setItem(VIEWING_HOME_KEY, 'true');
      } else {
        sessionStorage.removeItem(VIEWING_HOME_KEY);
      }
    } catch {
      // 忽略
    }
  }, []);

  const setMe = useCallback((newMe: Me) => {
    setMeState(newMe);
    setIsViewingHomeState(false);
    try {
      sessionStorage.removeItem(VIEWING_HOME_KEY);
    } catch {
      // 忽略
    }
  }, []);

  const clearMe = useCallback(() => {
    setMeState(null);
    setIsViewingHomeState(false);
    try {
      sessionStorage.removeItem(VIEWING_HOME_KEY);
    } catch {
      // 忽略
    }
  }, []);

  // 重置：清空状态回到连接页
  const reset = useCallback(() => {
    setMeState(null);
    setIsViewingHomeState(false);
    try {
      sessionStorage.removeItem(VIEWING_HOME_KEY);
    } catch {
      // 忽略
    }
    shouldReconnectRef.current = true;
    const socket = socketRef.current;
    const isOpen = socket !== null && socket.readyState === WebSocket.OPEN;
    if (isOpen) {
      const next: ConnectionSnapshot = {
        ...INITIAL_CONNECTION_STATE,
        connState: 'connected',
        serverVersion: stateRef.current.serverVersion,
        connectionId: stateRef.current.connectionId,
      };
      stateRef.current = next;
      setState(next);
    } else {
      const next: ConnectionSnapshot = {
        ...INITIAL_CONNECTION_STATE,
        connState: 'connecting',
      };
      stateRef.current = next;
      setState(next);
      backoffRef.current = INITIAL_BACKOFF_MS;
      connect();
    }
  }, [connect]);

  const api: ConnectionApi = {
    state,
    me,
    isViewingHome,
    setViewingHome,
    send,
    resync,
    setMe,
    clearMe,
    reset,
  };

  return (
    <ConnectionContext.Provider value={api}>
      {children}
    </ConnectionContext.Provider>
  );
}

export { ConnectionContext };
