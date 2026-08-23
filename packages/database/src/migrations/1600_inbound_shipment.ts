import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Shipments model physical transit and explicitly bridge Purchase Lines to receiving. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists inbound_shipment;

    create table inbound_shipment.shipments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      shipment_number text not null,
      receiving_location_id uuid not null,
      transport_mode text not null default 'OTHER' check (transport_mode in ('AIR', 'SEA', 'ROAD', 'RAIL', 'OTHER')),
      status text not null default 'PLANNED' check (status in ('PLANNED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED')),
      receiving_status text not null default 'NOT_RECEIVED' check (receiving_status in ('NOT_RECEIVED', 'PARTIALLY_RECEIVED', 'RECEIVED')),
      origin_text text,
      tracking_reference text,
      arrived_at timestamptz,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, shipment_number),
      unique (organization_id, id),
      foreign key (organization_id, receiving_location_id) references warehouse.locations(organization_id, id)
    );
    create index inbound_shipments_queue on inbound_shipment.shipments (organization_id, status, receiving_status, created_at desc, id desc);

    create table inbound_shipment.purchase_line_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      shipment_id uuid not null references inbound_shipment.shipments(id) on delete restrict,
      purchase_line_id uuid not null references procurement.purchase_lines(id) on delete restrict,
      variant_id uuid not null,
      sku_snapshot text not null,
      product_title_snapshot text not null,
      allocated_quantity numeric(20,6) not null check (allocated_quantity > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (shipment_id, purchase_line_id),
      unique (organization_id, id),
      foreign key (organization_id, shipment_id) references inbound_shipment.shipments(organization_id, id),
      foreign key (organization_id, purchase_line_id) references procurement.purchase_lines(organization_id, id),
      foreign key (organization_id, variant_id) references catalog.product_variants(organization_id, id)
    );
    create index shipment_allocations_purchase_line on inbound_shipment.purchase_line_allocations (organization_id, purchase_line_id, shipment_id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('inbound_shipment.view', 'inbound_shipment', 'View inbound shipment planning and receiving status.', 'INTERNAL'),
      ('inbound_shipment.manage', 'inbound_shipment', 'Plan allocations and record shipment arrival.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('inbound_shipment.view'), ('inbound_shipment.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Inbound shipment records are operational history and have no automatic down migration.',
  );
}
