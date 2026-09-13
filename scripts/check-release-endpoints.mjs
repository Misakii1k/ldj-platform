#!/usr/bin/env node
/**
 * 线上发布链路与 Cloudflare Pages 边缘冒烟测试。
 *
 * 验证：
 * 1. /version.json 是否可读，字段与直链是否合规；
 * 2. /api/releases 代理是否配置了 GITHUB_TOKEN，是否能读取 Release 并改写 APK 直链；
 * 3. 非法 tag 路径穿越防护（防注入）；
 * 4. /api/download 是否能流式提供 APK 资产。
 *
 * 用法：
 *   node scripts/check-release-endpoints.mjs
 *   TABLETOP_CLOUD_ORIGIN=https://your-domain.pages.dev node scripts/check-release-endpoints.mjs
 */

const ORIGIN = (
  process.env.TABLETOP_CLOUD_ORIGIN ||
  process.env.VITE_CLOUD_ORIGIN ||
  'https://tabletop.pages.dev'
).replace(/\/$/, '');

const TIMEOUT_MS = 20_000;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function get(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${ORIGIN}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkVersionJson() {
  try {
    const res = await get('/version.json', { cache: 'no-store' });
    if (!res.ok) return record('version.json', false, `HTTP ${res.status}`);
    const manifest = await res.json();
    if (typeof manifest.version !== 'string' || !manifest.version) {
      return record('version.json', false, '缺少 version 字段');
    }
    if (typeof manifest.versionCode !== 'number') {
      return record('version.json', false, '缺少 versionCode 字段');
    }
    const url = typeof manifest.downloadUrl === 'string' ? manifest.downloadUrl : '';
    if (!url) return record('version.json', false, '缺少 downloadUrl 字段');
    if (/github\.com\/.*\/releases\/download\//.test(url)) {
      return record('version.json', false, `downloadUrl 仍指向私有/直连 GitHub 地址：${url}`);
    }
    if (!url.startsWith('/api/download') && !url.startsWith(ORIGIN)) {
      return record('version.json', false, `downloadUrl 未使用同源代理前缀：${url}`);
    }
    const size = typeof manifest.fileSize === 'number' ? `${(manifest.fileSize / (1024 * 1024)).toFixed(1)} MB` : '未声明大小';
    record('version.json', true, `v${manifest.version} (code ${manifest.versionCode}), ${size}`);
    return manifest;
  } catch (error) {
    return record('version.json', false, error.message);
  }
}

async function checkReleases() {
  try {
    const res = await get('/api/releases', { headers: { Accept: 'application/vnd.github.v3+json' } });
    if (res.status === 503) {
      const body = await res.text();
      return record(
        '/api/releases',
        false,
        `503 —— 代理未就绪。请在 Cloudflare Pages 项目设置中添加 GITHUB_TOKEN。详情：${body.slice(0, 100)}`,
      );
    }
    if (!res.ok) return record('/api/releases', false, `HTTP ${res.status}`);
    const release = await res.json();
    if (typeof release.tag_name !== 'string') {
      return record('/api/releases', false, '响应缺少 tag_name');
    }
    const apk = Array.isArray(release.assets)
      ? release.assets.find((a) => typeof a?.name === 'string' && a.name.endsWith('.apk') && !a.name.includes('unaligned'))
      : undefined;
    if (!apk) return record('/api/releases', false, `${release.tag_name} 没有可用的 APK 资产`);
    if (typeof apk.browser_download_url !== 'string' || !apk.browser_download_url.startsWith(ORIGIN)) {
      return record('/api/releases', false, `APK 直链未被改写为同源边缘代理地址：${apk.browser_download_url}`);
    }
    record('/api/releases', true, `${release.tag_name}, ${apk.name}, ${(apk.size / (1024 * 1024)).toFixed(1)} MB`);
    return release;
  } catch (error) {
    return record('/api/releases', false, error.message);
  }
}

async function checkInvalidTag() {
  try {
    const res = await get('/api/releases?tag=../../../../user');
    record('非法 tag 路径穿越被拒', res.status === 400, `HTTP ${res.status}（预期 400）`);
  } catch (error) {
    record('非法 tag 路径穿越被拒', false, error.message);
  }
}

async function checkDownload(manifest) {
  if (!manifest?.version) return;
  const tag = `v${manifest.version}`;
  try {
    const res = await get(`/api/download?tag=${encodeURIComponent(tag)}`, { redirect: 'manual' });
    if (res.status === 503) {
      return record('/api/download', false, '503 —— 代理未配置 GITHUB_TOKEN');
    }
    if (res.status === 302 || res.status === 307) {
      const location = res.headers.get('location') || '';
      await res.body?.cancel().catch(() => undefined);
      const host = location ? new URL(location).host : '(缺失)';
      return record('/api/download', Boolean(location), `HTTP ${res.status} -> ${host}`);
    }
    const contentType = res.headers.get('content-type') || '';
    await res.body?.cancel().catch(() => undefined);
    const ok = res.ok && contentType.includes('android.package-archive');
    record('/api/download', ok, `HTTP ${res.status}, content-type: ${contentType || '(无)'}`);
  } catch (error) {
    return record('/api/download', false, error.message);
  }
}

console.log(`Cloudflare Pages 发布链路冒烟检查：${ORIGIN}\n`);
const manifest = await checkVersionJson();
await checkReleases();
await checkInvalidTag();
await checkDownload(manifest);

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length > 0) {
  console.log('未通过项：');
  for (const entry of failed) {
    console.log(`  - ${entry.name}: ${entry.detail}`);
  }
  process.exitCode = 1;
}
