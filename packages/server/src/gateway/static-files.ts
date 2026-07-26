import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

export async function serveStaticFile(
  clientDistDir: string,
  requestPath: string,
  response: ServerResponse,
): Promise<boolean> {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '/');
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const requested = path.resolve(clientDistDir, relative);
  const root = path.resolve(clientDistDir);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) return false;

  let target = requested;
  try {
    if (!(await stat(target)).isFile()) return false;
  } catch {
    if (path.extname(relative) !== '') return false;
    target = path.join(root, 'index.html');
  }

  try {
    const body = await readFile(target);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes[path.extname(target)] ?? 'application/octet-stream');
    response.end(body);
    return true;
  } catch {
    return false;
  }
}
