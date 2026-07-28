/**
 * useSend：基于 requestId 的请求/响应配对发送（Task 1）。
 * 超时 10s；返回 send(type, payload): Promise<ServerEnvelope>。
 */
import { useCallback } from 'react';
import type { ServerEnvelope } from '@ldj/shared';
import { useConnection } from './useConnection.ts';
import type { ClientMessageType } from './types.ts';

export function useSend(): {
  send: (type: ClientMessageType, payload: unknown) => Promise<ServerEnvelope>;
} {
  const { send } = useConnection();
  const sendStable = useCallback(
    (type: ClientMessageType, payload: unknown) => send(type, payload),
    [send],
  );
  return { send: sendStable };
}
