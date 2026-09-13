import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../nativePlatform.ts';
import type { AvailableUpdate, DownloadProgress } from './updateTypes.ts';

export const LOCAL_APP_VERSION = '0.4.0';
export const LOCAL_APP_VERSION_CODE = 400;
export const DEFAULT_CLOUD_ORIGIN = 'https://tabletop.pages.dev';

export interface AppUpdatePlugin {
  getInstalledVersion(): Promise<{ versionName: string; versionCode: number; packageName: string }>;
  downloadHttp(options: { url: string; destPath: string }): Promise<{ bytes: number; destPath: string }>;
  verifyApk(options: { apkPath: string; expectedVersionCode?: number }): Promise<{ packageName: string; versionCode: number; versionName: string }>;
  installApk(options: { apkPath: string; expectedVersionCode?: number }): Promise<void>;
  deleteApk(options: { apkPath: string }): Promise<{ deleted: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: { percent: number; received: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate');

/** 获取 Cloudflare 边缘托管服务基础地址 */
export function getCloudOrigin(): string {
  const envOrigin = (import.meta as { env?: Record<string, string> }).env?.VITE_CLOUD_ORIGIN?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/\/$/, '');
    }
  }
  return DEFAULT_CLOUD_ORIGIN;
}

/** 比较语义化版本：a > b 返回正数，a < b 返回负数，相等返回 0 */
export function compareVersion(a: string, b: string): number {
  const cleanA = a.replace(/^v/i, '').split('-')[0] || '0';
  const cleanB = b.replace(/^v/i, '').split('-')[0] || '0';
  const pa = cleanA.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const pb = cleanB.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

/** 拼接并解析完整的下载地址 */
export function resolveDownloadUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  const origin = getCloudOrigin();
  const normalizedPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${origin}${normalizedPath}`;
}

/**
 * 检查 Cloudflare 边缘托管的极速版本元数据（约 50~150ms 响应）。
 */
export async function checkFastCloudVersion(): Promise<AvailableUpdate | null> {
  const origin = getCloudOrigin();
  const metaUrl = `${origin}/version.json?_t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(metaUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      version?: string;
      versionCode?: number;
      releaseDate?: string;
      downloadUrl?: string;
      fileSize?: number;
      sha256?: string;
      releaseNotes?: string;
    };
    if (!json || typeof json.version !== 'string') return null;

    const remoteVersion = json.version.trim().replace(/^v/i, '');
    if (!remoteVersion || compareVersion(remoteVersion, LOCAL_APP_VERSION) <= 0) {
      return null;
    }

    const downloadUrl = resolveDownloadUrl(json.downloadUrl) || `${origin}/api/download?tag=v${encodeURIComponent(remoteVersion)}`;
    const estimatedCode = typeof json.versionCode === 'number' ? json.versionCode : LOCAL_APP_VERSION_CODE + 1;

    return {
      version: remoteVersion,
      versionCode: estimatedCode,
      releaseDate: json.releaseDate,
      downloadUrl,
      fileSize: typeof json.fileSize === 'number' && json.fileSize > 0 ? json.fileSize : undefined,
      sha256: typeof json.sha256 === 'string' ? json.sha256.toLowerCase() : undefined,
      releaseNotes: typeof json.releaseNotes === 'string' ? json.releaseNotes.trim() : undefined,
      source: 'cloud',
      discoveredAt: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通过 Cloudflare 代理检查 GitHub Releases 最新元数据。
 */
export async function checkGithubRelease(): Promise<AvailableUpdate | null> {
  const origin = getCloudOrigin();
  const apiUrl = `${origin}/api/releases?_t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const release = (await res.json()) as {
      tag_name?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
    };
    if (!release || !release.tag_name) return null;

    const remoteVersion = release.tag_name.trim().replace(/^v/i, '');
    if (!remoteVersion || compareVersion(remoteVersion, LOCAL_APP_VERSION) <= 0) {
      return null;
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const apkAsset = assets.find((a) => a.name?.endsWith('.apk') && !a.name.includes('unaligned'));
    const downloadUrl = apkAsset?.browser_download_url
      ? resolveDownloadUrl(apkAsset.browser_download_url)
      : `${origin}/api/download?tag=v${encodeURIComponent(remoteVersion)}`;

    return {
      version: remoteVersion,
      versionCode: LOCAL_APP_VERSION_CODE + 1,
      releaseDate: release.published_at ? release.published_at.slice(0, 10) : undefined,
      downloadUrl,
      fileSize: typeof apkAsset?.size === 'number' && apkAsset.size > 0 ? apkAsset.size : undefined,
      releaseNotes: typeof release.body === 'string' ? release.body.trim() : undefined,
      source: 'github',
      discoveredAt: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 统一检查更新（云端极速通道优先，GitHub 代理保底竞速）。
 */
export async function checkForAppUpdates(): Promise<AvailableUpdate | null> {
  // 1. 优先请求极速版本清单（50~150ms）
  const cloudPromise = checkFastCloudVersion();
  const ghPromise = checkGithubRelease();

  // 若 Cloudflare 边缘在 1200ms 内直接返回可用新版本，立即采用
  const fast = await Promise.race([
    cloudPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
  ]);

  if (fast) {
    saveCachedUpdate(fast);
    return fast;
  }

  // 否则等待两者完成，择优更高版本
  const [cloud, gh] = await Promise.all([cloudPromise, ghPromise]);
  const best = (cloud && gh)
    ? (compareVersion(cloud.version, gh.version) >= 0 ? cloud : gh)
    : (cloud || gh || null);

  if (best) {
    saveCachedUpdate(best);
  } else {
    clearCachedUpdate();
  }
  return best;
}

const UPDATE_CACHE_KEY = 'tabletop.available_update.v1';

export function saveCachedUpdate(update: AvailableUpdate): void {
  try {
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(update));
  } catch {
    /* ignore */
  }
}

export function getCachedUpdate(): AvailableUpdate | null {
  try {
    const raw = localStorage.getItem(UPDATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AvailableUpdate;
    if (parsed && typeof parsed.version === 'string' && compareVersion(parsed.version, LOCAL_APP_VERSION) > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearCachedUpdate(): void {
  try {
    localStorage.removeItem(UPDATE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Android 原生环境：下载并校验 APK
 */
export async function downloadNativeUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  if (!isNativeApp()) {
    throw new Error('当前非 Android 原生运行环境');
  }

  const destPath = `tabletop-update-${update.versionCode}.apk`;
  let progressHandle: { remove: () => Promise<void> } | null = null;

  if (onProgress) {
    try {
      progressHandle = await AppUpdate.addListener('downloadProgress', (data) => {
        onProgress({
          percent: data.percent,
          received: data.received,
          total: data.total,
        });
      });
    } catch {
      // 忽略进度监听注册失败
    }
  }

  let downloadedPath = '';
  try {
    const res = await AppUpdate.downloadHttp({
      url: update.downloadUrl,
      destPath,
    });
    downloadedPath = res.destPath;

    // 前置大小校验（若元数据提供了预期大小）
    if (typeof update.fileSize === 'number' && update.fileSize > 0 && res.bytes !== update.fileSize) {
      await AppUpdate.deleteApk({ apkPath: downloadedPath }).catch(() => undefined);
      throw new Error(`安装包大小校验失败（预期 ${update.fileSize} 字节，实际 ${res.bytes} 字节）`);
    }

    // 原生签名与包名校验
    await AppUpdate.verifyApk({
      apkPath: downloadedPath,
      expectedVersionCode: update.versionCode,
    });

    return downloadedPath;
  } catch (error) {
    if (downloadedPath) {
      await AppUpdate.deleteApk({ apkPath: downloadedPath }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (progressHandle) {
      void progressHandle.remove().catch(() => undefined);
    }
  }
}

/**
 * Android 原生环境：调起系统安装器
 */
export async function installNativeUpdate(apkPath: string, expectedVersionCode?: number): Promise<void> {
  if (!isNativeApp()) {
    throw new Error('当前非 Android 原生运行环境');
  }
  await AppUpdate.installApk({
    apkPath,
    expectedVersionCode,
  });
}

/**
 * Web 网页环境：触发 APK 下载
 */
export function downloadWebUpdate(update: AvailableUpdate): void {
  const url = update.downloadUrl;
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabletop-${update.version}.apk`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
