/**
 * 迁移器（SPEC §10.5）：版本唯一、迁移只前进、每个迁移在单独事务中应用。
 */
import type { Db } from './db.ts';
import { withTransaction } from './db.ts';
import { MIGRATIONS, type Migration } from './migrations.ts';

export function migrate(db: Db, migrations: Migration[] = MIGRATIONS): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as {
    version: number;
  }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const newlyApplied: number[] = [];

  for (const m of sorted) {
    if (applied.has(m.version)) continue;
    const maxApplied = Math.max(0, ...applied);
    if (m.version < maxApplied) {
      throw new Error(`迁移版本回退：${m.version} < 已应用最高版本 ${maxApplied}`);
    }
    // 表重建类迁移（如 v7）需要 DROP 被外键引用的父表。
    // PRAGMA foreign_keys 在事务内是 no-op，必须在事务外先关闭、提交后再恢复，
    // 否则 DROP 父表会级联删除子表行（或对 NO ACTION 子表直接失败）。
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      withTransaction(db, () => {
        db.exec(m.up);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          m.version,
          m.name,
          Date.now(),
        );
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    applied.add(m.version);
    newlyApplied.push(m.version);
  }
  return newlyApplied;
}

/** 启动恢复第一步的完整性检查（SPEC §10.4.1） */
export function integrityCheck(db: Db): boolean {
  const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
  return row !== undefined && Object.values(row)[0] === 'ok';
}
