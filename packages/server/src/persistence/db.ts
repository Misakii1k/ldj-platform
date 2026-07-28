/**
 * SQLite 薄边界（SPEC §8.1.6 / DG-01 候选：node:sqlite）。
 * 唯一直接接触驱动的模块；若未来更换驱动，只改这里与 migrator。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

export interface OpenDbOptions {
  /** 文件路径或 ':memory:' */
  path: string;
}

export function openDb(options: OpenDbOptions): Db {
  if (options.path !== ':memory:') {
    mkdirSync(dirname(options.path), { recursive: true });
  }
  const db = new DatabaseSync(options.path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

/**
 * 同步事务助手：BEGIN IMMEDIATE 保证写事务立即取得锁。
 * 任何一步失败都回滚，不产生部分状态（SPEC §8.7）。
 */
export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb(db: Db): void {
  db.close();
}
