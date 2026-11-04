import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Replacement drafts deliberately cannot be consumed by legacy Order placement. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table iam.shopper_revoked_storage_keys (
      key_hash text primary key,
      revoked_at timestamptz not null default clock_timestamp()
    );
    create table orders.checkout_guest_sessions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      token_hash text not null unique check (length(token_hash)=43),
      expires_at timestamptz not null default (clock_timestamp()+interval '1 day'),
      revoked_at timestamptz,
      created_at timestamptz not null default clock_timestamp(),
      unique (organization_id,id)
    );
    create index checkout_guest_expiry on orders.checkout_guest_sessions(expires_at,id)
      where revoked_at is null;
    create table orders.checkout_drafts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      implementation_version integer not null default 2 check (implementation_version=2),
      guest_session_id uuid,
      owner_account_id uuid,
      owner_customer_id uuid,
      owner_user_id uuid,
      source_kind text not null check (source_kind in ('CART','BUY_NOW')),
      source_cart_id uuid,
      source_revision bigint,
      source_review_required boolean not null default false,
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      revision bigint not null default 1 check (revision>0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','ABANDONED','EXPIRED')),
      expires_at timestamptz not null default (clock_timestamp()+interval '1 hour'),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      unique (organization_id,id),
      foreign key (organization_id,guest_session_id) references orders.checkout_guest_sessions(organization_id,id),
      foreign key (organization_id,owner_account_id,owner_customer_id,owner_user_id)
        references customers.customer_accounts(organization_id,id,customer_id,user_id),
      foreign key (organization_id,source_cart_id) references cart.carts(organization_id,id),
      check ((guest_session_id is not null and owner_account_id is null and owner_customer_id is null and owner_user_id is null)
        or (guest_session_id is null and owner_account_id is not null and owner_customer_id is not null and owner_user_id is not null)),
      check ((source_kind='CART' and source_cart_id is not null and source_revision is not null and source_revision>0)
        or (source_kind='BUY_NOW' and source_cart_id is null and source_revision is null))
    );
    create index checkout_draft_guest_owner on orders.checkout_drafts(organization_id,guest_session_id,expires_at,id);
    create index checkout_draft_account_owner on orders.checkout_drafts(organization_id,owner_account_id,expires_at,id);
    create index checkout_draft_source_cart on orders.checkout_drafts(organization_id,source_cart_id);
    create index checkout_draft_expiry on orders.checkout_drafts(expires_at,id) where status='ACTIVE';
    create table orders.checkout_draft_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null,
      draft_id uuid not null,
      variant_id uuid not null,
      source_cart_line_id uuid,
      quantity integer not null check (quantity between 1 and 99),
      foreign key (organization_id,draft_id) references orders.checkout_drafts(organization_id,id) on delete cascade,
      foreign key (organization_id,variant_id) references catalog.product_variants(organization_id,id),
      unique (draft_id,variant_id)
    );
    create index checkout_draft_variant on orders.checkout_draft_lines(organization_id,variant_id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Checkout ownership and session revocation require forward repair.');
}
