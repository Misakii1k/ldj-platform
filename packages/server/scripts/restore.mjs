/**
 * 恢复（SPEC §10.6 / R1.1）：校验备份 → 拷贝 → 清除目标 WAL/SHM 侧写 → 再校验目标。
 *
 * 用法：
 *   node packages/server/scripts/restore.mjs --from <备份> [--to <目标库>] [--verify]
 *   node packages/server/scripts/restore.mjs --from data/platform.db.bak.20260809-120000
 *
 * 注意：恢复会覆盖目标数据库；请在服务停止状态下执行。
 * 退出码：0 成功；1 失败。
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyDb } from './backup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DEFAULT_DB = resolve(PROJECT_ROOT, 'data/platform.db');

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (name) => {
    const idx = args.indexOf(name);
    return idx === -1 ? undefined : args[idx + 1];
  };
  const from = read('--from');
  if (!from) throw new Error('缺少 --from <备份路径>');
  return {
    fromPath: resolve(PROJECT_ROOT, from),
    toPath: resolve(PROJECT_ROOT, read('--to') ?? DEFAULT_DB),
    verify: args.includes('--verify'),
  };
}

/** 恢复：先校验备份，拷贝到目标，清除目标残留 WAL/SHM，再校验目标 */
export function restoreDb(fromPath, toPath) {
  if (!existsSync(fromPath)) {
    throw new Error(`备份不存在: ${fromPath}`);
  }
  if (!verifyDb(fromPath)) {
    throw new Error(`备份校验失败: ${fromPath} 的 PRAGMA quick_check 未通过`);
  }
  copyFileSync(fromPath, toPath);
  // 目标若曾以 WAL 模式运行，残留的 -wal/-shm 会污染新文件，必须清除
  for (const suffix of ['-wal', '-shm']) {
    try {
      rmSync(`${toPath}${suffix}`, { force: true });
    } catch {
      // 忽略
    }
  }
  return toPath;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (err) {
    console.error(`参数错误: ${err.message}`);
    process.exit(1);
  }
  try {
    const target = restoreDb(opts.fromPath, opts.toPath);
    console.log(`恢复完成: ${target}`);
    if (!verifyDb(target)) {
      console.error('校验失败: 恢复后的数据库 PRAGMA quick_check 未通过');
      process.exit(1);
    }
    console.log('校验通过: 恢复后的数据库 PRAGMA quick_check = ok');
  } catch (err) {
    console.error(`恢复失败: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
