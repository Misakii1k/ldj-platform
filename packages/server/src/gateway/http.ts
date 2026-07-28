/**
 * HTTP 入口（FR-BOOT-003）：健康检查 + 静态文件托管 + 基本安全响应头（SEC-006）。
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { PublicRoomSummary } from '../core/snapshot.ts';

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
