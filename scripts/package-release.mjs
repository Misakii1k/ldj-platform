import { createWriteStream } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';

import archiver from 'archiver';

const projectRoot = process.cwd();
const artifactsDir = path.resolve(projectRoot, 'artifacts');
const rootPackage = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const version = String(rootPackage.version);
const stageDir = path.join(artifactsDir, `.stage-${version}`);
const releaseDir = path.join(stageDir, `lan-party-platform-v${version}`);
const archivePath = path.join(artifactsDir, `lan-party-platform-v${version}.zip`);

if (!stageDir.startsWith(`${artifactsDir}${path.sep}`)) {
  throw new Error('Refusing to create release outside artifacts directory');
}

await mkdir(artifactsDir, { recursive: true });
await rm(stageDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

const copy = async (source, destination) => {
  await cp(path.join(projectRoot, source), path.join(releaseDir, destination), { recursive: true });
};

for (const file of ['package.json', 'package-lock.json', 'README.md']) await copy(file, file);
await copy('docs', 'docs');

for (const workspace of [
  'packages/shared',
  'packages/games/undercover',
  'packages/server',
  'packages/client',
]) {
  await copy(`${workspace}/package.json`, `${workspace}/package.json`);
  await copy(`${workspace}/dist`, `${workspace}/dist`);
}

await writeFile(
  path.join(releaseDir, 'START.md'),
  `# 局域网桌游平台 v${version}\n\n` +
    '1. 安装 Node.js 24 LTS。\n' +
    '2. 运行 `npm ci --omit=dev --ignore-scripts`。\n' +
    '3. 运行 `npm run start:prod`。\n' +
    '4. 使用终端打印的局域网地址或二维码加入。\n\n' +
    '按 Ctrl+C 停止；退出后确认终端已返回且端口已释放。\n',
  'utf8',
);

await new Promise((resolve, reject) => {
  const output = createWriteStream(archivePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(releaseDir, path.basename(releaseDir));
  void archive.finalize();
});

await rm(stageDir, { recursive: true, force: true });
console.log(archivePath);
