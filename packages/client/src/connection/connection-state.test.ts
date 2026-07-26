import { describe, expect, it } from 'vitest';

import {
  canRetryAfterRecoveryDelay,
  createWebSocketUrl,
  getConnectionPresentation,
  getReconnectDelay,
  shouldReconnectAfterClose,
} from './connection-state';

describe('connection presentation', () => {
  it('describes states with text instead of relying on colour', () => {
    expect(getConnectionPresentation('connected')).toMatchObject({
      label: '已连接主机',
      tone: 'success',
    });
    expect(getConnectionPresentation('server_recovering').detail).toContain('暂不可操作');
  });

  it('uses a secure socket when the page is secure', () => {
    expect(createWebSocketUrl({ host: 'party.local:8080', protocol: 'https:' })).toBe(
      'wss://party.local:8080/ws',
    );
  });

  it('uses bounded jittered exponential reconnect delays', () => {
    expect(getReconnectDelay(0, () => 0.5)).toBe(500);
    expect(getReconnectDelay(3, () => 0.5)).toBe(4_000);
    expect(getReconnectDelay(20, () => 1)).toBe(10_000);
    expect(getReconnectDelay(1, () => 0)).toBe(750);
  });

  it('treats a replaced session as terminal instead of reconnecting', () => {
    expect(shouldReconnectAfterClose(false)).toBe(true);
    expect(shouldReconnectAfterClose(true)).toBe(false);
  });

  it('re-enables a live connection after the server recovery retry delay', () => {
    expect(canRetryAfterRecoveryDelay(false, false, true, true)).toBe(true);
    expect(canRetryAfterRecoveryDelay(true, false, true, true)).toBe(false);
    expect(canRetryAfterRecoveryDelay(false, true, true, true)).toBe(false);
    expect(canRetryAfterRecoveryDelay(false, false, false, true)).toBe(false);
  });
});
