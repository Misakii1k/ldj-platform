/**
 * HTTP 入口（FR-BOOT-003）：健康检查 + 静态文件托管 + 基本安全响应头（SEC-006）。
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { PublicRoomSummary } from '../core/snapshot.ts';
import type { LlmConfig } from '../config.ts';
import { THINKING_DEPTH_OPTIONS, type ThinkingDepth } from '@ldj/shared';
import { SettingsError, type LlmSettingsView, type LlmSettingsPatch } from '../core/settings.ts';
import {
  LlmConnectionTestError,
  testLlmConnection,
  type LlmConnectionTestInput,
} from '../core/llmConnectionTest.ts';
import { fetchLlmModels, LlmModelCatalogError } from '../core/llmModelCatalog.ts';
import { normalizeLlmBaseUrl } from '../core/llmBaseUrl.ts';
import { DEFAULT_RULES, RateLimiter } from './rateLimit.ts';
import { isOriginAllowed } from './ws.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>局域网桌游平台</title></head>
<body style="font-family:system-ui;margin:2rem;text-align:center">
<h1>局域网桌游平台</h1>
<p>服务端已运行（M1 骨架）。客户端界面将在后续里程碑提供。</p>
</body></html>`;

export interface HttpDeps {
  /** readiness：数据库未就绪时必须失败（FR-BOOT-003） */
  isReady: () => boolean;
  /** Open LAN rooms are supplied by the application layer, not the HTTP gateway. */
  listOpenRooms: () => readonly PublicRoomSummary[];
  /** 前端构建产物目录；不存在时返回占位页 */
  staticDir?: string;
  /** 读取大模型设置；不含密钥原文（只回 hasApiKey） */
  readLlmSettings?: () => LlmSettingsView;
  /** 读取服务端当前生效配置，仅供模型目录代理复用密钥，不会写入响应。 */
  readLlmConfig?: () => Pick<LlmConfig, 'provider' | 'baseUrl' | 'apiKey' | 'model' | 'thinkingDepth' | 'timeoutMs'>;
  /**
   * 写入大模型设置；抛 SettingsError 表示入参非法（映射 400）。
   * app 层在这里同时更新 LlmProvider，所以写完立即生效。
   */
  writeLlmSettings?: (patch: LlmSettingsPatch) => LlmSettingsView;
  /**
   * 远程写入口令。设了就必须在 x-admin-token 头里带上；
   * 没设时只放行本机请求 —— 见 isLocalAddress 的注释。
   */
  adminToken?: string | null;
  allowedOrigins?: string[];
  allowPrivateLlmUpstream?: boolean;
  getNetworkStatus?: () => unknown;
}

/** 请求体上限：设置对象很小，1 KiB 足够，超了直接拒绝而不是攒内存 */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * 是否来自本机。
 *
 * 为什么要这道关：PUT /api/settings/llm 能写 API 密钥，而局域网里谁都能访问这个端口。
 * 默认只让开服务器那台机器改（房主本来就在那台机器上启动服务），
 * 想在手机上改就设 ADMIN_TOKEN，请求带上口令。
 */
export function isLocalAddress(addr: string | undefined): boolean {
  if (addr === undefined) return false;
  // Node 对 IPv4-mapped IPv6 会给出 ::ffff:127.0.0.1 形式
  const bare = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return bare === '127.0.0.1' || bare === '::1' || bare.startsWith('127.');
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Continue draining without retaining bytes. Destroying the request here also
        // destroys its socket, preventing the intended 413 response from reaching the client.
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw === '') {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': MIME['.json']!, 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function requireJsonContentType(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const contentType = req.headers['content-type'];
  if (typeof contentType === 'string' && contentType.split(';', 1)[0]!.trim().toLowerCase() === 'application/json') return true;
  sendJson(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE', message: '请求体必须使用 application/json' });
  return false;
}

function createRequestAbortSignal(res: http.ServerResponse): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', abort);
  return {
    signal: controller.signal,
    dispose: () => res.off('close', abort),
  };
}

