import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists promotions;

    create table promotions.promotions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null check (length(trim(name)) > 0),
      promotion_type text not null default 'COUPON' check (promotion_type in ('AUTOMATIC', 'COUPON')),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
      starts_at timestamptz,
      ends_at timestamptz,
      priority integer not null default 0,
      combinability text not null default 'EXCLUSIVE' check (combinability in ('STACKABLE', 'EXCLUSIVE')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      check (ends_at is null or starts_at is null or ends_at > starts_at)
    );
    create index promotions_active_lookup_index on promotions.promotions (organization_id, status, starts_at, ends_at, priority desc);

    create table promotions.promotion_revisions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      promotion_id uuid not null references promotions.promotions(id),
      revision_number integer not null,
      status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'SUPERSEDED')),
      benefit_type text not null check (benefit_type in ('PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT')),
      benefit_value numeric(20,4) not null check (benefit_value > 0),
      minimum_merchandise_subtotal numeric(20,4),
      configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
      created_at timestamptz not null default now(),
      activated_at timestamptz,
      unique (promotion_id, revision_number)
    );
    create index promotions_revisions_active_index on promotions.promotion_revisions (promotion_id) where status = 'ACTIVE';

    create table promotions.promotion_target_products (
      organization_id uuid not null references platform.organizations(id),
      promotion_revision_id uuid not null references promotions.promotion_revisions(id) on delete cascade,
      product_id uuid not null references catalog.products(id),
      primary key (promotion_revision_id, product_id)
    );
    create table promotions.promotion_target_variants (
      organization_id uuid not null references platform.organizations(id),
      promotion_revision_id uuid not null references promotions.promotion_revisions(id) on delete cascade,
      variant_id uuid not null references catalog.product_variants(id),
      primary key (promotion_revision_id, variant_id)
    );
    create table promotions.promotion_target_categories (
      organization_id uuid not null references platform.organizations(id),
      promotion_revision_id uuid not null references promotions.promotion_revisions(id) on delete cascade,
      category_id uuid not null references catalog.categories(id),
      primary key (promotion_revision_id, category_id)
    );

    create table promotions.coupon_codes (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      promotion_id uuid not null references promotions.promotions(id),
      code text not null,
      normalized_code text not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
      usage_limit_total bigint,
      usage_limit_per_customer bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      check (usage_limit_total is null or usage_limit_total > 0),
      check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
      unique (organization_id, normalized_code)
    );

    create table promotions.promotion_usage (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      promotion_id uuid not null references promotions.promotions(id),
      promotion_revision_id uuid not null references promotions.promotion_revisions(id),
      coupon_code_id uuid references promotions.coupon_codes(id),
      customer_id uuid references customers.customers(id),
      order_id uuid,
      discount_amount numeric(20,4) not null check (discount_amount >= 0),
      status text not null check (status in ('COMMITTED', 'RELEASED')),
      created_at timestamptz not null default now(),
      released_at timestamptz
    );
    create index promotions_usage_lookup_index on promotions.promotion_usage (organization_id, promotion_id, status);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('promotions.view', 'promotions', 'View promotion administration data.', 'INTERNAL'),
      ('promotions.manage', 'promotions', 'Create and manage promotions and coupons.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('promotions.view'), ('promotions.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Promotion records are commercial history and have no automatic down migration.');
}
