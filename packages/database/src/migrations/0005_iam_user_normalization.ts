import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Keeps the canonical normalized internal-login identifier database-enforced. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create function iam.normalize_user_email() returns trigger language plpgsql as $$
    begin
      new.email_normalized := lower(new.email);
      return new;
    end;
    $$;
    create trigger users_normalize_email before insert or update of email on iam.users
      for each row execute function iam.normalize_user_email();
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Identity normalization must not be removed automatically.');
}
