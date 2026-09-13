import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 将语义化版本号转为单调递增的 versionCode，如 0.4.0 -> 400
 */
export function getVersionCode(version) {
  const clean = version.replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}

/**
 * 构造轻量版 version.json 清单
 */
export function buildVersionManifest({ version, versionCode, releaseDate, releaseNotes, apk }) {
  return {
    version,
    versionCode,
    releaseDate,
    downloadUrl: `/api/download?tag=v${version}`,
    ...(apk ? { fileSize: apk.size, sha256: apk.sha256 } : {}),
    releaseNotes,
  };
}

/**
 * 寻找本地已构建的 APK 文件，计算真实体积与 SHA-256
 */
export function findApkManifest(rootDir, version) {
  const candidateNames = [
    `ldj-tabletop-${version}-android-release.apk`,
    `tabletop-${version}-android-release.apk`,
    'app-release.apk',
  ];

  const candidateDirs = [
    join(rootDir, 'packages', 'client', 'android', 'app', 'build', 'outputs', 'apk', 'release'),
    join(rootDir, 'packages', 'client', 'dist', 'release'),
    join(rootDir, 'packages', 'client', 'public', 'release'),
    join(rootDir, 'release'),
    rootDir,
  ];

  for (const dir of candidateDirs) {
    for (const name of candidateNames) {
      const file = join(dir, name);
      if (existsSync(file)) {
        try {
          const size = statSync(file).size;
          if (size > 0) {
            const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
            return { path: file, size, sha256 };
          }
        } catch {
          // 继续尝试下一个可能
        }
      }
    }
  }
  return null;
}

function readReleaseNotes(rootDir, version) {
  const candidateDocs = [
    join(rootDir, 'docs', 'releases', `${version}.md`),
    join(rootDir, 'docs', 'releases', `v${version}.md`),
    join(rootDir, 'CHANGELOG.md'),
  ];
  for (const doc of candidateDocs) {
    if (existsSync(doc)) {
      const content = readFileSync(doc, 'utf8').trim();
      return content.length > 500 ? `${content.slice(0, 480)}...` : content;
    }
  }
  return `聚乐桌游 v${version} 发布：支持谁是卧底、囚徒之夜等多款桌游与局域网极速联机`;
}

export function generateVersionFile(rootDir = root) {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const version = pkg.version;
  const versionCode = getVersionCode(version);
  const apk = findApkManifest(rootDir, version);

  const manifest = buildVersionManifest({
    version,
    versionCode,
    releaseDate: new Date().toISOString().slice(0, 10),
    releaseNotes: readReleaseNotes(rootDir, version),
    apk,
  });

  const targetDirs = [
    join(rootDir, 'packages', 'client', 'public'),
    join(rootDir, 'packages', 'client', 'dist'),
  ];

  for (const dir of targetDirs) {
    if (existsSync(dirname(dir))) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const targetPath = join(dir, 'version.json');
      writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`[gen-version] 生成 ${targetPath} -> v${version} (code ${versionCode})`);
    }
  }

  if (apk) {
    console.log(`[gen-version] 包含真实 APK: ${apk.path} (${apk.size} 字节, sha256 ${apk.sha256})`);
  } else {
    console.warn('[gen-version] 未检测到本地 Release APK，version.json 跳过包体哈希与大小声明。');
  }

  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateVersionFile();
}
