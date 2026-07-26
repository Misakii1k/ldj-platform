import { serverEnvelopeSchema, type ClientMessage, type ServerMessage } from '@lan-party/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canRetryAfterRecoveryDelay,
  createWebSocketUrl,
  getReconnectDelay,
  RECOVERY_RETRY_DELAY_MS,
  shouldReconnectAfterClose,
  type ConnectionState,
} from './connection-state';

export interface ReceivedServerMessage {
  sequence: number;
  message: ServerMessage;
}

export interface GatewayConnection {
  state: ConnectionState;
  welcomed: boolean;
  latestMessage: ReceivedServerMessage | undefined;
  protocolIssue: string | undefined;
  send: (message: ClientMessage) => boolean;
}

export function useGatewayConnection(): GatewayConnection {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [welcomed, setWelcomed] = useState(false);
  const [latestMessage, setLatestMessage] = useState<ReceivedServerMessage | undefined>(undefined);
  const [protocolIssue, setProtocolIssue] = useState<string | undefined>(undefined);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const messageSequence = useRef(0);

  const send = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;
    let recoveryTimer: number | undefined;
    let stopped = false;
    let hasConnected = false;
    let reconnectAttempt = 0;
    let sessionWasReplaced = false;

    const scheduleReconnect = (): void => {
      if (stopped) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const delay = getReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    function connect(): void {
      if (stopped) return;

      setWelcomed(false);
      setState(hasConnected ? 'recovering' : 'connecting');
      sessionWasReplaced = false;
      const socket = new WebSocket(createWebSocketUrl(window.location));
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        hasConnected = true;
        setState('connected');
      });
      socket.addEventListener('message', (event) => {
        let value: unknown;
        try {
          value = JSON.parse(String(event.data)) as unknown;
        } catch {
          setProtocolIssue('主机返回了无法读取的消息。');
          return;
        }
        const parsed = serverEnvelopeSchema.safeParse(value);
        if (!parsed.success) {
          setProtocolIssue('主机返回的协议消息无效，请确认网页与主机版本一致。');
          return;
        }
        setProtocolIssue(undefined);
        if (parsed.data.type === 'welcome') {
          if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
          recoveryTimer = undefined;
          reconnectAttempt = 0;
          setWelcomed(true);
        }
        if (parsed.data.type === 'room_snapshot') setState('restored');
        if (parsed.data.type === 'session_replaced') {
          sessionWasReplaced = true;
          setWelcomed(false);
          setState('replaced');
        }
        if (parsed.data.type === 'error' && parsed.data.payload.code === 'RECOVERY_IN_PROGRESS') {
          setState('server_recovering');
          if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
          recoveryTimer = window.setTimeout(() => {
            recoveryTimer = undefined;
            if (canRetryAfterRecoveryDelay(
              stopped,
              sessionWasReplaced,
              socketRef.current === socket,
              socket.readyState === WebSocket.OPEN,
            )) {
              setState('connected');
            }
          }, RECOVERY_RETRY_DELAY_MS);
        }
        messageSequence.current += 1;
        setLatestMessage({ sequence: messageSequence.current, message: parsed.data });
      });
      socket.addEventListener('close', () => {
        if (stopped) return;
        if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
        setWelcomed(false);
        if (!shouldReconnectAfterClose(sessionWasReplaced)) {
          setState('replaced');
          return;
        }
        setState('recovering');
        scheduleReconnect();
      });
    }

    const reconnectWhenVisible = (): void => {
      if (document.visibilityState !== 'visible' || retryTimer === undefined) return;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
      connect();
    };

    document.addEventListener('visibilitychange', reconnectWhenVisible);
    connect();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', reconnectWhenVisible);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, []);

  return { state, welcomed, latestMessage, protocolIssue, send };
}
