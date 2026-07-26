import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe LAN defaults', () => {
    const config = loadConfig({});
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3000);
    expect(config.allowMissingOrigin).toBe(false);
    expect(config.roomRetentionHours).toBe(24);
    expect(config.chatRetentionDays).toBe(7);
    expect(config.eventRetentionDays).toBe(30);
  });

  it('parses explicit origins and numeric settings', () => {
    const config = loadConfig({
      PORT: '4321',
      ALLOWED_ORIGINS: 'http://192.168.1.2:4321, http://party.local:4321',
      ALLOW_MISSING_ORIGIN: '1',
      ROOM_RETENTION_HOURS: '0',
    });
    expect(config.port).toBe(4321);
    expect(config.allowedOrigins).toEqual([
      'http://192.168.1.2:4321',
      'http://party.local:4321',
    ]);
    expect(config.allowMissingOrigin).toBe(true);
    expect(config.roomRetentionHours).toBe(0);
  });

  it('rejects invalid ports and URLs', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
    expect(() => loadConfig({ PUBLIC_BASE_URL: 'not-a-url' })).toThrow();
  });
});
