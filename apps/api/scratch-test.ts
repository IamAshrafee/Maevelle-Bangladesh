import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createManagedCategory } from '../../packages/database/src/catalog-classification';
import { DatabaseSchema } from '../../packages/database/src/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/maevelle',
});

const db = new Kysely<DatabaseSchema>({
  dialect: new PostgresDialect({ pool }),
});

async function run() {
  try {
    const res = await createManagedCategory(db, {
      organizationId: '00000000-0000-0000-0000-000000000000', // Need a valid org ID, or it will fail FK
      actorId: '00000000-0000-0000-0000-000000000000',
      name: 'Women',
      handle: 'women',
      status: 'ACTIVE',
      position: 0,
      defaultSizeGuideId: null
    });
    console.log('Success:', res);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
