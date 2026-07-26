import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type SqlValue = string | number | bigint | Uint8Array | null;

export type SqlRow = Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value
  );
}

/**
 * A deliberately small boundary around node:sqlite. Application code should
 * depend on this class rather than importing the experimental driver directly.
 */
export class SqliteDatabase {
  readonly #database: DatabaseSync;
  #closed = false;
  #transactionDepth = 0;

  private constructor(database: DatabaseSync) {
    this.#database = database;
  }

  static open(filename: string): SqliteDatabase {
    if (filename !== ':memory:') {
      mkdirSync(dirname(filename), { recursive: true });
    }

    const database = new DatabaseSync(filename);
    const result = new SqliteDatabase(database);

    try {
      result.exec('PRAGMA foreign_keys = ON');
      result.exec('PRAGMA busy_timeout = 5000');
      result.exec('PRAGMA synchronous = FULL');
      result.exec('PRAGMA journal_mode = WAL');
      result.assertForeignKeysEnabled();
      return result;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  get closed(): boolean {
    return this.#closed;
  }

  exec(sql: string): void {
    this.#assertOpen();
    this.#database.exec(sql);
  }

  run(sql: string, parameters: readonly SqlValue[] = []): SqlRunResult {
    this.#assertOpen();
    return this.#database.prepare(sql).run(...parameters);
  }

  get<T extends object = SqlRow>(sql: string, parameters: readonly SqlValue[] = []): T | undefined {
    this.#assertOpen();
    return this.#database.prepare(sql).get(...parameters) as T | undefined;
  }

  all<T extends object = SqlRow>(sql: string, parameters: readonly SqlValue[] = []): T[] {
    this.#assertOpen();
    return this.#database.prepare(sql).all(...parameters) as T[];
  }

  transaction<T>(operation: () => T): T {
    this.#assertOpen();

    const depth = this.#transactionDepth;
    const savepoint = `nested_transaction_${depth}`;

    if (depth === 0) {
      this.exec('BEGIN IMMEDIATE');
    } else {
      this.exec(`SAVEPOINT ${savepoint}`);
    }

    this.#transactionDepth = depth + 1;

    try {
      const result = operation();

      if (isPromiseLike(result)) {
        throw new TypeError('SQLite transaction callbacks must be synchronous');
      }

      if (depth === 0) {
        this.exec('COMMIT');
      } else {
        this.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
      this.#transactionDepth = depth;
      return result;
    } catch (error) {
      this.#transactionDepth = depth;

      if (depth === 0) {
        this.exec('ROLLBACK');
      } else {
        this.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        this.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
      throw error;
    }
  }

  assertIntegrity(): void {
    const rows = this.all<{ integrity_check: string }>('PRAGMA integrity_check');
    const failures = rows
      .map((row) => row.integrity_check)
      .filter((message) => message !== 'ok');

    if (failures.length > 0 || rows.length === 0) {
      throw new Error(`SQLite integrity check failed: ${failures.join('; ') || 'no result'}`);
    }
  }

  assertForeignKeysEnabled(): void {
    const row = this.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
    if (row?.foreign_keys !== 1) {
      throw new Error('SQLite foreign key enforcement is not enabled');
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    if (this.#transactionDepth !== 0) {
      throw new Error('Cannot close SQLite while a transaction is active');
    }

    this.#database.close();
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error('SQLite database is closed');
    }
  }
}
