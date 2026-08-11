/**
 * backup/restore 往返测试（SPEC R1.1）：
 * 备份 → 校验 → 破坏源库 → 恢复 → 校验数据完整性 + 侧写清除。
 * 仅使用临时目录，不触碰 data/ 真实数据。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDb, verifyDb } from '../../packages/server/scripts/backup.mjs';
import { restoreDb } from '../../packages/server/scripts/restore.mjs';

function createSourceDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE players (id INTEGER PRIMARY KEY, nickname TEXT NOT NULL)');
  db.exec("INSERT INTO players (nickname) VALUES ('阿黄'), ('小蓝'), ('大绿')");
  db.close();
}

function readNicknames(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare('SELECT nickname FROM players ORDER BY id').all();
    return rows.map((r) => r.nickname);
  } finally {
    db.close();
  }
}

test('backup → 破坏 → restore 往返：数据完整、侧写清除', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ldj-backup-'));
  const source = join(dir, 'platform.db');
  try {
    createSourceDb(source);

    const backup = backupDb(source);
    assert.ok(existsSync(backup), '备份文件应存在');
    assert.equal(verifyDb(backup), true, '备份应通过 quick_check');
    assert.deepEqual(readNicknames(backup), ['阿黄', '小蓝', '大绿'], '备份应包含全部数据');

    // 破坏源库：删表
    const db = new DatabaseSync(source);
    db.exec('DROP TABLE players');
    db.close();
    assert.throws(() => readNicknames(source), '源库应已破坏');

    // 恢复
    const restored = restoreDb(backup, source);
    assert.equal(restored, source);
    assert.equal(verifyDb(source), true, '恢复后应通过 quick_check');
    assert.deepEqual(readNicknames(source), ['阿黄', '小蓝', '大绿'], '恢复后数据应完整');
    assert.equal(existsSync(`${source}-wal`), false, '恢复后不应残留 -wal 侧写');
    assert.equal(existsSync(`${source}-shm`), false, '恢复后不应残留 -shm 侧写');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('restore 拒绝校验失败的备份', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ldj-backup-'));
  const corrupt = join(dir, 'corrupt.db');
  const target = join(dir, 'target.db');
  try {
    // 写入非 SQLite 内容
    writeFileSync(corrupt, 'not a sqlite database at all');
    assert.throws(() => restoreDb(corrupt, target), /备份校验失败/);
    assert.equal(existsSync(target), false, '校验失败时不应覆盖目标');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
