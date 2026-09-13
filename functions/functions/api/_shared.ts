/**
 * Cloudflare Pages Functions 共享工具。
 *
 * 集中处理安全与代理机制：
 * 1. `tag` 查询参数严格正则校验，防止 WHATWG URL 归一化路径穿越；
 * 2. CORS 对白名单来源（Pages 域、Capacitor 本地回环、localhost）受控回显；
 * 3. 上游错误统一脱敏，不泄露 GitHub API 内部细节与 token 信息。
 */

export interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
}

export const DEFAULT_GITHUB_REPO = 'Misakii1k/ldj-platform';

export function getGithubRepo(env?: Env): string {
  return env?.GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPO;
}

export function getReleasesApiBase(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases`;
}

/** 版本 tag 正则白名单：如 0.4.0 / v0.4.0 / v0.4.0-beta.1 / v0.4.0+12 */
export const RELEASE_TAG_RE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,32})?$/;

/** 允许跨域访问代理的来源模式 */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-zA-Z0-9-]+\.pages\.dev$/,
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^capacitor:\/\/localhost$/,
];

const UPSTREAM_TIMEOUT_MS = 10_000;

export type ReleaseTagResult =
  | { ok: true; tag: string | null }
  | { ok: false };

/**
 * 解析并校验 `tag` 参数。
 * - 未提供或空串：{ ok: true, tag: null }（后续回落至 latest release）
 * - 不合法字符：{ ok: false }（拒绝请求）
 */
export function parseReleaseTag(raw: string | null): ReleaseTagResult {
  if (raw === null) return { ok: true, tag: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, tag: null };
  if (!RELEASE_TAG_RE.test(trimmed)) return { ok: false };
  return { ok: true, tag: trimmed };
}

/** 构造 release 查询地址并断言前缀安全 */
export function releaseApiUrl(repo: string, tag: string | null): string {
  const base = getReleasesApiBase(repo);
  if (tag === null) return `${base}/latest`;
  const normalized = tag.startsWith('v') || tag.startsWith('V') ? tag : `v${tag}`;
  const url = new URL(`${base}/tags/${normalized}`);
  if (!url.pathname.startsWith(`/repos/${repo}/releases/tags/`)) {
    throw new Error('release tag escaped the expected API prefix');
  }
  return url.toString();
}

export function assetApiUrl(repo: string, assetId: number): string {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new Error('invalid asset id');
  }
  return `${getReleasesApiBase(repo)}/assets/${assetId}`;
}

export interface GithubAsset {
  id?: number;
  name?: string;
  size?: number;
  browser_download_url?: string;
}

export interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  assets?: GithubAsset[];
  [key: string]: unknown;
}

/** 筛选有效的 APK 安装包资产 */
export function pickApkAsset(assets: GithubAsset[] | undefined): GithubAsset | null {
  if (!Array.isArray(assets)) return null;
  return assets.find((asset) =>
    typeof asset.name === 'string' &&
    asset.name.endsWith('.apk') &&
    !asset.name.includes('unaligned')
  ) ?? null;
}

export function githubHeaders(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'User-Agent': 'Tabletop-LDJ-Cloudflare-Proxy',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin || !isOriginAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...baseHeaders(),
      ...extra,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return jsonResponse({ error: code, message }, status, extra);
}

export function tokenMissingResponse(): Response {
  return errorResponse(
    'GITHUB_TOKEN_NOT_CONFIGURED',
    '未配置 GITHUB_TOKEN，请在 Cloudflare Pages 设置中的「环境变量」中添加该变量。',
    503,
  );
}

export function invalidTagResponse(): Response {
  return errorResponse('INVALID_TAG', '版本号格式不合法。', 400);
}

export function upstreamFailureResponse(status: number): Response {
  return errorResponse(
    'UPSTREAM_ERROR',
    '上游发布信息暂时不可用，请稍后再试。',
    status === 404 ? 404 : 502,
  );
}
