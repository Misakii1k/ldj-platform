import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  clientEnvelopeSchema,
  type ProtocolErrorCode,
  PROTOCOL_VERSION,
} from '@lan-party/shared';
import type { Logger } from 'pino';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import type { ServerConfig } from '../config.js';
import { openDatabase } from '../persistence/index.js';
import type { SqliteDatabase } from '../persistence/sqlite-database.js';
import { listLanAddresses, renderTerminalQr, selectPublicAddress } from './network.js';
import { FixedWindowRateLimiter, type RateLimitRule } from './rate-limit.js';
import { applySecurityHeaders, isOriginAllowed } from './security.js';
import { serveStaticFile } from './static-files.js';

export interface StartedApplication {
  readonly port: number;
  readonly publicUrl: string;
  readonly lanUrls: readonly string[];
}

export interface ServerApplication {
  start(): Promise<StartedApplication>;
  stop(): Promise<void>;
  isReady(): boolean;
}

interface CountRow {
  count: number;
}

const packageMetadata = createRequire(import.meta.url)('../../package.json') as {
  readonly version?: unknown;
};
if (typeof packageMetadata.version !== 'string') {
  throw new TypeError('Server package version is missing');
}
const SERVER_VERSION = packageMetadata.version;

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function protocolError(
  socket: WebSocket,
  requestId: string,
  code: ProtocolErrorCode,
  message: string,
  recoverable: boolean,
  details: { retryAfterMs?: number; currentSeq?: number } = {},
): void {
  socket.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'error',
      requestId,
      serverNow: Date.now(),
      payload: { code, message, recoverable, ...details },
    }),
  );
}

function rateLimitFor(type: string): { category: string; rule: RateLimitRule } | undefined {
  if (type === 'chat_send') return { category: 'chat', rule: { limit: 5, windowMs: 10_000 } };
  if (type === 'game_action') return { category: 'game', rule: { limit: 20, windowMs: 1_000 } };
  if (type === 'create_room' || type === 'join_room' || type === 'resume_room') {
    return { category: 'join', rule: { limit: 10, windowMs: 60_000 } };
  }
  return undefined;
}

function extractRequestId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return undefined;
  const requestId = value.requestId;
  return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
    ? requestId
    : undefined;
}

function decodeTextMessage(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}

export function createApplication(config: ServerConfig, logger: Logger): ServerApplication {
  let server: Server | undefined;
  let webSockets: WebSocketServer | undefined;
  let database: SqliteDatabase | undefined;
  let ready = false;
  let stopping = false;
  const startedAt = Date.now();
  const rateLimiter = new FixedWindowRateLimiter();

  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    applySecurityHeaders(response);
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (requestUrl.pathname === '/health/live') {
      writeJson(response, 200, { status: 'live' });
      return;
    }
    if (requestUrl.pathname === '/health/ready') {
      writeJson(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' });
      return;
    }
    if (requestUrl.pathname === '/diagnostics') {
      const roomCount = database?.get<CountRow>(
        "SELECT COUNT(*) AS count FROM rooms WHERE status != 'CLOSED'",
      )?.count ?? 0;
      writeJson(response, 200, {
        version: SERVER_VERSION,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        ready,
        roomCount,
        connectionCount: webSockets?.clients.size ?? 0,
      });
      return;
    }

    if (await serveStaticFile(config.clientDistDir, requestUrl.pathname, response)) return;
    writeJson(response, 404, { error: 'not_found' });
  };

  return {
    isReady: () => ready,
    async start() {
      if (server !== undefined) throw new Error('Server application has already been started');
      await mkdir(config.dataDir, { recursive: true });

      const opened = openDatabase(path.join(config.dataDir, 'platform.db'));
      database = opened.database;
      webSockets = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
      server = createServer((request, response) => {
        void requestHandler(request, response).catch((error: unknown) => {
          logger.error({ err: error, event: 'http_request_failed' }, 'HTTP request failed');
          if (!response.headersSent) applySecurityHeaders(response);
          if (!response.writableEnded) writeJson(response, 500, { error: 'internal_error' });
        });
      });

      server.on('upgrade', (request, socket, head) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');
        if (requestUrl.pathname !== '/ws' || !isOriginAllowed(request, config)) {
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        webSockets?.handleUpgrade(request, socket, head, (client) => {
          webSockets?.emit('connection', client, request);
        });
      });

      webSockets.on('connection', (socket, request) => {
        const connectionId = randomUUID();
        const remoteAddress = request.socket.remoteAddress ?? 'unknown';
        socket.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'welcome',
            serverNow: Date.now(),
            payload: {
              protocolVersion: PROTOCOL_VERSION,
              connectionId,
              serverVersion: SERVER_VERSION,
            },
          }),
        );

        socket.on('message', (raw, isBinary) => {
          if (isBinary) {
            socket.close(1003, 'Binary messages are not supported');
            return;
          }

          let value: unknown;
          try {
            value = JSON.parse(decodeTextMessage(raw)) as unknown;
          } catch {
            socket.close(1007, 'Invalid JSON');
            return;
          }

          const parsed = clientEnvelopeSchema.safeParse(value);
          if (!parsed.success) {
            const requestId = extractRequestId(value);
            if (requestId === undefined) {
              socket.close(1008, 'Invalid message');
              return;
            }
            protocolError(socket, requestId, 'INVALID_MESSAGE', '消息格式无效', false);
            return;
          }

          const limit = rateLimitFor(parsed.data.type);
          if (limit !== undefined) {
            const result = rateLimiter.check(`${remoteAddress}:${limit.category}`, limit.rule);
            if (!result.allowed) {
              protocolError(
                socket,
                parsed.data.requestId,
                'RATE_LIMITED',
                '操作过于频繁，请稍后再试',
                true,
                { retryAfterMs: result.retryAfterMs },
              );
              return;
            }
          }

          protocolError(
            socket,
            parsed.data.requestId,
            'ACTION_NOT_ALLOWED',
            '该功能将在下一里程碑启用',
            false,
          );
        });
      });

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server?.once('error', onError);
        server?.listen(config.port, config.host, () => {
          server?.off('error', onError);
          resolve();
        });
      });

      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Unexpected listen address');
      const lanUrls = listLanAddresses(address.port);
      const publicUrl = selectPublicAddress(address.port, config.publicBaseUrl, lanUrls);
      ready = true;

      logger.info(
        {
          event: 'server_started',
          port: address.port,
          publicUrl,
          lanUrls,
          migrationVersion: opened.migrations.currentVersion,
        },
        'LAN party server is ready',
      );
      logger.info({ event: 'join_qr', qr: await renderTerminalQr(publicUrl) }, 'Scan to join');
      return { port: address.port, publicUrl, lanUrls };
    },
    async stop() {
      if (stopping) return;
      stopping = true;
      ready = false;

      for (const client of webSockets?.clients ?? []) {
        client.close(1001, 'Server shutting down');
      }
      await new Promise<void>((resolve) => {
        if (webSockets === undefined) {
          resolve();
          return;
        }
        webSockets.close(() => resolve());
      });
      await new Promise<void>((resolve, reject) => {
        if (server === undefined) {
          resolve();
          return;
        }
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        server.closeIdleConnections();
      });
      database?.close();
      logger.info({ event: 'server_stopped' }, 'LAN party server stopped');
    },
  };
}
