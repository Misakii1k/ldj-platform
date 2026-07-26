import { useEffect, useState } from 'react';

import { createWebSocketUrl, type ConnectionState } from './connection-state';

const RETRY_DELAY_MS = 2_000;

export function useGatewayConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let hasConnected = false;

    const connect = (): void => {
      if (stopped) return;

      setState(hasConnected ? 'recovering' : 'connecting');
      socket = new WebSocket(createWebSocketUrl(window.location));
      socket.addEventListener('open', () => {
        hasConnected = true;
        setState('connected');
      });
      socket.addEventListener('close', () => {
        if (stopped) return;
        setState('recovering');
        retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
      });
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return state;
}
