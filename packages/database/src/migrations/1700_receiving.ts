import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Inbound Receipts are the canonical physical receiving truth and ledger trigger. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists receiving;

    alter table inventory.inventory_transactions drop constraint inventory_transactions_transaction_type_check;
    alter table inventory.inventory_transactions add constraint inventory_transactions_transaction_type_check
      check (transaction_type in ('OPENING_BALANCE', 'ADJUSTMENT', 'CONDITION_CHANGE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'STOCKTAKE_ADJUSTMENT', 'FULFILLMENT_DISPATCH', 'INBOUND_RECEIPT'));

    create table receiving.inbound_receipts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      receipt_number text not null,
      shipment_id uuid not null references inbound_shipment.shipments(id),
      receiving_location_id uuid not null,
      status text not null default 'POSTED' check (status = 'POSTED'),
      posted_inventory_transaction_id uuid unique references inventory.inventory_transactions(id),
      created_by_actor_id uuid,
      posted_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      unique (organization_id, receipt_number),
      unique (organization_id, id),
      foreign key (organization_id, shipment_id) references inbound_shipment.shipments(organization_id, id),
      foreign key (organization_id, receiving_location_id) references warehouse.locations(organization_id, id)
    );
    create index inbound_receipts_shipment on receiving.inbound_receipts (organization_id, shipment_id, posted_at desc, id desc);

    create table receiving.inbound_receipt_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      inbound_receipt_id uuid not null references receiving.inbound_receipts(id) on delete restrict,
      shipment_allocation_id uuid not null references inbound_shipment.purchase_line_allocations(id) on delete restrict,
      variant_id uuid not null,
      condition_code text not null check (condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      quantity numeric(20,6) not null check (quantity > 0),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, inbound_receipt_id) references receiving.inbound_receipts(organization_id, id),
      foreign key (organization_id, shipment_allocation_id) references inbound_shipment.purchase_line_allocations(organization_id, id),
      foreign key (organization_id, variant_id) references catalog.product_variants(organization_id, id)
    );
    create index inbound_receipt_lines_allocation on receiving.inbound_receipt_lines (organization_id, shipment_allocation_id, inbound_receipt_id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('receiving.view', 'receiving', 'View inbound receipt history.', 'INTERNAL'),
      ('receiving.post', 'receiving', 'Post inspected physical inbound receipts.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('receiving.view'), ('receiving.post')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Inbound receipts are immutable physical history and have no automatic down migration.',
  );
}
