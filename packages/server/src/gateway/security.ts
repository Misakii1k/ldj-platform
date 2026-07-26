import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ServerConfig } from '../config.js';

export function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

export function isOriginAllowed(
  request: IncomingMessage,
  config: Pick<ServerConfig, 'allowedOrigins' | 'allowMissingOrigin'>,
): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return config.allowMissingOrigin;
  if (config.allowedOrigins.includes(origin)) return true;

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
