/**
 * APP 内嵌服务器载荷组装：
 * 1. 从 Termux 软件源抓取 nodejs-lts 24.x 及其依赖库（aarch64 + x86_64 双架构）；
 * 2. 解包 .deb（纯 JS 解析 ar 容器，内层 tar.xz 交给系统 tar）；
 * 3. 平铺组装 build/app-host/android-assets/apphost/（Gradle 作为额外 assets 源打进 APK）。
 *
 * 载荷为纯文件树（不做 tar/xz）：Android 端只需逐文件拷贝到 filesDir 并 chmod，
 * APK 打包时由构建工具对 assets 做 deflate 压缩。
 *
 * 前置：先运行 node scripts/build-server-bundle.mjs 与 npm run build。
 * 用法：node scripts/fetch-node-runtime.mjs [--arch=aarch64|x86_64] （缺省双架构）
 */
import { mkdir, readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR = 'https://packages.termux.dev/apt/termux-main';
const CACHE = resolve(root, 'build/app-host/cache');
const ASSETS = resolve(root, 'build/app-host/android-assets/apphost');

/** Termux 架构 → Android ABI */
const ARCH_ABI = { aarch64: 'arm64-v8a', 'x86_64': 'x86_64' };
/** nodejs-lts 运行所需的 Termux 依赖包（Packages 索引中的 Depends 字段） */
const DEPS = ['libc++', 'openssl', 'c-ares', 'libicu', 'libsqlite', 'zlib'];

const argvArch = process.argv.find((a) => a.startsWith('--arch='));
const arches = argvArch ? [argvArch.slice('--arch='.length)] : Object.keys(ARCH_ABI);

async function fetchTo(url, dest) {
  if (existsSync(dest)) return;
  console.log(`下载 ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** 解析 ar 归档（.deb 容器），返回成员数组 */
function parseAr(buffer) {
  const MAGIC = '!<arch>\n';
  if (buffer.subarray(0, 8).toString('latin1') !== MAGIC) throw new Error('不是合法的 ar 归档');
  const members = [];
  let offset = 8;
  while (offset + 60 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 60);
    const name = header.toString('latin1', 0, 16).trim().replace(/\/$/, '');
    const size = Number.parseInt(header.toString('latin1', 48, 58).trim(), 10);
    if (!Number.isFinite(size)) throw new Error(`ar 成员头损坏 @${offset}`);
    const dataStart = offset + 60;
    members.push({ name, data: buffer.subarray(dataStart, dataStart + size) });
    offset = dataStart + size + (size % 2); // 成员按 2 字节对齐
  }
  return members;
}

function extractDeb(debPath, stageDir, memberName) {
  return readFile(debPath)
    .then((buffer) => {
      const dataMember = parseAr(buffer).find((m) => m.name.startsWith(memberName));
      if (!dataMember) throw new Error(`${debPath} 中没有 ${memberName} 成员`);
      return writeFile(join(stageDir, `${dataMember.name}.raw`), dataMember.data).then(() => dataMember.name);
    })
    .then(
      (name) =>
        new Promise((resolvePromise, reject) => {
          // 以 stage 为工作目录 + 相对路径，规避 Windows 盘符路径被 tar 当作远程主机；
          // 排除文档与配置目录（文档符号链接在 Windows 上无法创建）
          const result = spawnSync(
            'tar',
            [
              '-xf',
              `${name}.raw`,
              '--exclude=data/data/com.termux/files/usr/share',
              '--exclude=data/data/com.termux/files/usr/etc',
            ],
            { cwd: stageDir, stdio: 'pipe' },
          );
          const errText = result.stderr?.toString() ?? '';
          if (result.status !== 0) {
            const hardErrors = errText
              .split('\n')
              .filter(
                (line) =>
                  line.includes('tar:')
                  && !line.includes('symlink')
                  && !line.includes('Exiting with failure status'),
              );
            if (hardErrors.length > 0) {
              reject(new Error(`tar 解包失败(${result.status}): ${errText}`));
              return;
            }
            console.log(`  （跳过符号链接：${errText.split('\n').filter((l) => l.includes('symlink')).length} 条）`);
          }
          rm(join(stageDir, `${name}.raw`)).finally(resolvePromise);
        }),
    );
}

/** 解析 Packages 索引为 包名 → 条目 映射 */
function parsePackagesIndex(text) {
  const map = new Map();
  for (const chunk of text.split('\n\n')) {
    const get = (field) => chunk.match(new RegExp(`^${field}: (.*)$`, 'm'))?.[1];
    const name = get('Package');
    const filename = get('Filename');
    if (name && filename) map.set(name, { filename });
  }
  return map;
}

for (const arch of arches) {
  const abi = ARCH_ABI[arch];
  if (!abi) throw new Error(`未知架构：${arch}`);
  console.log(`\n=== ${arch} → ${abi} ===`);

  const idxRes = await fetch(`${MIRROR}/dists/stable/main/binary-${arch}/Packages`);
  if (!idxRes.ok) throw new Error(`Packages 索引拉取失败: HTTP ${idxRes.status}`);
  const index = parsePackagesIndex((await idxRes.text()).replaceAll('\r\n', '\n'));

  const wanted = ['nodejs-lts', ...DEPS];
  const stage = join(CACHE, `stage-${arch}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });

  for (const pkg of wanted) {
    const entry = index.get(pkg);
    if (!entry) throw new Error(`${arch} 源中找不到包 ${pkg}`);
    const debPath = join(CACHE, entry.filename.replaceAll('/', '_'));
    await fetchTo(`${MIRROR}/${entry.filename}`, debPath);
    console.log(`解包 ${pkg}`);
    await extractDeb(debPath, stage, 'data.tar');
  }

  // Termux 包的内部前缀（deb 内 usr 实际位于该路径下）
  const prefix = join(stage, 'data', 'data', 'com.termux', 'files', 'usr');
  const runtimeDir = join(ASSETS, `runtime-${abi}`);
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(join(runtimeDir, 'bin'), { recursive: true });
  await mkdir(join(runtimeDir, 'lib'), { recursive: true });
  const nodeBin = join(prefix, 'bin/node');
  if (!existsSync(nodeBin)) throw new Error(`stage 中缺少 usr/bin/node（${arch}）`);
  await cp(nodeBin, join(runtimeDir, 'bin/node'));
  const libDir = join(prefix, 'lib');
  let libCount = 0;
  for (const so of await readdir(libDir)) {
    if (so.endsWith('.so') || so.includes('.so.')) {
      await cp(join(libDir, so), join(runtimeDir, 'lib', so));
      libCount += 1;
    }
  }
  console.log(`runtime-${abi}: node + ${libCount} 个依赖库`);
}

// 服务端 bundle 与客户端静态资源（ABI 无关，只放一份）
await mkdir(ASSETS, { recursive: true });
await cp(resolve(root, 'build/app-host/server-bundle.cjs'), join(ASSETS, 'server-bundle.cjs'));
await rm(join(ASSETS, 'client-dist'), { recursive: true, force: true });
await cp(resolve(root, 'packages/client/dist'), join(ASSETS, 'client-dist'), { recursive: true });

console.log('\n载荷就绪：build/app-host/android-assets/apphost/');
