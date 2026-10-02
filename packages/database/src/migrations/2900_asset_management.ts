import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Durable business property. Finance and Procurement remain authoritative for money and sourcing. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists assets;

    alter table finance.finance_transactions drop constraint finance_transactions_transaction_type_check;
    alter table finance.finance_transactions add constraint finance_transactions_transaction_type_check
      check (transaction_type in ('OPENING_BALANCE','EXPENSE_PAYMENT','INTERNAL_TRANSFER','EXTERNAL_ADJUSTMENT','PAYMENT_SOURCE_POSTING','REFUND_SOURCE_POSTING','COD_SETTLEMENT','CAPITAL_CONTRIBUTION','OWNER_FUNDED_EXPENSE','CAPITAL_WITHDRAWAL','CAPITAL_REVERSAL','ASSET_SALE'));

    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'iam.organization_memberships'::regclass
          and contype = 'u'
          and conkey = array[2, 1]::smallint[]
      ) and not exists (
        select 1 from pg_constraint
        where conrelid = 'iam.organization_memberships'::regclass
          and conname = 'organization_memberships_organization_id_id_key'
      ) then
        alter table iam.organization_memberships add constraint organization_memberships_organization_id_id_key unique (organization_id, id);
      end if;
    end $$;

    create table assets.categories (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null check (length(trim(name)) between 1 and 100),
      description text null check (description is null or length(description) <= 500),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
      created_by uuid null references iam.users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      unique (organization_id, name)
    );

    create table assets.assets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_code text not null,
      name text not null check (length(trim(name)) between 1 and 200),
      category_id uuid null,
      description text null check (description is null or length(description) <= 4000),
      brand text null check (brand is null or length(brand) <= 120),
      model text null check (model is null or length(model) <= 120),
      serial_number text null check (serial_number is null or length(serial_number) <= 200),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','IN_STORAGE','UNDER_REPAIR','DAMAGED','LOST','SOLD','DISPOSED')),
      condition text not null default 'GOOD' check (condition in ('GOOD','FAIR','NEEDS_REPAIR','DAMAGED')),
      acquisition_source text not null check (acquisition_source in ('EXISTING','EXPENSE','PURCHASE','GIFT')),
      acquisition_date date not null,
      acquisition_cost numeric(20,4) null check (acquisition_cost is null or acquisition_cost >= 0),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      finance_expense_id uuid null,
      purchase_id uuid null,
      purchase_line_id uuid null,
      location_id uuid null,
      custom_location text null check (custom_location is null or length(trim(custom_location)) between 1 and 200),
      custodian_membership_id uuid null,
      warranty_expires_on date null,
      notes text null check (notes is null or length(notes) <= 4000),
      sold_at timestamptz null,
      disposal_reason text null check (disposal_reason is null or length(trim(disposal_reason)) between 4 and 1000),
      sale_finance_transaction_id uuid null,
      created_by uuid null references iam.users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, id),
      unique (organization_id, asset_code),
      foreign key (organization_id, category_id) references assets.categories(organization_id, id),
      foreign key (organization_id, finance_expense_id) references finance.expenses(organization_id, id),
      foreign key (organization_id, purchase_id) references procurement.purchases(organization_id, id),
      foreign key (organization_id, purchase_line_id) references procurement.purchase_lines(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id),
      foreign key (organization_id, custodian_membership_id) references iam.organization_memberships(organization_id, id),
      foreign key (organization_id, sale_finance_transaction_id) references finance.finance_transactions(organization_id, id),
      check (num_nonnulls(location_id, custom_location) <= 1),
      check (
        (acquisition_source='EXPENSE' and finance_expense_id is not null and purchase_id is null and purchase_line_id is null)
        or (acquisition_source='PURCHASE' and purchase_id is not null)
        or (acquisition_source in ('EXISTING','GIFT') and finance_expense_id is null and purchase_id is null and purchase_line_id is null)
      ),
      check (purchase_line_id is null or purchase_id is not null),
      check ((status='SOLD') = (sale_finance_transaction_id is not null and sold_at is not null)),
      check ((status='DISPOSED') = (disposal_reason is not null))
    );
    create index assets_worklist on assets.assets (organization_id, status, updated_at desc, id desc);
    create unique index assets_serial_unique on assets.assets (organization_id, serial_number) where serial_number is not null;
    create index assets_category on assets.assets (organization_id, category_id, status);
    create index assets_location on assets.assets (organization_id, location_id, status) where location_id is not null;
    create index assets_custodian on assets.assets (organization_id, custodian_membership_id, status) where custodian_membership_id is not null;
    create index assets_search on assets.assets using gin ((asset_code || ' ' || name || ' ' || coalesce(serial_number,'') || ' ' || coalesce(model,'')) gin_trgm_ops);

    create table assets.events (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      event_type text not null check (event_type in ('REGISTERED','UPDATED','ASSIGNED','UNASSIGNED','MOVED','STATUS_CHANGED','CONDITION_CHANGED','MAINTENANCE_RECORDED','MAINTENANCE_VOIDED','DOCUMENT_ATTACHED','DOCUMENT_DETACHED','SOLD','DISPOSED')),
      summary text not null check (length(trim(summary)) between 1 and 500),
      before_state jsonb null check (before_state is null or jsonb_typeof(before_state)='object'),
      after_state jsonb null check (after_state is null or jsonb_typeof(after_state)='object'),
      related_entity_type text null,
      related_entity_id uuid null,
      occurred_at timestamptz not null default now(),
      actor_id uuid null references iam.users(id),
      created_at timestamptz not null default now(),
      foreign key (organization_id, asset_id) references assets.assets(organization_id, id)
    );
    create index asset_events_timeline on assets.events (organization_id, asset_id, occurred_at desc, id desc);

    create table assets.maintenance_records (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      maintenance_type text not null check (maintenance_type in ('INSPECTION','SERVICE','REPAIR','PART_REPLACEMENT')),
      occurred_on date not null,
      issue text null check (issue is null or length(issue) <= 2000),
      work_performed text not null check (length(trim(work_performed)) between 1 and 4000),
      service_provider text null check (service_provider is null or length(service_provider) <= 200),
      finance_expense_id uuid null,
      next_service_on date null,
      notes text null check (notes is null or length(notes) <= 4000),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','VOIDED')),
      void_reason text null check (void_reason is null or length(trim(void_reason)) between 4 and 1000),
      voided_by uuid null references iam.users(id),
      voided_at timestamptz null,
      created_by uuid null references iam.users(id),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, asset_id) references assets.assets(organization_id, id),
      foreign key (organization_id, finance_expense_id) references finance.expenses(organization_id, id),
      check ((status='VOIDED') = (void_reason is not null and voided_at is not null))
    );
    create index asset_maintenance_timeline on assets.maintenance_records (organization_id, asset_id, occurred_on desc, id desc);
    create index asset_maintenance_due on assets.maintenance_records (organization_id, next_service_on) where next_service_on is not null;

    create table assets.media_links (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      media_asset_id uuid not null,
      role text not null check (role in ('PHOTO','PURCHASE_RECEIPT','INVOICE','WARRANTY','REPAIR_RECEIPT','SERIAL_PHOTO','OTHER')),
      label text null check (label is null or length(label) <= 160),
      created_by uuid null references iam.users(id),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, asset_id, media_asset_id, role),
      foreign key (organization_id, asset_id) references assets.assets(organization_id, id),
      foreign key (organization_id, media_asset_id) references media.media_assets(organization_id, id)
    );
    create index asset_media_asset on assets.media_links (organization_id, asset_id, created_at desc);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('assets.view','assets','View business assets, assignments, maintenance, documents, and financial provenance.','INTERNAL'),
      ('assets.manage','assets','Register and edit assets, assignments, locations, maintenance, and documents.','HIGH'),
      ('assets.lifecycle.manage','assets','Sell, dispose, lose, or otherwise change controlled asset lifecycle state.','HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('assets.view'),('assets.manage'),('assets.lifecycle.manage')) as capability(capability_code)
      where membership.membership_type='OWNER' and membership.status='ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Asset lifecycle history has no automatic down migration.');
}
