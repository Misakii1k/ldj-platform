import {
  assetApiUrl,
  errorResponse,
  fetchWithTimeout,
  getGithubRepo,
  githubHeaders,
  invalidTagResponse,
  parseReleaseTag,
  pickApkAsset,
  releaseApiUrl,
  tokenMissingResponse,
  upstreamFailureResponse,
  type Env,
  type GithubRelease,
} from './_shared';

/**
 * Release APK 边缘流式代理下载。
 *
 * 通过 Cloudflare 边缘直接将 APK 字节流代理至客户端：
 * 避免 302 重定向到 release-assets.githubusercontent.com 造成的网络超时或拦截，
 * 同时支持私有仓库 APK 的安全免密下载。
 */
export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const parsedTag = parseReleaseTag(url.searchParams.get('tag') || url.searchParams.get('version'));
  if (!parsedTag.ok) return invalidTagResponse();

  const token = env?.GITHUB_TOKEN;
  if (!token) return tokenMissingResponse();

  const repo = getGithubRepo(env);

  try {
    const releaseRes = await fetchWithTimeout(releaseApiUrl(repo, parsedTag.tag), {
      headers: githubHeaders(token, 'application/vnd.github.v3+json'),
    });

    if (!releaseRes.ok) {
      return upstreamFailureResponse(releaseRes.status);
    }

    const release = (await releaseRes.json()) as GithubRelease;
    const apkAsset = pickApkAsset(release.assets);
    if (!apkAsset || typeof apkAsset.id !== 'number' || typeof apkAsset.name !== 'string') {
      return errorResponse('APK_NOT_FOUND', '该版本没有可用的 APK 安装包资产。', 404);
    }

    const assetRes = await fetchWithTimeout(
      assetApiUrl(repo, apkAsset.id),
      {
        method: 'GET',
        headers: githubHeaders(token, 'application/octet-stream'),
        redirect: 'follow',
      },
      60_000,
    );

    if (!assetRes.ok || !assetRes.body) {
      return upstreamFailureResponse(assetRes.status);
    }

    const headers = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${apkAsset.name}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, no-store',
    });

    const contentLength =
      assetRes.headers.get('content-length') ||
      (typeof apkAsset.size === 'number' && apkAsset.size > 0 ? String(apkAsset.size) : null);
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(assetRes.body, { headers });
  } catch {
    return upstreamFailureResponse(500);
  }
};
