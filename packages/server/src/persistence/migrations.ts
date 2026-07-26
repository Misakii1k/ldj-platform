import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SqliteDatabase } from './sqlite-database.js';

const MIGRATION_FILENAME = /^(\d+)_([a-z0-9][a-z0-9_-]*)\.sql$/i;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationResult {
  appliedVersions: number[];
  currentVersion: number;
}

export const defaultMigrationsDirectory = fileURLToPath(
  new URL('./migrations', import.meta.url),
);

export function discoverMigrations(directory = defaultMigrationsDirectory): Migration[] {
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILENAME.test(entry.name))
    .map((entry) => {
      const match = MIGRATION_FILENAME.exec(entry.name);
      if (!match) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }

      const versionText = match[1];
      const migrationName = match[2];
      if (versionText === undefined || migrationName === undefined) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }

      const version = Number.parseInt(versionText, 10);
      if (!Number.isSafeInteger(version) || version <= 0) {
        throw new Error(`Invalid migration version in ${entry.name}`);
      }

      return {
        version,
        name: migrationName,
        sql: readFileSync(join(directory, entry.name), 'utf8'),
      };
    })
    .sort((left, right) => left.version - right.version);

  for (let index = 1; index < migrations.length; index += 1) {
    const previousVersion = migrations[index - 1]?.version;
    const currentVersion = migrations[index]?.version;
    if (previousVersion === currentVersion) {
      throw new Error(`Duplicate migration version: ${migrations[index]?.version}`);
    }
    if (previousVersion !== undefined && currentVersion !== previousVersion + 1) {
      throw new Error(`Migration versions must be contiguous: ${previousVersion} -> ${currentVersion}`);
    }
  }

  if (migrations.length > 0 && migrations[0]?.version !== 1) {
    throw new Error('The first migration version must be 1');
  }

  return migrations;
}

export function runMigrations(
  database: SqliteDatabase,
  migrations = discoverMigrations(),
  appliedAt = Date.now(),
): MigrationResult {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
    ) STRICT
  `);

  const appliedRows = database.all<{ version: number; name: string }>(
    'SELECT version, name FROM schema_migrations ORDER BY version',
  );
  const availableVersions = new Set(migrations.map((migration) => migration.version));

  for (const applied of appliedRows) {
    if (!availableVersions.has(applied.version)) {
      throw new Error(`Database contains unknown migration version ${applied.version}`);
    }
    const migration = migrations.find((candidate) => candidate.version === applied.version);
    if (migration?.name !== applied.name) {
      throw new Error(`Applied migration ${applied.version} has an unexpected name`);
    }
  }

  const alreadyApplied = new Set(appliedRows.map((row) => row.version));
  const appliedVersions: number[] = [];

  for (const migration of migrations) {
    if (alreadyApplied.has(migration.version)) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, appliedAt],
      );
    });
    appliedVersions.push(migration.version);
  }

  const currentVersion = migrations.at(-1)?.version ?? 0;
  return { appliedVersions, currentVersion };
}
