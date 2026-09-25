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
