import { describe, expect, it } from 'vitest';

import { createWebSocketUrl, getConnectionPresentation } from './connection-state';

describe('connection presentation', () => {
  it('describes states with text instead of relying on colour', () => {
    expect(getConnectionPresentation('connected')).toMatchObject({
      label: '已连接',
      tone: 'success',
    });
    expect(getConnectionPresentation('server_recovering').detail).toContain('暂不可操作');
  });

  it('uses a secure socket when the page is secure', () => {
    expect(createWebSocketUrl({ host: 'party.local:8080', protocol: 'https:' })).toBe(
      'wss://party.local:8080/ws',
    );
  });
});
