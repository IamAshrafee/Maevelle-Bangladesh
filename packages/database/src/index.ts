import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool } from 'pg';

/**
 * Table types are intentionally empty until migration-controlled schemas are
 * introduced. Raw infrastructure queries such as readiness checks remain typed.
 */
export type DatabaseSchema = Record<never, never>;

export type MaevelleDatabase = Kysely<DatabaseSchema>;
export type MaevelleTransaction = Transaction<DatabaseSchema>;

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
}

export interface DatabaseClient {
  readonly db: MaevelleDatabase;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class DatabaseConnectionError extends Error {
  public constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Creates the single PostgreSQL pool owned by one application process. Callers
 * share its Kysely instance and must close it during process shutdown.
 */
export function createDatabase(options: DatabaseOptions): DatabaseClient {
  if (
    options.maxConnections !== undefined &&
    (!Number.isInteger(options.maxConnections) || options.maxConnections < 1)
  ) {
    throw new Error('Database maxConnections must be a positive integer.');
  }

  const pool = new Pool({
    connectionString: options.connectionString,
    ...(options.maxConnections === undefined ? {} : { max: options.maxConnections }),
  });
  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
  let closePromise: Promise<void> | undefined;

  const ensureOpen = (): void => {
    if (closePromise) {
      throw new Error('Database client is closed.');
    }
  };

  return {
    db,
    async ping(): Promise<void> {
      ensureOpen();

      try {
        await sql`select 1`.execute(db);
      } catch (error) {
        throw new DatabaseConnectionError('PostgreSQL connectivity check failed.', error);
      }
    },
    close(): Promise<void> {
      closePromise ??= db.destroy();
      return closePromise;
    },
  };
}
