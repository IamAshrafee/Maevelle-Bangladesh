import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Guest cart intent is deliberately non-authoritative and never reserves Inventory. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists cart;

    create table cart.carts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      public_token_hash text not null unique,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED')),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      customer_id uuid references customers.customers(id),
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create index cart_carts_active_expiry_index on cart.carts (organization_id, expires_at) where status = 'ACTIVE';

    create table cart.cart_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      cart_id uuid not null references cart.carts(id) on delete cascade,
      variant_id uuid not null references catalog.product_variants(id),
      quantity numeric(20,6) not null check (quantity > 0),
      last_seen_unit_price numeric(20,4),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (cart_id, variant_id)
    );
    create index cart_lines_cart_index on cart.cart_lines (cart_id, id);

    create table cart.cart_coupons (
      cart_id uuid not null references cart.carts(id) on delete cascade,
      coupon_code_id uuid not null references promotions.coupon_codes(id),
      created_at timestamptz not null default now(),
      primary key (cart_id, coupon_code_id)
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Guest carts are commercial intent and have no automatic down migration.');
}
