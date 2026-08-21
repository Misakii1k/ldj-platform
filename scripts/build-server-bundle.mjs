/**
 * 服务端单文件打包（APP 内嵌运行时用）：
 * 产物 build/app-host/server-bundle.cjs 由 Termux Node 24 直接执行，
 * 静态资源目录与数据目录通过 CLIENT_DIST_DIR / DATA_DIR 环境变量注入。
 *
 * 用法：node scripts/build-server-bundle.mjs
 */
import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(root, 'build/app-host/server-bundle.cjs');

await mkdir(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, 'packages/server/src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});

const kb = Math.round((await stat(outfile)).size / 102.4) / 10;
console.log(`server bundle → ${outfile} (${kb} KB)`);
