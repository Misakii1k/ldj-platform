/**
 * useConnection：访问连接层上下文（Task 1）。
 * 返回 { connState, room, game, chat, me, send, resync, ... }。
 */
import { useContext } from 'react';
import { ConnectionContext } from './ConnectionContext.tsx';
import type { ConnectionApi } from './types.ts';

export function useConnection(): ConnectionApi {
  const api = useContext(ConnectionContext);
  if (!api) {
    throw new Error('useConnection 必须在 ConnectionProvider 内使用');
  }
  return api;
}
