import { createDatabase, type DatabaseClient } from '@maevelle/database';

export interface Clock {
  now(): Date;
}

export interface FakeClock extends Clock {
  set(value: Date): void;
  advance(milliseconds: number): void;
}

export function createFakeClock(initial = new Date('2020-01-01T00:00:00.000Z')): FakeClock {
  let current = new Date(initial);

  return {
    now: () => new Date(current),
    set(value) {
      current = new Date(value);
    },
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds)) {
        throw new Error('Clock advance must be finite.');
      }

      current = new Date(current.getTime() + milliseconds);
    },
  };
}

export function createDeterministicIdGenerator(prefix = 'test'): () => string {
  let sequence = 0;

  return () => {
    sequence += 1;
    return `${prefix}_${sequence.toString().padStart(4, '0')}`;
  };
}

export function getTestDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const testDatabaseUrl = environment.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests.');
  }

  if (testDatabaseUrl === environment.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
  }

  return testDatabaseUrl;
}

export function createTestDatabase(environment?: NodeJS.ProcessEnv): DatabaseClient {
  return createDatabase({ connectionString: getTestDatabaseUrl(environment) });
}

export async function withTestDatabase<T>(
  callback: (database: DatabaseClient) => Promise<T>,
  environment?: NodeJS.ProcessEnv,
): Promise<T> {
  const database = createTestDatabase(environment);

  try {
    return await callback(database);
  } finally {
    await database.close();
  }
}
