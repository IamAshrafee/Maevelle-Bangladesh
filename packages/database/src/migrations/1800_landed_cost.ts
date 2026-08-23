import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Shipment-centric, revisioned acquisition-cost calculations. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists landed_cost;

    create table landed_cost.worksheets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      shipment_id uuid not null references inbound_shipment.shipments(id),
      worksheet_number text not null,
      base_currency_code text not null check (base_currency_code ~ '^[A-Z]{3}$'),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'CALCULATED', 'FINALIZED', 'SUPERSEDED')),
      current_revision_id uuid,
      notes text,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      finalized_at timestamptz,
      version integer not null default 1 check (version > 0),
      unique (organization_id, worksheet_number),
      unique (organization_id, id),
      foreign key (organization_id, shipment_id) references inbound_shipment.shipments(organization_id, id)
    );
    create index landed_cost_worksheets_shipment on landed_cost.worksheets (organization_id, shipment_id, created_at desc);

    create table landed_cost.worksheet_revisions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      worksheet_id uuid not null references landed_cost.worksheets(id) on delete restrict,
      revision_number integer not null check (revision_number > 0),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'CALCULATED', 'FINALIZED', 'SUPERSEDED')),
      revision_kind text not null default 'INITIAL' check (revision_kind in ('INITIAL', 'ADJUSTMENT', 'CREDIT')),
      supersedes_revision_id uuid references landed_cost.worksheet_revisions(id),
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      finalized_at timestamptz,
      unique (worksheet_id, revision_number),
      unique (organization_id, id),
      foreign key (organization_id, worksheet_id) references landed_cost.worksheets(organization_id, id)
    );
    alter table landed_cost.worksheets add constraint landed_cost_worksheets_current_revision_fk
      foreign key (current_revision_id) references landed_cost.worksheet_revisions(id);

    create table landed_cost.allocation_targets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      worksheet_revision_id uuid not null references landed_cost.worksheet_revisions(id) on delete restrict,
      shipment_allocation_id uuid not null references inbound_shipment.purchase_line_allocations(id),
      eligible_quantity numeric(20,6) not null check (eligible_quantity >= 0),
      purchase_value numeric(20,4),
      weight numeric(20,6),
      volume numeric(20,6),
      chargeable_weight numeric(20,6),
      percentage numeric(12,8),
      manual_amount numeric(20,4),
      created_at timestamptz not null default now(),
      unique (worksheet_revision_id, shipment_allocation_id),
      unique (organization_id, id),
      foreign key (organization_id, worksheet_revision_id) references landed_cost.worksheet_revisions(organization_id, id),
      foreign key (organization_id, shipment_allocation_id) references inbound_shipment.purchase_line_allocations(organization_id, id),
      check (weight is null or weight >= 0),
      check (volume is null or volume >= 0),
      check (chargeable_weight is null or chargeable_weight >= 0)
    );

    create table landed_cost.cost_components (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      worksheet_revision_id uuid not null references landed_cost.worksheet_revisions(id) on delete restrict,
      cost_type text not null check (cost_type in ('PURCHASE_COST', 'INTERNATIONAL_FREIGHT', 'LOCAL_FREIGHT', 'CUSTOMS_DUTY', 'TAX_OR_IMPORT_FEE', 'FORWARDER_FEE', 'HANDLING', 'INSURANCE', 'OTHER_ACQUISITION_COST')),
      reference text,
      scope text not null check (scope in ('GLOBAL', 'DIRECT')),
      direct_shipment_allocation_id uuid references inbound_shipment.purchase_line_allocations(id),
      original_amount numeric(20,4) not null,
      original_currency_code text not null check (original_currency_code ~ '^[A-Z]{3}$'),
      fx_rate numeric(24,12),
      fx_rate_recorded_at timestamptz,
      fx_source text,
      worksheet_amount numeric(20,4) not null,
      value_status text not null check (value_status in ('ESTIMATED', 'ACTUAL', 'CREDIT')),
      allocation_method text not null check (allocation_method in ('EQUAL', 'QUANTITY', 'PURCHASE_VALUE', 'WEIGHT', 'VOLUME', 'CHARGEABLE_WEIGHT', 'PERCENTAGE', 'MANUAL', 'DIRECT')),
      notes text,
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, worksheet_revision_id) references landed_cost.worksheet_revisions(organization_id, id),
      foreign key (organization_id, direct_shipment_allocation_id) references inbound_shipment.purchase_line_allocations(organization_id, id),
      check (fx_rate is null or fx_rate > 0)
    );
    create index landed_cost_components_revision on landed_cost.cost_components (organization_id, worksheet_revision_id);

    create table landed_cost.component_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      cost_component_id uuid not null references landed_cost.cost_components(id) on delete restrict,
      allocation_target_id uuid not null references landed_cost.allocation_targets(id) on delete restrict,
      basis_value numeric(24,12),
      raw_amount numeric(24,12) not null,
      allocated_amount numeric(20,4) not null,
      created_at timestamptz not null default now(),
      unique (cost_component_id, allocation_target_id),
      unique (organization_id, id),
      foreign key (organization_id, cost_component_id) references landed_cost.cost_components(organization_id, id),
      foreign key (organization_id, allocation_target_id) references landed_cost.allocation_targets(organization_id, id)
    );

    create table landed_cost.acquisition_cost_results (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      worksheet_revision_id uuid not null references landed_cost.worksheet_revisions(id) on delete restrict,
      allocation_target_id uuid not null references landed_cost.allocation_targets(id) on delete restrict,
      purchase_cost numeric(24,8) not null,
      additional_cost numeric(24,8) not null,
      total_acquisition_cost numeric(24,8) not null,
      unit_acquisition_cost numeric(24,8) not null,
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      created_at timestamptz not null default now(),
      unique (worksheet_revision_id, allocation_target_id),
      unique (organization_id, id),
      foreign key (organization_id, worksheet_revision_id) references landed_cost.worksheet_revisions(organization_id, id),
      foreign key (organization_id, allocation_target_id) references landed_cost.allocation_targets(organization_id, id)
    );

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('landed_cost.view', 'landed_cost', 'View shipment acquisition-cost worksheets.', 'INTERNAL'),
      ('landed_cost.manage', 'landed_cost', 'Create and calculate landed-cost worksheets.', 'HIGH'),
      ('landed_cost.finalize', 'landed_cost', 'Finalize immutable landed-cost revisions.', 'HIGH'),
      ('costing.view', 'costing', 'View inventory cost layers and valuation.', 'INTERNAL')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('landed_cost.view'), ('landed_cost.manage'), ('landed_cost.finalize'), ('costing.view')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Landed-cost worksheets are immutable financial provenance and have no automatic down migration.',
  );
}
