import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Commercial customers deliberately remain separate from Better Auth identities. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists customers;

    create table customers.customers (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_number text not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED', 'MERGED', 'ANONYMIZED')),
      display_name text not null check (length(trim(display_name)) > 0),
      canonical_customer_id uuid references customers.customers(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, customer_number),
      unique (organization_id, id),
      check ((status = 'MERGED') = (canonical_customer_id is not null)),
      check (canonical_customer_id is null or canonical_customer_id <> id)
    );
    create index customers_customers_organization_name_index
      on customers.customers (organization_id, lower(display_name), id);

    create table customers.customer_phones (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      raw_value text not null,
      normalized_value text not null,
      country_code text,
      is_primary boolean not null default false,
      verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'BOUNCED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_phone_lookup_index on customers.customer_phones (organization_id, normalized_value);
    create unique index customers_one_primary_phone_index on customers.customer_phones (customer_id) where is_primary;

    create table customers.customer_emails (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      raw_value text not null,
      normalized_value text not null,
      is_primary boolean not null default false,
      verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'BOUNCED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_email_lookup_index on customers.customer_emails (organization_id, normalized_value);
    create unique index customers_one_primary_email_index on customers.customer_emails (customer_id) where is_primary;

    create table customers.customer_addresses (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid not null,
      label text,
      recipient_name text not null,
      phone text,
      address_line_1 text not null,
      address_line_2 text,
      geography_node_id uuid references geography.nodes(id),
      area text,
      city text,
      district text,
      postal_code text,
      country_code text not null,
      is_default boolean not null default false,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
    );
    create index customers_address_customer_index on customers.customer_addresses (organization_id, customer_id, status);
    create index customers_address_geography_index on customers.customer_addresses (geography_node_id) where geography_node_id is not null;
    create unique index customers_one_default_address_index on customers.customer_addresses (customer_id) where is_default and status = 'ACTIVE';

    create table customers.customer_duplicate_candidates (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      customer_a_id uuid not null,
      customer_b_id uuid not null,
      confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
      signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
      status text not null default 'OPEN' check (status in ('OPEN', 'DISMISSED', 'CONFIRMED')),
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      check (customer_a_id < customer_b_id),
      unique (organization_id, customer_a_id, customer_b_id),
      foreign key (organization_id, customer_a_id) references customers.customers(organization_id, id),
      foreign key (organization_id, customer_b_id) references customers.customers(organization_id, id)
    );

    create table customers.customer_merges (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      source_customer_id uuid not null,
      target_customer_id uuid not null,
      reason text,
      conflict_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(conflict_snapshot) = 'object'),
      created_by uuid,
      created_at timestamptz not null default now(),
      check (source_customer_id <> target_customer_id),
      foreign key (organization_id, source_customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, target_customer_id) references customers.customers(organization_id, id)
    );
    create unique index customers_customer_merges_source_unique on customers.customer_merges (source_customer_id);

    create table customers.customer_aliases (
      organization_id uuid not null references platform.organizations(id),
      alias_customer_id uuid not null,
      canonical_customer_id uuid not null,
      created_at timestamptz not null default now(),
      primary key (organization_id, alias_customer_id),
      foreign key (organization_id, alias_customer_id) references customers.customers(organization_id, id),
      foreign key (organization_id, canonical_customer_id) references customers.customers(organization_id, id),
      check (alias_customer_id <> canonical_customer_id)
    );

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('customers.view', 'customers', 'View customer administration data.', 'HIGH'),
      ('customers.manage', 'customers', 'Create and manage commercial customers.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('customers.view'), ('customers.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Customer records are commercial history and have no automatic down migration.');
}
