import { resolve } from 'node:path';

import { discoverMigrations, runMigrations, type MigrationResult } from './migrations.js';
import { SqliteDatabase } from './sqlite-database.js';

export interface OpenDatabaseOptions {
  migrationsDirectory?: string;
  runIntegrityCheck?: boolean;
}

export interface OpenDatabaseResult {
  database: SqliteDatabase;
  migrations: MigrationResult;
}

export function openDatabase(
  filename: string,
  options: OpenDatabaseOptions = {},
): OpenDatabaseResult {
  const database = SqliteDatabase.open(filename === ':memory:' ? filename : resolve(filename));

  try {
    const migrations = runMigrations(
      database,
      discoverMigrations(options.migrationsDirectory),
    );
    if (options.runIntegrityCheck !== false) {
      database.assertIntegrity();
    }
    return { database, migrations };
  } catch (error) {
    database.close();
    throw error;
  }
}
