import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Prices are Pricing-domain truth, never columns on Catalog products or variants. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists pricing;

    create table pricing.price_definitions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      variant_id uuid not null references catalog.product_variants(id),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      amount numeric(20,4) not null check (amount >= 0),
      compare_at_amount numeric(20,4) check (compare_at_amount is null or compare_at_amount >= amount),
      effective_from timestamptz not null default now(),
      effective_to timestamptz,
      status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      check (effective_to is null or effective_to > effective_from)
    );
    create index pricing_price_resolution_index
      on pricing.price_definitions (organization_id, variant_id, currency_code, effective_from desc)
      where status = 'ACTIVE';

    create or replace function pricing.prevent_overlapping_price_definitions() returns trigger as $$
    begin
      if new.status <> 'ACTIVE' then return new; end if;
      perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.variant_id::text || ':' || new.currency_code, 0));
      if exists (
        select 1 from pricing.price_definitions existing
        where existing.id <> new.id
          and existing.organization_id = new.organization_id
          and existing.variant_id = new.variant_id
          and existing.currency_code = new.currency_code
          and existing.status = 'ACTIVE'
          and tstzrange(existing.effective_from, existing.effective_to, '[)') && tstzrange(new.effective_from, new.effective_to, '[)')
      ) then
        raise exception 'Overlapping active price definitions are not allowed.' using errcode = '23P01';
      end if;
      return new;
    end;
    $$ language plpgsql;
    create trigger pricing_price_definition_overlap_guard
      before insert or update of organization_id, variant_id, currency_code, effective_from, effective_to, status
      on pricing.price_definitions for each row execute function pricing.prevent_overlapping_price_definitions();

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('pricing.view', 'pricing', 'View pricing administration data.', 'INTERNAL'),
      ('pricing.manage', 'pricing', 'Create and manage selling-price definitions.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('pricing.view'), ('pricing.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Price definitions are commercial history and have no automatic down migration.');
}
