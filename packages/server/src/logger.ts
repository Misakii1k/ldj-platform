import { pino, type Logger } from 'pino';

import type { ServerConfig } from './config.js';

const secretKeys = [
  'password',
  'resumeToken',
  'resume_token',
  'civilianWord',
  'undercoverWord',
  'seed',
  'snapshot',
];

export function createLogger(config: Pick<ServerConfig, 'logLevel'>): Logger {
  return pino({
    level: config.logLevel,
    redact: {
      paths: secretKeys.flatMap((key) => [key, `*.${key}`, `payload.${key}`, `*.payload.${key}`]),
      censor: '[REDACTED]',
    },
    base: { service: 'lan-party-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
