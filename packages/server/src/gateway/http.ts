/**
 * HTTP 入口（FR-BOOT-003）：健康检查 + 静态文件托管 + 基本安全响应头（SEC-006）。
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { PublicRoomSummary } from '../core/snapshot.ts';
import { SettingsError, type LlmSettingsView, type LlmSettingsPatch } from '../core/settings.ts';

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
}

/** 请求体上限：设置对象很小，1 KiB 足够，超了直接拒绝而不是攒内存 */
const MAX_BODY_BYTES = 1024;

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
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
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

/**
 * 把请求体解析成 LlmSettingsPatch。
 * 只认白名单键，且区分「没传」与「传了 null」——后者是"清空"的意思。
 */
export function parseLlmSettingsPatch(body: unknown): LlmSettingsPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SettingsError('请求体需为 JSON 对象');
  }
  const src = body as Record<string, unknown>;
  const known = new Set(['baseUrl', 'apiKey', 'model', 'timeoutMs']);
  for (const key of Object.keys(src)) {
    if (!known.has(key)) throw new SettingsError(`未知设置项：${key}`);
  }
  const patch: LlmSettingsPatch = {};
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
  if ('timeoutMs' in src) {
    if (typeof src.timeoutMs !== 'number') throw new SettingsError('timeoutMs 需为数字');
    patch.timeoutMs = src.timeoutMs;
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

export function createHttpServer(deps: HttpDeps): http.Server {
  const staticRoot = deps.staticDir ? resolve(deps.staticDir) : null;

  return http.createServer((req, res) => {
    setSecurityHeaders(res);
    const url = (req.url ?? '/').split('?')[0]!;

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
        // 写入鉴权：设了口令就验口令，没设就只信本机（见 isLocalAddress）
        const token = deps.adminToken ?? null;
        if (token !== null) {
          if (req.headers['x-admin-token'] !== token) {
            sendJson(res, 403, { error: 'FORBIDDEN', message: '管理口令不正确' });
            return;
          }
        } else if (!isLocalAddress(req.socket.remoteAddress)) {
          sendJson(res, 403, {
            error: 'FORBIDDEN',
            message: '只有服务器本机能改设置；要在手机上改，请给服务端设置 ADMIN_TOKEN 环境变量',
          });
          return;
        }
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
      const rel = url === '/' ? 'index.html' : decodeURIComponent(url.slice(1));
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
