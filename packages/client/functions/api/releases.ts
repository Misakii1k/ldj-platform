import {
  corsHeaders,
  errorResponse,
  fetchWithTimeout,
  getGithubRepo,
  githubHeaders,
  invalidTagResponse,
  jsonResponse,
  parseReleaseTag,
  releaseApiUrl,
  tokenMissingResponse,
  upstreamFailureResponse,
  type Env,
  type GithubRelease,
} from './_shared';

/**
 * GitHub Release 元数据代理（支持私有与公开仓库）。
 *
 * 客户端只读 `tag_name`、`body`、`published_at` 及 `assets[]`。
 * 将 APK 资产的 `browser_download_url` 改写为同源 `/api/download?tag=…`，
 * 彻底消除国内移动端直连 GitHub 造成的超时与私有资产 404 问题。
 */
export const onRequestOptions = async (context: { request: Request }) => {
  const headers = corsHeaders(context.request);
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const parsedTag = parseReleaseTag(url.searchParams.get('tag'));
  if (!parsedTag.ok) return invalidTagResponse();

  const token = env?.GITHUB_TOKEN;
  if (!token) return tokenMissingResponse();

  const repo = getGithubRepo(env);
  const cors = corsHeaders(request);
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    ...cors,
  };

  try {
    const res = await fetchWithTimeout(releaseApiUrl(repo, parsedTag.tag), {
      headers: githubHeaders(token, 'application/vnd.github.v3+json'),
    });

    if (!res.ok) {
      return upstreamFailureResponse(res.status);
    }

    const release = (await res.json()) as GithubRelease;
    const tag = typeof release.tag_name === 'string' ? release.tag_name : parsedTag.tag;
    const downloadProxyUrl = tag ? `${url.origin}/api/download?tag=${encodeURIComponent(tag)}` : '';

    if (downloadProxyUrl && Array.isArray(release.assets)) {
      for (const asset of release.assets) {
        if (typeof asset?.name !== 'string') continue;
        if (!asset.name.endsWith('.apk') || asset.name.includes('unaligned')) continue;
        asset.browser_download_url = downloadProxyUrl;
      }
    }

    return jsonResponse(release, 200, cacheHeaders);
  } catch {
    return upstreamFailureResponse(500);
  }
};

export const onRequestPost = async () =>
  errorResponse('METHOD_NOT_ALLOWED', '只支持 GET 请求。', 405, { Allow: 'GET, OPTIONS' });
