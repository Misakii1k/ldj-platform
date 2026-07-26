// M0 PoC：验证 node:sqlite 满足 SPEC §8.2 / §10 要求的最小数据库能力
// 覆盖：打开、WAL、外键、事务提交/回滚、崩溃后重开、在线备份、完整性检查、单行事务延迟
// 用法：node sqlite-poc.mjs   （退出码 0 = 全部通过）
import { DatabaseSync, backup } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(here, 'poc.db');
const backupPath = join(here, 'poc.backup.db');
const vacuumPath = join(here, 'poc.vacuum.db');

for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, backupPath, vacuumPath]) {
  rmSync(p, { force: true });
}

const results = [];
function step(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (err) {
    results.push({ name, ok: false, detail: String(err?.message ?? err) });
  }
}

let db;
step('打开数据库', () => {
  db = new DatabaseSync(dbPath);
  const v = db.prepare('SELECT sqlite_version() AS v').get().v;
  return `node ${process.version} / sqlite ${v}`;
});

step('启用 WAL 与外键', () => {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  const jm = db.prepare('PRAGMA journal_mode').get().journal_mode;
  const fk = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
  if (jm !== 'wal' || Number(fk) !== 1) throw new Error(`journal_mode=${jm} foreign_keys=${fk}`);
  return `journal_mode=${jm} foreign_keys=${fk}`;
});

step('建表（含外键）', () => {
  db.exec(`
    CREATE TABLE rooms (
      id   TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      seq  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE events (
      room_id TEXT NOT NULL REFERENCES rooms(id),
      seq     INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (room_id, seq)
    );
  `);
});

step('单事务提交 1000 行', () => {
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO rooms (id, code) VALUES (?, ?)').run('r1', 'ABCDE');
  const ins = db.prepare('INSERT INTO events (room_id, seq, payload) VALUES (?, ?, ?)');
  for (let i = 1; i <= 1000; i++) ins.run('r1', i, JSON.stringify({ i }));
  db.exec('COMMIT');
  const n = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  if (Number(n) !== 1000) throw new Error(`期望 1000 行，实际 ${n}`);
});

step('事务回滚不留脏数据', () => {
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO events (room_id, seq, payload) VALUES (?, ?, ?)').run('r1', 9001, '{}');
  db.exec('ROLLBACK');
  const n = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  if (Number(n) !== 1000) throw new Error(`回滚后行数 ${n}`);
});

step('外键拒绝孤儿行', () => {
  let rejected = false;
  try {
    db.prepare('INSERT INTO events (room_id, seq, payload) VALUES (?, ?, ?)').run('ghost', 1, '{}');
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('外键约束未生效');
});

step('模拟崩溃后重开（不 close 旧连接）', () => {
  const db2 = new DatabaseSync(dbPath);
  const n = db2.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  db2.close();
  if (Number(n) !== 1000) throw new Error(`重开后行数 ${n}`);
  return '已提交数据在新连接完整可见';
});

step('单行事务延迟采样（200 次）', () => {
  const ins = db.prepare('INSERT INTO events (room_id, seq, payload) VALUES (?, ?, ?)');
  const times = [];
  for (let i = 0; i < 200; i++) {
    const t0 = process.hrtime.bigint();
    db.exec('BEGIN IMMEDIATE');
    ins.run('r1', 2000 + i, '{"a":1}');
    db.exec('COMMIT');
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  return `avg ${avg.toFixed(2)} ms / p95 ${p95.toFixed(2)} ms`;
});

await (async () => {
  try {
    if (typeof backup === 'function') {
      await backup(db, backupPath);
      const b = new DatabaseSync(backupPath);
      const n = b.prepare('SELECT COUNT(*) AS c FROM events').get().c;
      b.close();
      if (Number(n) !== 1200) throw new Error(`备份行数 ${n}，期望 1200`);
      results.push({ name: '在线备份 backup()', ok: true, detail: `${n} 行` });
    } else {
      results.push({ name: '在线备份 backup()', ok: false, detail: 'API 不存在（需 VACUUM INTO 兜底）' });
    }
  } catch (err) {
    results.push({ name: '在线备份 backup()', ok: false, detail: String(err?.message ?? err) });
  }
})();

step('VACUUM INTO 备份（兜底方案）', () => {
  db.exec(`VACUUM INTO '${vacuumPath.replaceAll("'", "''")}'`);
  const b = new DatabaseSync(vacuumPath);
  const n = b.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  b.close();
  if (Number(n) !== 1200) throw new Error(`备份行数 ${n}，期望 1200`);
});

step('完整性检查', () => {
  const row = db.prepare('PRAGMA integrity_check').get();
  const v = String(Object.values(row)[0]);
  if (v !== 'ok') throw new Error(v);
  db.close();
});

let failed = 0;
console.log('\n=== M0 SQLite PoC 结果 ===');
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
