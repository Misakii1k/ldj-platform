import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const integerFromEnvironment = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : Number(value)),
    z.number().int().min(min).max(max),
  );

const booleanFromEnvironment = z.preprocess(
  (value) => value === '1' || value === 'true',
  z.boolean(),
);

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly publicBaseUrl?: string;
  readonly dataDir: string;
  readonly clientDistDir: string;
  readonly allowedOrigins: readonly string[];
  readonly allowMissingOrigin: boolean;
  readonly logLevel: (typeof logLevels)[number];
  readonly roomRetentionHours: number;
  readonly chatRetentionDays: number;
  readonly eventRetentionDays: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const publicBaseUrl = z.string().url().optional().parse(environment.PUBLIC_BASE_URL || undefined);
  const allowedOrigins = (environment.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => z.string().url().parse(origin));

  return {
    host: z.string().min(1).parse(environment.HOST ?? '0.0.0.0'),
    port: integerFromEnvironment(3000, 0, 65_535).parse(environment.PORT),
    ...(publicBaseUrl === undefined ? {} : { publicBaseUrl }),
    dataDir: path.resolve(environment.DATA_DIR ?? path.join(process.cwd(), 'data')),
    clientDistDir: path.resolve(
      environment.CLIENT_DIST_DIR ?? path.join(moduleDirectory, '../../client/dist/web'),
    ),
    allowedOrigins,
    allowMissingOrigin: booleanFromEnvironment.parse(environment.ALLOW_MISSING_ORIGIN),
    logLevel: z.enum(logLevels).parse(environment.LOG_LEVEL ?? 'info'),
    roomRetentionHours: integerFromEnvironment(24, 0, 24 * 365).parse(
      environment.ROOM_RETENTION_HOURS,
    ),
    chatRetentionDays: integerFromEnvironment(7, 0, 3650).parse(environment.CHAT_RETENTION_DAYS),
    eventRetentionDays: integerFromEnvironment(30, 0, 3650).parse(
      environment.EVENT_RETENTION_DAYS,
    ),
  };
}
