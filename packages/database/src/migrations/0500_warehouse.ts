import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Locations own operational workflow only; Inventory owns every quantity. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists warehouse;

    create table warehouse.locations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null check (length(trim(name)) > 0),
      location_type text not null check (location_type in ('WAREHOUSE', 'SHOWROOM', 'RETAIL_STORE', 'FULFILLMENT_CENTER', 'RETURN_CENTER', 'THIRD_PARTY', 'OTHER')),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
      address_json jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, code),
      unique (organization_id, id),
      check (address_json is null or jsonb_typeof(address_json) = 'object')
    );
    create index locations_organization_status on warehouse.locations (organization_id, status, name);

    create table warehouse.location_capabilities (
      organization_id uuid not null references platform.organizations(id),
      location_id uuid not null,
      capability_code text not null check (capability_code in ('STOCK_HOLDING', 'PURCHASE_RECEIVING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE', 'ORDER_FULFILLMENT', 'RETURN_RECEIVING', 'CUSTOMER_PICKUP', 'INTERNAL_STORAGE')),
      primary key (location_id, capability_code),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index location_capabilities_organization_capability on warehouse.location_capabilities (organization_id, capability_code, location_id);

    create table warehouse.transfers (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      transfer_number text not null,
      source_location_id uuid not null,
      destination_location_id uuid not null,
      status text not null default 'DRAFT' check (status in ('DRAFT', 'READY', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
      notes text,
      created_by_actor_id uuid,
      approved_at timestamptz,
      dispatched_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, transfer_number),
      unique (organization_id, id),
      check (source_location_id <> destination_location_id),
      foreign key (organization_id, source_location_id) references warehouse.locations(organization_id, id),
      foreign key (organization_id, destination_location_id) references warehouse.locations(organization_id, id)
    );
    create index transfers_organization_status on warehouse.transfers (organization_id, status, created_at desc);

    create table warehouse.transfer_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      transfer_id uuid not null,
      inventory_item_id uuid not null,
      requested_quantity numeric(20,6) not null check (requested_quantity > 0),
      dispatched_quantity numeric(20,6) not null default 0 check (dispatched_quantity >= 0),
      received_quantity numeric(20,6) not null default 0 check (received_quantity >= 0),
      cancelled_quantity numeric(20,6) not null default 0 check (cancelled_quantity >= 0),
      created_at timestamptz not null default now(),
      unique (transfer_id, inventory_item_id),
      foreign key (organization_id, transfer_id) references warehouse.transfers(organization_id, id),
      check (dispatched_quantity <= requested_quantity - cancelled_quantity),
      check (received_quantity <= dispatched_quantity)
    );
    create index transfer_lines_organization_transfer on warehouse.transfer_lines (organization_id, transfer_id);

    alter table catalog.product_variants add constraint product_variants_organization_id_id_unique unique (organization_id, id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('warehouse.view', 'warehouse', 'View locations and transfers.', 'INTERNAL'),
      ('warehouse.manage', 'warehouse', 'Create and manage locations and transfers.', 'HIGH'),
      ('inventory.view', 'inventory', 'View inventory balances and history.', 'INTERNAL'),
      ('inventory.adjust', 'inventory', 'Post controlled inventory adjustments and condition moves.', 'HIGH'),
      ('inventory.reserve', 'inventory', 'Create and release inventory reservations.', 'HIGH'),
      ('inventory.transfer', 'inventory', 'Dispatch and receive warehouse transfers.', 'HIGH'),
      ('inventory.stocktake', 'inventory', 'Create and post stocktakes.', 'HIGH')
    on conflict (capability_code) do nothing;

    insert into iam.membership_capability_grants (membership_id, capability_code)
    select membership.id, capability.capability_code
    from iam.organization_memberships membership
    cross join (values
      ('warehouse.view'), ('warehouse.manage'), ('inventory.view'), ('inventory.adjust'),
      ('inventory.reserve'), ('inventory.transfer'), ('inventory.stocktake')
    ) as capability(capability_code)
    where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Warehouse data is historical operational truth and has no automatic down migration.',
  );
}
