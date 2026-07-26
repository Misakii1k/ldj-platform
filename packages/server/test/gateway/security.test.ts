import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { applySecurityHeaders, isOriginAllowed } from '../../src/gateway/security.js';

describe('gateway security', () => {
  it('allows same-host and explicit origins', () => {
    const request = { headers: { host: '192.168.1.5:3000', origin: 'http://192.168.1.5:3000' } };
    expect(
      isOriginAllowed(request as IncomingMessage, {
        allowedOrigins: [],
        allowMissingOrigin: false,
      }),
    ).toBe(true);

    const explicit = { headers: { host: 'localhost:3000', origin: 'http://party.local:3000' } };
    expect(
      isOriginAllowed(explicit as IncomingMessage, {
        allowedOrigins: ['http://party.local:3000'],
        allowMissingOrigin: false,
      }),
    ).toBe(true);
  });

  it('rejects missing and cross-origin requests by default', () => {
    expect(
      isOriginAllowed({ headers: { host: 'localhost:3000' } } as IncomingMessage, {
        allowedOrigins: [],
        allowMissingOrigin: false,
      }),
    ).toBe(false);
    expect(
      isOriginAllowed(
        {
          headers: { host: 'localhost:3000', origin: 'https://attacker.example' },
        } as IncomingMessage,
        { allowedOrigins: [], allowMissingOrigin: false },
      ),
    ).toBe(false);
  });

  it('sets defensive response headers', () => {
    const setHeader = vi.fn();
    applySecurityHeaders({ setHeader } as unknown as ServerResponse);
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'"),
    );
  });
});
