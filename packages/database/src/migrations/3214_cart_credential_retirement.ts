import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Security cutover: retain intent and receipts; never promote unproven bearer possession. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table cart.carts add column credential_state text not null default 'RETIRED';
    update cart.carts set public_token_hash='retired:' || public_token_hash;
    alter table cart.carts add constraint cart_credential_state_check check (
      (credential_state='SLOT_V1' and public_token_hash ~ '^[A-Za-z0-9_-]{43}$') or
      (credential_state='RETIRED' and public_token_hash ~ '^retired:[A-Za-z0-9_-]{43}$')
    );
    create function cart.guard_credential_lifecycle() returns trigger language plpgsql as $$ begin
      if new.credential_state is distinct from old.credential_state or
         new.public_token_hash is distinct from old.public_token_hash then
        if not (old.credential_state='SLOT_V1' and new.credential_state='RETIRED' and
          new.public_token_hash='retired:' || old.public_token_hash) then
          raise exception 'Cart credential transition is not permitted' using errcode='23514';
        end if;
      end if;
      return new;
    end $$;
    create trigger cart_credential_lifecycle before update on cart.carts
      for each row execute function cart.guard_credential_lifecycle();
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error(
    'Cart credential retirement is irreversible; forward repair must retain revocation.',
  );
}
