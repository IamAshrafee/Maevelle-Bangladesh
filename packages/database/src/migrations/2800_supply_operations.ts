import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Adds operator-facing supply metadata without changing immutable receipt or cost facts. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table procurement.suppliers drop constraint suppliers_status_check;
    alter table procurement.suppliers
      add constraint suppliers_status_check check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')),
      add column supplier_type text not null default 'OTHER'
        check (supplier_type in ('MANUFACTURER', 'WHOLESALER', 'DISTRIBUTOR', 'AGENT', 'LOCAL_VENDOR', 'OTHER')),
      add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
      add column preferred_currency_code text check (preferred_currency_code is null or preferred_currency_code in ('BDT', 'CNY', 'USD')),
      add column payment_terms text,
      add column default_advance_percentage numeric(7,4)
        check (default_advance_percentage is null or (default_advance_percentage >= 0 and default_advance_percentage <= 100)),
      add column balance_due_event text
        check (balance_due_event is null or balance_due_event in ('BEFORE_DISPATCH', 'CHINA_WAREHOUSE_RECEIPT', 'BANGLADESH_WAREHOUSE_RECEIPT', 'DOORSTEP_DELIVERY', 'NET_TERMS', 'CUSTOM')),
      add column service_scope text[] not null default '{}'
        check (service_scope <@ array['SOURCING','PURCHASING','CHINA_LOCAL_DELIVERY','INTERNATIONAL_FREIGHT','IMPORT_CLEARANCE','BANGLADESH_FINAL_MILE']::text[]),
      add column lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
      add column website_url text;

    alter table procurement.purchases drop constraint if exists purchases_status_check;
    alter table procurement.purchases
      add constraint purchases_status_check check (status in ('DRAFT', 'PLACED', 'CANCELLED', 'CLOSED')),
      add column if not exists supplier_reference text,
      add column if not exists order_date date not null default current_date,
      add column if not exists expected_date date,
      add column if not exists destination_location_id uuid,
      add column if not exists close_reason text,
      add column if not exists closed_at timestamptz,
      add column if not exists closed_by_actor_id uuid,
      add column if not exists cancelled_at timestamptz;
    alter table procurement.purchases
      add column supplier_payment_terms_snapshot text,
      add column supplier_advance_percentage_snapshot numeric(7,4),
      add column supplier_balance_due_event_snapshot text,
      add column supplier_service_scope_snapshot text[] not null default '{}',
      add constraint purchases_supplier_advance_snapshot_check
        check (supplier_advance_percentage_snapshot is null or (supplier_advance_percentage_snapshot >= 0 and supplier_advance_percentage_snapshot <= 100)),
      add constraint purchases_supplier_due_event_snapshot_check
        check (supplier_balance_due_event_snapshot is null or supplier_balance_due_event_snapshot in ('BEFORE_DISPATCH', 'CHINA_WAREHOUSE_RECEIPT', 'BANGLADESH_WAREHOUSE_RECEIPT', 'DOORSTEP_DELIVERY', 'NET_TERMS', 'CUSTOM')),
      add constraint purchases_supplier_scope_snapshot_check
        check (supplier_service_scope_snapshot <@ array['SOURCING','PURCHASING','CHINA_LOCAL_DELIVERY','INTERNATIONAL_FREIGHT','IMPORT_CLEARANCE','BANGLADESH_FINAL_MILE']::text[]);

    create table if not exists procurement.purchase_adjustments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      purchase_id uuid not null,
      adjustment_type text not null default 'DISCOUNT'
        check (adjustment_type in ('DISCOUNT')),
      calculation_method text not null
        check (calculation_method in ('PERCENTAGE', 'FIXED_AMOUNT')),
      title text not null check (length(trim(title)) > 0),
      percentage numeric(9,6)
        check (percentage is null or (percentage > 0 and percentage <= 100)),
      amount numeric(20,4) not null check (amount > 0),
      external_reference text,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      foreign key (organization_id, purchase_id)
        references procurement.purchases(organization_id, id) on delete cascade,
      check (
        (calculation_method = 'PERCENTAGE' and percentage is not null)
        or (calculation_method = 'FIXED_AMOUNT' and percentage is null)
      )
    );

    create table if not exists procurement.purchase_adjustment_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      adjustment_id uuid not null,
      purchase_line_id uuid not null,
      allocated_amount numeric(20,4) not null check (allocated_amount >= 0),
      created_at timestamptz not null default now(),
      unique (organization_id, adjustment_id, purchase_line_id),
      foreign key (organization_id, adjustment_id)
        references procurement.purchase_adjustments(organization_id, id) on delete cascade,
      foreign key (organization_id, purchase_line_id)
        references procurement.purchase_lines(organization_id, id) on delete cascade
    );

    create index if not exists purchase_adjustments_purchase
      on procurement.purchase_adjustments (organization_id, purchase_id, created_at, id);
    create index if not exists purchase_adjustment_allocations_line
      on procurement.purchase_adjustment_allocations (organization_id, purchase_line_id, adjustment_id);

    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'purchases_destination_location_fk') then
        alter table procurement.purchases
          add constraint purchases_destination_location_fk
          foreign key (organization_id, destination_location_id)
          references warehouse.locations(organization_id, id);
      end if;
    end $$;

    alter table inbound_shipment.shipments
      add column if not exists expected_arrival_date date,
      add column if not exists departed_at timestamptz;

    alter table receiving.inbound_receipts drop constraint if exists inbound_receipts_status_check;
    alter table receiving.inbound_receipts
      add constraint inbound_receipts_status_check check (status in ('POSTED', 'REVERSED')),
      add column if not exists packing_slip_reference text,
      add column if not exists notes text,
      add column if not exists reversed_at timestamptz,
      add column if not exists reversed_by_actor_id uuid,
      add column if not exists reversed_inventory_transaction_id uuid references inventory.inventory_transactions(id),
      add column if not exists reversal_reason text;

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('receiving.adjust', 'receiving', 'Reverse posted inbound receipts and resolve receiving conditions.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, 'receiving.adjust'
      from iam.organization_memberships membership
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;

    create index if not exists purchases_organization_expected_date
      on procurement.purchases (organization_id, expected_date, status)
      where status = 'PLACED';
    create index if not exists shipments_organization_expected_arrival
      on inbound_shipment.shipments (organization_id, expected_arrival_date, status)
      where status in ('PLANNED', 'IN_TRANSIT');
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Supply records are operational history and have no automatic down migration.');
}
