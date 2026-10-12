import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table if not exists inventory.inventory_units (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      unit_code text not null,
      inventory_item_id uuid not null,
      variant_id uuid not null,
      location_id uuid not null,
      inventory_condition_code text not null check (inventory_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      current_condition text not null default 'GRADE_A' check (current_condition in ('GRADE_A', 'GRADE_B', 'REPAIR_REQUIRED', 'DAMAGED_UNSELLABLE')),
      status text not null default 'AWAITING_QC' check (status in ('AWAITING_QC', 'AVAILABLE', 'RESERVED', 'IN_FULFILLMENT', 'IN_TRANSFER', 'DISPATCHED', 'ON_HOLD', 'RETURNED', 'WRITTEN_OFF')),
      source_type text not null default 'INBOUND_RECEIPT' check (source_type in ('INBOUND_RECEIPT', 'STOCK_CONVERSION', 'RETURN_RECEIPT', 'MANUAL_INTAKE')),
      source_receipt_id uuid references receiving.inbound_receipts(id),
      source_receipt_line_id uuid references receiving.inbound_receipt_lines(id),
      source_return_receipt_id uuid references returns.return_receipts(id),
      package_reference text,
      storage_notes text,
      barcode_payload text not null,
      current_fulfillment_id uuid references fulfillment.fulfillments(id),
      current_fulfillment_line_id uuid references fulfillment.fulfillment_lines(id),
      current_order_id uuid references orders.orders(id),
      current_order_line_id uuid references orders.order_lines(id),
      registered_by_actor_id uuid references iam.users(id),
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, unit_code),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, variant_id) references catalog.product_variants(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id),
      foreign key (organization_id, source_receipt_id) references receiving.inbound_receipts(organization_id, id),
      foreign key (organization_id, source_receipt_line_id) references receiving.inbound_receipt_lines(organization_id, id),
      foreign key (organization_id, source_return_receipt_id) references returns.return_receipts(organization_id, id),
      check (
        (source_type = 'INBOUND_RECEIPT' and source_receipt_id is not null and source_receipt_line_id is not null)
        or (source_type = 'RETURN_RECEIPT' and source_return_receipt_id is not null)
        or (source_type in ('STOCK_CONVERSION', 'MANUAL_INTAKE') and source_receipt_id is null and source_receipt_line_id is null and source_return_receipt_id is null)
      )
    );

    create index if not exists inventory_units_org_unit_code
      on inventory.inventory_units (organization_id, unit_code);
    create index if not exists inventory_units_org_variant_status
      on inventory.inventory_units (organization_id, variant_id, location_id, inventory_condition_code, status);
    create index if not exists inventory_units_org_location
      on inventory.inventory_units (organization_id, location_id, status);
    create index if not exists inventory_units_org_fulfillment
      on inventory.inventory_units (organization_id, current_fulfillment_id)
      where current_fulfillment_id is not null;
    create index if not exists inventory_units_org_source_receipt
      on inventory.inventory_units (organization_id, source_receipt_id)
      where source_receipt_id is not null;
    create index if not exists inventory_units_org_source_receipt_line
      on inventory.inventory_units (organization_id, source_receipt_line_id)
      where source_receipt_line_id is not null;
    create index if not exists inventory_units_org_source_return_receipt
      on inventory.inventory_units (organization_id, source_return_receipt_id)
      where source_return_receipt_id is not null;

    create table if not exists inventory.unit_inspections (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      unit_id uuid not null references inventory.inventory_units(id),
      inspection_number text not null,
      inspector_actor_id uuid references iam.users(id),
      inspection_stage text not null check (inspection_stage in ('INBOUND_INTAKE', 'REINSPECTION', 'RETURN_INSPECTION', 'ROUTINE_AUDIT')),
      condition_result text not null check (condition_result in ('GRADE_A', 'GRADE_B', 'REPAIR_REQUIRED', 'DAMAGED_UNSELLABLE')),
      defect_description text,
      notes text,
      media_asset_ids uuid[] not null default array[]::uuid[],
      inspection_outcome text not null check (inspection_outcome in ('PASSED', 'PASSED_WITH_DEFECT', 'HOLD_FOR_REPAIR', 'QUARANTINE_DAMAGED')),
      disposition text check (disposition in ('RELEASE_SELLABLE', 'RESTRICTED_SALE', 'MOVE_TO_REPAIR', 'WRITE_OFF', 'HOLD')),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, inspection_number),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id)
    );

    create index if not exists unit_inspections_unit
      on inventory.unit_inspections (organization_id, unit_id, created_at desc);

    create table if not exists inventory.unit_repairs (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      unit_id uuid not null references inventory.inventory_units(id),
      repair_number text not null,
      repair_status text not null default 'REQUESTED' check (repair_status in ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
      defect_description text not null,
      action_required text,
      action_performed text,
      technician_name text,
      cost_amount numeric(20,4),
      cost_currency text not null default 'BDT',
      media_asset_ids uuid[] not null default array[]::uuid[],
      notes text,
      created_by_actor_id uuid references iam.users(id),
      started_at timestamptz,
      completed_at timestamptz,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, repair_number),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id)
    );

    create index if not exists unit_repairs_unit
      on inventory.unit_repairs (organization_id, unit_id, created_at desc);
    create index if not exists unit_repairs_status
      on inventory.unit_repairs (organization_id, repair_status);

    create table if not exists inventory.unit_events (
      id bigint generated always as identity primary key,
      event_id uuid not null unique default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      unit_id uuid not null references inventory.inventory_units(id),
      event_type text not null check (event_type in (
        'REGISTERED', 'INSPECTED', 'CONDITION_CHANGED', 'STATUS_CHANGED',
        'REPAIR_REQUESTED', 'REPAIR_STARTED', 'REPAIR_COMPLETED',
        'LOCATION_MOVED', 'REPACKAGED', 'ALLOCATED_TO_FULFILLMENT',
        'RELEASED_FROM_FULFILLMENT', 'PICKED', 'PACKED', 'DISPATCHED',
        'TRANSFER_DISPATCHED', 'TRANSFER_RECEIVED',
        'RETURNED', 'RETURN_INSPECTED', 'RELEASED_FOR_SALE', 'QUARANTINED',
        'WRITTEN_OFF', 'AUTHORIZED_CORRECTION'
      )),
      actor_type text not null default 'USER',
      actor_id uuid references iam.users(id),
      from_status text,
      to_status text,
      from_condition text,
      to_condition text,
      from_location_id uuid references warehouse.locations(id),
      to_location_id uuid references warehouse.locations(id),
      reference_type text,
      reference_id uuid,
      reason text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id)
    );

    create index if not exists unit_events_unit
      on inventory.unit_events (organization_id, unit_id, created_at desc, id desc);

    create table if not exists inventory.unit_transfer_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      transfer_id uuid not null,
      transfer_line_id uuid not null,
      unit_id uuid not null,
      status text not null check (status in ('IN_TRANSIT', 'RECEIVED', 'LOST')),
      received_condition_code text check (received_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      dispatched_by_actor_id uuid references iam.users(id),
      received_by_actor_id uuid references iam.users(id),
      dispatched_at timestamptz not null default now(),
      received_at timestamptz,
      unique (organization_id, id),
      unique (organization_id, transfer_id, unit_id),
      foreign key (organization_id, transfer_id) references warehouse.transfers(organization_id, id),
      foreign key (organization_id, transfer_line_id) references warehouse.transfer_lines(organization_id, id),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id),
      check ((status = 'IN_TRANSIT' and received_condition_code is null and received_at is null) or status <> 'IN_TRANSIT'),
      check ((status = 'RECEIVED' and received_condition_code is not null and received_at is not null) or status <> 'RECEIVED')
    );
    create unique index if not exists unit_transfer_allocations_one_active_transfer
      on inventory.unit_transfer_allocations (organization_id, unit_id)
      where status = 'IN_TRANSIT';
    create index if not exists unit_transfer_allocations_transfer_line
      on inventory.unit_transfer_allocations (organization_id, transfer_line_id, status, unit_id);

    create table if not exists inventory.stocktake_unit_counts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      stocktake_session_id uuid not null,
      stocktake_line_id uuid not null,
      unit_id uuid not null,
      expected_at_snapshot boolean not null default true,
      expected_condition_code text check (expected_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      counted_condition_code text check (counted_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      counted_at timestamptz,
      unique (organization_id, id),
      unique (organization_id, stocktake_session_id, unit_id),
      foreign key (organization_id, stocktake_session_id) references inventory.stocktake_sessions(organization_id, id),
      foreign key (organization_id, stocktake_line_id) references inventory.stocktake_lines(organization_id, id),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id),
      check ((counted_condition_code is null and counted_at is null) or (counted_condition_code is not null and counted_at is not null))
    );
    create index if not exists stocktake_unit_counts_line
      on inventory.stocktake_unit_counts (organization_id, stocktake_line_id, expected_at_snapshot, unit_id);

    create table if not exists fulfillment.fulfillment_unit_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      fulfillment_id uuid not null references fulfillment.fulfillments(id),
      fulfillment_line_id uuid not null references fulfillment.fulfillment_lines(id),
      unit_id uuid not null references inventory.inventory_units(id),
      allocated_at timestamptz not null default now(),
      created_by_actor_id uuid references iam.users(id),
      unique (organization_id, id),
      unique (fulfillment_line_id, unit_id),
      foreign key (organization_id, fulfillment_id) references fulfillment.fulfillments(organization_id, id),
      foreign key (organization_id, fulfillment_line_id) references fulfillment.fulfillment_lines(organization_id, id),
      foreign key (organization_id, unit_id) references inventory.inventory_units(organization_id, id)
    );

    create index if not exists fulfillment_unit_allocations_lookup
      on fulfillment.fulfillment_unit_allocations (organization_id, fulfillment_id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity)
    values
      ('inventory.units.view', 'inventory', 'View individual inventory units and traceability history.', 'INTERNAL'),
      ('inventory.units.manage', 'inventory', 'Register units, perform QC, repairs, and location movements.', 'HIGH'),
      ('inventory.units.release', 'inventory', 'Release restricted or hold units for sale.', 'HIGH'),
      ('inventory.units.write_off', 'inventory', 'Authorize write-offs for damaged or lost units.', 'HIGH')
    on conflict (capability_code) do update set
      description = excluded.description,
      sensitivity = excluded.sensitivity;

    update iam.capability_definitions
    set supported_scope_types = array['LOCATION']::text[]
    where capability_code in (
      'inventory.units.view',
      'inventory.units.manage',
      'inventory.units.release',
      'inventory.units.write_off'
    );

    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (
        values
          ('inventory.units.view'),
          ('inventory.units.manage'),
          ('inventory.units.release'),
          ('inventory.units.write_off')
      ) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Unit traceability and QC records are authoritative historical truth and cannot be automatically dropped.');
}