function isThinkingDepth(value: string): value is ThinkingDepth {
  return THINKING_DEPTH_OPTIONS.some((option) => option.value === value);
}

function authorizeSettingsWrite(
  req: http.IncomingMessage,
  deps: HttpDeps,
): { status: number; message: string } | null {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin === '' ? undefined : origin, req.headers.host, deps.allowedOrigins ?? [])) {
    return { status: 403, message: '请求来源不被允许' };
  }
  const token = deps.adminToken ?? null;
  if (token !== null) {
    return req.headers['x-admin-token'] === token
      ? null
      : { status: 403, message: '管理口令不正确' };
  }
  return isLocalAddress(req.socket.remoteAddress)
    ? null
    : {
        status: 403,
        message: '只有服务器本机能改设置；要在手机上改，请给服务端设置 ADMIN_TOKEN 环境变量',
      };
}

export function parseLlmSettingsPatch(body: unknown): LlmSettingsPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SettingsError('请求体需为 JSON 对象');
  }
  const src = body as Record<string, unknown>;
  const known = new Set([
    'provider',
    'baseUrl',
    'apiKey',
    'model',
    'thinkingDepth',
    'timeoutMs',
    'profilesJson',
    'activeProfileId',
  ]);
  for (const key of Object.keys(src)) {
    if (!known.has(key)) throw new SettingsError(`未知设置项：${key}`);
  }
  const patch: LlmSettingsPatch = {};
  if ('provider' in src) {
    if (src.provider !== 'openai' && src.provider !== 'anthropic') throw new SettingsError('provider 需为 openai 或 anthropic');
    patch.provider = src.provider;
  }
  if ('baseUrl' in src) {
    const v = src.baseUrl;
    if (v !== null && typeof v !== 'string') throw new SettingsError('baseUrl 需为字符串或 null');
    patch.baseUrl = v;
  }
  if ('apiKey' in src) {
    const v = src.apiKey;
    if (v !== null && typeof v !== 'string') throw new SettingsError('apiKey 需为字符串或 null');
    patch.apiKey = v;
  }
  if ('model' in src) {
    if (typeof src.model !== 'string') throw new SettingsError('model 需为字符串');
    patch.model = src.model;
  }
  if ('thinkingDepth' in src) {
    if (typeof src.thinkingDepth !== 'string' || !isThinkingDepth(src.thinkingDepth)) {
      throw new SettingsError('thinkingDepth invalid');
    }
    patch.thinkingDepth = src.thinkingDepth;
  }
  if ('timeoutMs' in src) {
    if (typeof src.timeoutMs !== 'number') throw new SettingsError('timeoutMs 需为数字');
    patch.timeoutMs = src.timeoutMs;
  }
  if ('profilesJson' in src) {
    if (src.profilesJson !== null && typeof src.profilesJson !== 'string') throw new SettingsError('profilesJson 需为字符串或 null');
    patch.profilesJson = src.profilesJson;
  }
  if ('activeProfileId' in src) {
    if (src.activeProfileId !== null && typeof src.activeProfileId !== 'string') throw new SettingsError('activeProfileId 需为字符串或 null');
    patch.activeProfileId = src.activeProfileId;
  }
  return patch;
}

function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:",
  );
  res.setHeader('Referrer-Policy', 'no-referrer');
}

/**
 * API 跨源放行（APP 场景）：Capacitor WebView 源为 http://localhost，
 * 从 APP 内 fetch 局域网主机 IP 属跨源。仅对回环来源（本机 APP/开发服务器）
 * 反射 Origin；局域网其他设备经同源页面访问，无需 CORS；未知来源不放行。
 */
function applyApiCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (origin === undefined) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return;
  }
  const hostname = parsed.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-admin-token');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function createHttpServer(deps: HttpDeps): http.Server {
  const staticRoot = deps.staticDir ? resolve(deps.staticDir) : null;
  // 设置写接口每 IP 限流（SPEC §9.5）；/health/* 与读接口不限
  const settingsWriteLimiter = new RateLimiter(DEFAULT_RULES.settingsWrite);
  // 定期清理过期窗口，防止长驻服务器（APP 内嵌主机）内存无限增长
  const limiterSweeper = setInterval(() => settingsWriteLimiter.sweep(), 60_000);
  limiterSweeper.unref?.();

  const rateLimitSettingsWrite = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    const key = `ip:${req.socket.remoteAddress ?? 'unknown'}`;
    const result = settingsWriteLimiter.tryAcquire(key);
    if (result.ok) return true;
    sendJson(res, 429, {
      error: 'RATE_LIMITED',
      message: '设置操作过于频繁，请稍后再试',
      retryAfterMs: result.retryAfterMs,
    });
    return false;
  };

  return http.createServer((req, res) => {
    setSecurityHeaders(res);
    const url = (req.url ?? '/').split('?')[0]!;

    if (url.startsWith('/api/')) {
      applyApiCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    if (url === '/health/live') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url === '/health/ready') {
      const ready = deps.isReady();
      res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: ready ? 'ok' : 'not_ready' }));
      return;
    }

    if (url === '/api/network/ping') {
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      return;
    }

    if (url === '/api/network/status') {
      const getStatus = deps.getNetworkStatus;
      const data = getStatus ? getStatus() : { status: 'ok' };
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(data));
      return;
    }

    if (url === '/api/settings/llm/test') {
      const read = deps.readLlmConfig;
      if (read === undefined) {
        sendJson(res, 404, { error: 'NOT_AVAILABLE', message: '设置接口未启用' });
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }
      if (!rateLimitSettingsWrite(req, res)) return;
      const authorizationError = authorizeSettingsWrite(req, deps);
      if (authorizationError !== null) {
        sendJson(res, authorizationError.status, { error: 'FORBIDDEN', message: authorizationError.message });
        return;
      }
      if (!requireJsonContentType(req, res)) return;

      void (async () => {
        const requestAbort = createRequestAbortSignal(res);
        try {
          const rawBody = await readJsonBody(req);
          if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
            throw new LlmConnectionTestError('INVALID_CONFIG', '诊断配置无效');
          }
          const body = rawBody as Record<string, unknown>;
          const known = new Set(['provider', 'baseUrl', 'apiKey', 'model', 'thinkingDepth', 'timeoutMs']);
          if (Object.keys(body).some((key) => !known.has(key))) {
            throw new LlmConnectionTestError('INVALID_CONFIG', '诊断配置无效');
          }
          const current = read();
          const provider = (body.provider ?? current.provider) as LlmConnectionTestInput['provider'];
          const baseUrl = (body.baseUrl ?? current.baseUrl ?? '') as string;
          const hasApiKeyOverride = Object.prototype.hasOwnProperty.call(body, 'apiKey');
          let normalizedBaseUrl = '';
          let normalizedCurrentBaseUrl = '';
          try {
            if (typeof baseUrl === 'string' && baseUrl.trim() !== '') normalizedBaseUrl = normalizeLlmBaseUrl(baseUrl);
            if (current.baseUrl !== null) normalizedCurrentBaseUrl = normalizeLlmBaseUrl(current.baseUrl);
          } catch {
            throw new LlmConnectionTestError('INVALID_CONFIG', '诊断配置无效');
          }
          const canReuseSavedApiKey = !hasApiKeyOverride
            && provider === current.provider
            && normalizedBaseUrl === normalizedCurrentBaseUrl;
          const input: LlmConnectionTestInput = {
            provider,
            baseUrl,
            apiKey: hasApiKeyOverride ? body.apiKey as string | null : canReuseSavedApiKey ? current.apiKey : null,
            model: (body.model ?? current.model) as string,
            thinkingDepth: (body.thinkingDepth ?? current.thinkingDepth) as LlmConnectionTestInput['thinkingDepth'],
            timeoutMs: (body.timeoutMs ?? current.timeoutMs) as number,
          };
          const result = await testLlmConnection(input, requestAbort.signal, {
            allowPrivateNetwork: deps.allowPrivateLlmUpstream,
          });
          if (!requestAbort.signal.aborted) {
            sendJson(res, 200, {
              status: 'ok',
              ...result,
              usedSavedApiKey: canReuseSavedApiKey && current.apiKey !== null,
            });
          }
        } catch (error) {
          const message = (error as Error).message;
          if (message === 'BODY_TOO_LARGE') {
            sendJson(res, 413, { error: 'BODY_TOO_LARGE', message: '请求体过大' });
          } else if (message === 'INVALID_JSON') {
            sendJson(res, 400, { error: 'INVALID_JSON', message: '请求体不是合法 JSON' });
          } else if (error instanceof LlmConnectionTestError) {
            sendJson(res, error.code === 'INVALID_CONFIG' ? 400 : 502, {
              error: error.code,
              message: error.message,
            });
          } else if (!requestAbort.signal.aborted) {
            sendJson(res, 502, { error: 'UPSTREAM_UNAVAILABLE', message: '暂时无法连接上游服务' });
          }
        } finally {
          requestAbort.dispose();
        }
      })();
      return;
    }

    if (url === '/api/settings/llm/models') {
      const read = deps.readLlmSettings;
      if (read === undefined) {
        sendJson(res, 404, { error: 'NOT_AVAILABLE', message: '设置接口未启用' });
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }
      if (!rateLimitSettingsWrite(req, res)) return;
      const authorizationError = authorizeSettingsWrite(req, deps);
      if (authorizationError !== null) {
        sendJson(res, authorizationError.status, { error: 'FORBIDDEN', message: authorizationError.message });
        return;
      }
      if (!requireJsonContentType(req, res)) return;

      void (async () => {
        const requestAbort = createRequestAbortSignal(res);
        try {
          const rawBody = await readJsonBody(req);
          if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
            throw new SettingsError('请求体需为 JSON 对象');
          }
          const reqBody = rawBody as Record<string, unknown>;
          const activeSettings = read();
          const activeConfig = deps.readLlmConfig?.();
          const provider = reqBody.provider === undefined
            ? activeConfig?.provider ?? activeSettings.provider ?? 'openai'
            : reqBody.provider;
          if (provider !== 'openai' && provider !== 'anthropic') {
            throw new SettingsError('provider 需为 openai 或 anthropic');
          }
          const baseUrl = reqBody.baseUrl === undefined
            ? activeConfig?.baseUrl ?? activeSettings.baseUrl ?? ''
            : reqBody.baseUrl;
          if (typeof baseUrl !== 'string') throw new SettingsError('baseUrl 需为字符串');
          let normalizedBaseUrl = '';
          let normalizedActiveBaseUrl = '';
          try {
            if (baseUrl.trim() !== '') normalizedBaseUrl = normalizeLlmBaseUrl(baseUrl);
            if (activeConfig?.baseUrl) normalizedActiveBaseUrl = normalizeLlmBaseUrl(activeConfig.baseUrl);
          } catch {
            throw new SettingsError('baseUrl 不是合法的安全 URL');
          }
          const hasApiKeyOverride = Object.prototype.hasOwnProperty.call(reqBody, 'apiKey');
          const canReuseSavedApiKey = !hasApiKeyOverride
            && provider === activeConfig?.provider
            && normalizedBaseUrl === normalizedActiveBaseUrl;
          const apiKey = hasApiKeyOverride
            ? reqBody.apiKey
            : canReuseSavedApiKey ? activeConfig?.apiKey ?? null : null;
          if (apiKey !== null && typeof apiKey !== 'string') {
            throw new SettingsError('apiKey 需为字符串或 null');
          }
          const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() || null : null;

          if (!normalizedBaseUrl) {
            sendJson(res, 400, { error: 'INVALID_SETTINGS', message: '请先填写接口 Base URL' });
            return;
          }
          const models = await fetchLlmModels({
            provider,
            baseUrl: normalizedBaseUrl,
            apiKey: normalizedApiKey,
          }, requestAbort.signal, {
            allowPrivateNetwork: deps.allowPrivateLlmUpstream,
          });
          if (!requestAbort.signal.aborted) sendJson(res, 200, { models, source: 'remote' });
        } catch (err) {
          if (err instanceof SettingsError) {
            sendJson(res, 400, { error: 'INVALID_SETTINGS', message: err.message });
          } else if ((err as Error).message === 'BODY_TOO_LARGE') {
            sendJson(res, 413, { error: 'BODY_TOO_LARGE', message: '请求体过大' });
          } else if ((err as Error).message === 'INVALID_JSON') {
            sendJson(res, 400, { error: 'INVALID_JSON', message: '请求体不是合法 JSON' });
          } else if (err instanceof LlmModelCatalogError) {
            sendJson(res, err.code === 'INVALID_CONFIG' ? 400 : 502, {
              error: err.code,
              message: err.message,
            });
          } else if (!requestAbort.signal.aborted) {
            sendJson(res, 502, { error: 'UPSTREAM_UNAVAILABLE', message: '暂时无法连接上游模型目录' });
          }
        } finally {
          requestAbort.dispose();
        }
      })();
      return;
    }

    // 大模型设置：GET 读（不含密钥原文）、PUT 写。
    // 放在 405 关卡之前，否则 PUT 进不来。
    if (url === '/api/settings/llm') {
      // 捕成局部 const：异步闭包里 deps.x 的类型收窄会丢
      const read = deps.readLlmSettings;
      const write = deps.writeLlmSettings;
      if (read === undefined || write === undefined) {
        sendJson(res, 404, { error: 'NOT_AVAILABLE', message: '设置接口未启用' });
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const body = JSON.stringify(read());
        res.writeHead(200, { 'content-type': MIME['.json']!, 'cache-control': 'no-store' });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(body);
        }
        return;
      }

      if (req.method === 'PUT') {
        if (!rateLimitSettingsWrite(req, res)) return;
        // 写入鉴权：设了口令就验口令，没设就只信本机（见 isLocalAddress）
        const authorizationError = authorizeSettingsWrite(req, deps);
        if (authorizationError !== null) {
          sendJson(res, authorizationError.status, { error: 'FORBIDDEN', message: authorizationError.message });
          return;
        }
        if (!requireJsonContentType(req, res)) return;
        void (async () => {
          try {
            sendJson(res, 200, write(parseLlmSettingsPatch(await readJsonBody(req))));
          } catch (err) {
            const message = (err as Error).message;
            if (message === 'BODY_TOO_LARGE') {
              sendJson(res, 413, { error: 'BODY_TOO_LARGE', message: '请求体过大' });
            } else if (message === 'INVALID_JSON') {
              sendJson(res, 400, { error: 'INVALID_JSON', message: '请求体不是合法 JSON' });
            } else if (err instanceof SettingsError) {
              sendJson(res, 400, { error: 'INVALID_SETTINGS', message });
            } else {
              sendJson(res, 500, { error: 'INTERNAL_ERROR', message: '设置写入失败' });
            }
          }
        })();
        return;
      }

      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    if (url === '/api/rooms') {
      const body = JSON.stringify({ rooms: deps.listOpenRooms() });
      res.writeHead(200, {
        'content-type': MIME['.json']!,
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(body);
      }
      return;
    }

    // 静态托管：防目录穿越
    if (staticRoot && existsSync(staticRoot)) {
      let rel: string;
      try {
        rel = url === '/' ? 'index.html' : decodeURIComponent(url.slice(1));
      } catch {
        // 畸形百分号编码（如 /%zz）会抛 URIError，绝不能让其成为未捕获异常击穿进程
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }
      const candidate = normalize(join(staticRoot, rel));
      if (candidate.startsWith(staticRoot + sep) || candidate === join(staticRoot, 'index.html')) {
        const target =
          existsSync(candidate) && statSync(candidate).isFile()
            ? candidate
            : join(staticRoot, 'index.html'); // SPA fallback
        if (existsSync(target) && statSync(target).isFile()) {
          res.writeHead(200, {
            'content-type': MIME[extname(target)] ?? 'application/octet-stream',
          });
          if (req.method === 'HEAD') {
            res.end();
          } else {
            createReadStream(target).pipe(res);
          }
          return;
        }
      }
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PLACEHOLDER_HTML);
  });
}
