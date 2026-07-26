export * from './client.js';
export * from './errors.js';
export * from './server.js';

export interface ClientEnvelope<T = unknown> {
  v: 1;
  type: string;
  requestId: string;
  expectedSeq?: number;
  payload: T;
}

export interface ServerEnvelope<T = unknown> {
  v: 1;
  type: string;
  requestId?: string;
  roomSeq?: number;
  serverNow: number;
  payload: T;
}

export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 32 * 1024;
