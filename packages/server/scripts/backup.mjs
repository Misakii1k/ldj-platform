/**
 * 在线备份（SPEC §10.6 / R1.1）：VACUUM INTO 生成一致性快照，可选 --verify。
 *
 * 用法：
 *   node packages/server/scripts/backup.mjs --db <源库> [--out <备份路径>] [--verify]
 *   node packages/server/scripts/backup.mjs --verify            # 默认备份 data/platform.db
 *
 * 退出码：0 成功；1 失败。备份为单文件（无 WAL 侧写），可离线拷贝。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DEFAULT_DB = resolve(PROJECT_ROOT, 'data/platform.db');

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (name) => {
    const idx = args.indexOf(name);
    return idx === -1 ? undefined : args[idx + 1];
  };
  return {
    dbPath: resolve(PROJECT_ROOT, read('--db') ?? DEFAULT_DB),
    outPath: read('--out') ? resolve(PROJECT_ROOT, read('--out')) : undefined,
    verify: args.includes('--verify'),
  };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 打开备份执行 PRAGMA quick_check；返回 true 表示通过（打不开/非 SQLite 视为失败） */
export function verifyDb(dbPath) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return false;
  }
  try {
    const row = db.prepare('PRAGMA quick_check').get();
    return row !== undefined && row.quick_check === 'ok';
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/** 在线备份：VACUUM INTO 到目标路径；返回目标路径 */
export function backupDb(dbPath, outPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`源数据库不存在: ${dbPath}`);
  }
  const target = outPath ?? `${dbPath}.bak.${timestamp()}`;
  mkdirSync(dirname(target), { recursive: true });
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  return target;
}

function main() {
  const opts = parseArgs(process.argv);
  try {
    const target = backupDb(opts.dbPath, opts.outPath);
    console.log(`备份完成: ${target}`);
    if (opts.verify) {
      if (!verifyDb(target)) {
        console.error('校验失败: 备份文件 PRAGMA quick_check 未通过');
        process.exit(1);
      }
      console.log('校验通过: PRAGMA quick_check = ok');
    } else {
      console.log(`提示: 未执行校验（可用 --verify 校验备份完整性）`);
    }
    console.log(`备份大小: ${basename(target)}`);
  } catch (err) {
    console.error(`备份失败: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
