import { createDatabase } from './index.js';
import { migrationStatus, runMigrations } from './migrate.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations.');
}
const database = createDatabase({
  connectionString,
  maxConnections: 1,
});

try {
  if (process.argv.includes('--status')) {
    const status = await migrationStatus(database.db);
    for (const migration of status) {
      console.log(`${migration.executedAt ? 'applied' : 'pending'} ${migration.name}`);
    }
  } else {
    const result = await runMigrations(database.db);
    console.log(
      result.executed.length ? `Applied: ${result.executed.join(', ')}` : 'Database is current.',
    );
  }
} finally {
  await database.close();
}
