import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    set local lock_timeout='5s';
    alter table customers.customer_accounts add constraint customer_account_mapping_key
      unique (organization_id,id,customer_id,user_id);
    alter table cart.carts
      alter column public_token_hash drop not null,
      alter column expires_at drop not null,
      drop constraint cart_credential_state_check,
      drop constraint carts_status_check,
      add constraint carts_status_check check (status in ('ACTIVE','CONVERTED','ABANDONED','EXPIRED','MERGED')),
      add column merged_into_id uuid,
      add column owner_user_id uuid,
      add constraint cart_merge_target_fk foreign key (organization_id,merged_into_id)
        references cart.carts(organization_id,id),
      add constraint cart_merge_state_check check (
        (status='MERGED' and merged_into_id is not null and merged_into_id <> id
          and owner_account_id is null and credential_state='RETIRED')
        or (status<>'MERGED' and merged_into_id is null)
      ),
      add constraint cart_account_mapping_fk foreign key (organization_id,owner_account_id,customer_id,owner_user_id)
        references customers.customer_accounts(organization_id,id,customer_id,user_id),
      add constraint cart_credential_state_check check (
        (owner_account_id is null and owner_user_id is null and expires_at is not null and public_token_hash is not null and (
          (credential_state='SLOT_V1' and public_token_hash ~ '^[A-Za-z0-9_-]{43}$') or
          (credential_state='RETIRED' and public_token_hash ~ '^retired:[A-Za-z0-9_-]{43}$')
        )) or (
          owner_account_id is not null and owner_user_id is not null and customer_id is not null and credential_state='ACCOUNT'
          and public_token_hash is null and expires_at is null
        )
      );
    create index cart_merge_target_index on cart.carts(organization_id,merged_into_id)
      where merged_into_id is not null;
    create index cart_account_receipt_expiry on platform.idempotency_records(expires_at,id)
      where principal_type='ACCOUNT_CART' and operation_type like 'cart.foundation.%';
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Account Cart ownership and merge revocation require forward repair.');
}
