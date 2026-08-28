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

    alter table procurement.purchases
      add column supplier_reference text,
      add column order_date date not null default current_date,
      add column expected_date date,
      add column destination_location_id uuid,
      add constraint purchases_destination_location_fk
        foreign key (organization_id, destination_location_id)
        references warehouse.locations(organization_id, id);

    alter table inbound_shipment.shipments
      add column expected_arrival_date date;

    alter table receiving.inbound_receipts
      add column packing_slip_reference text,
      add column notes text;

    create index purchases_organization_expected_date
      on procurement.purchases (organization_id, expected_date, status)
      where status = 'PLACED';
    create index shipments_organization_expected_arrival
      on inbound_shipment.shipments (organization_id, expected_arrival_date, status)
      where status in ('PLANNED', 'IN_TRANSIT');
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Supply records are operational history and have no automatic down migration.');
}
