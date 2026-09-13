import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersion,
  resolveDownloadUrl,
} from '../src/app/update/updateService.ts';
import {
  parseReleaseTag,
  pickApkAsset,
  releaseApiUrl,
} from '../functions/api/_shared.ts';
import { getVersionCode, buildVersionManifest } from '../../../scripts/gen-version.mjs';

test('update service：语义化版本比较正确', () => {
  assert.ok(compareVersion('0.4.1', '0.4.0') > 0);
  assert.ok(compareVersion('1.0.0', '0.4.0') > 0);
  assert.ok(compareVersion('0.5.0', '0.4.9') > 0);
  assert.equal(compareVersion('0.4.0', '0.4.0'), 0);
  assert.equal(compareVersion('v0.4.0', '0.4.0'), 0);
  assert.ok(compareVersion('0.3.9', '0.4.0') < 0);
  assert.ok(compareVersion('0.4.0', '0.4.1') < 0);
});

test('update service：下载地址解析正确处理相对与绝对路径', () => {
  assert.equal(resolveDownloadUrl('https://example.com/app.apk'), 'https://example.com/app.apk');
  assert.equal(resolveDownloadUrl('http://example.com/app.apk'), 'http://example.com/app.apk');
  assert.match(resolveDownloadUrl('/api/download?tag=v0.4.1'), /\/api\/download\?tag=v0\.4\.1$/);
  assert.match(resolveDownloadUrl('api/download?tag=v0.4.1'), /\/api\/download\?tag=v0\.4\.1$/);
});

test('gen-version：版本号正确转换为单调递增 versionCode', () => {
  assert.equal(getVersionCode('0.4.0'), 400);
  assert.equal(getVersionCode('v0.4.0'), 400);
  assert.equal(getVersionCode('1.0.0'), 10000);
  assert.equal(getVersionCode('1.2.3'), 10203);
});

test('gen-version：构建元数据格式合规', () => {
  const manifest = buildVersionManifest({
    version: '0.4.0',
    versionCode: 400,
    releaseDate: '2026-09-11',
    releaseNotes: '更新说明',
    apk: { size: 1024, sha256: 'abcdef' },
  });
  assert.equal(manifest.version, '0.4.0');
  assert.equal(manifest.versionCode, 400);
  assert.equal(manifest.downloadUrl, '/api/download?tag=v0.4.0');
  assert.equal(manifest.fileSize, 1024);
  assert.equal(manifest.sha256, 'abcdef');
});

test('functions _shared：tag 白名单校验防御路径穿越', () => {
  assert.deepEqual(parseReleaseTag('v0.4.0'), { ok: true, tag: 'v0.4.0' });
  assert.deepEqual(parseReleaseTag('0.4.0'), { ok: true, tag: '0.4.0' });
  assert.deepEqual(parseReleaseTag(''), { ok: true, tag: null });
  assert.deepEqual(parseReleaseTag(null), { ok: true, tag: null });

  // 路径穿越与非法注入应被拒绝
  assert.deepEqual(parseReleaseTag('../../../../user'), { ok: false });
  assert.deepEqual(parseReleaseTag('v1.0.0/attack'), { ok: false });
  assert.deepEqual(parseReleaseTag('v1.0.0;rm -rf'), { ok: false });
});

test('functions _shared：安全构造 Release API 路径', () => {
  const latestUrl = releaseApiUrl('Misakii1k/ldj-platform', null);
  assert.equal(latestUrl, 'https://api.github.com/repos/Misakii1k/ldj-platform/releases/latest');

  const taggedUrl = releaseApiUrl('Misakii1k/ldj-platform', '0.4.0');
  assert.equal(taggedUrl, 'https://api.github.com/repos/Misakii1k/ldj-platform/releases/tags/v0.4.0');
});

test('functions _shared：APK 资产筛选', () => {
  const assets = [
    { name: 'source.tar.gz', browser_download_url: 'http://a' },
    { name: 'app-release-unaligned.apk', browser_download_url: 'http://b' },
    { name: 'tabletop-0.4.0-android-release.apk', browser_download_url: 'http://c' },
  ];
  const picked = pickApkAsset(assets);
  assert.equal(picked?.name, 'tabletop-0.4.0-android-release.apk');
});
