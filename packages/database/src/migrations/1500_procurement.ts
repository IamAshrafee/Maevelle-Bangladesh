import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Supplier commercial agreements are distinct from customer and inventory records. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists procurement;

    create table procurement.suppliers (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null,
      name text not null check (length(trim(name)) > 0),
      contact_name text,
      contact_email text,
      contact_phone text,
      notes text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, code),
      unique (organization_id, id)
    );
    create index suppliers_organization_status on procurement.suppliers (organization_id, status, name, id);

    create table procurement.purchases (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      purchase_number text not null,
      supplier_id uuid not null references procurement.suppliers(id),
      currency_code text not null check (currency_code in ('BDT', 'CNY', 'USD')),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'PLACED', 'CANCELLED', 'CLOSED')),
      notes text,
      placed_at timestamptz,
      closed_at timestamptz,
      closed_by_actor_id uuid,
      close_reason text,
      cancelled_at timestamptz,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, purchase_number),
      unique (organization_id, id),
      foreign key (organization_id, supplier_id) references procurement.suppliers(organization_id, id)
    );
    create index purchases_organization_supplier_status on procurement.purchases (organization_id, supplier_id, status, created_at desc, id desc);

    create table procurement.purchase_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      purchase_id uuid not null references procurement.purchases(id) on delete restrict,
      variant_id uuid not null,
      sku_snapshot text not null,
      product_title_snapshot text not null,
      quantity numeric(20,6) not null check (quantity > 0),
      unit_price numeric(20,4) not null check (unit_price >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      foreign key (organization_id, purchase_id) references procurement.purchases(organization_id, id),
      foreign key (organization_id, variant_id) references catalog.product_variants(organization_id, id)
    );
    create index purchase_lines_purchase on procurement.purchase_lines (organization_id, purchase_id, id);

    -- Supplier sizing is evidence until an authorized operator deliberately
    -- applies it as a Product-level guide assignment.
    create table sizing.supply_purchase_fit_evidence (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      purchase_id uuid not null,
      product_id uuid not null,
      proposed_size_guide_id uuid,
      decision text not null default 'PENDING'
        check (decision in ('PENDING', 'KEEP_CURRENT', 'EVIDENCE_ONLY', 'APPLIED_TO_PRODUCT')),
      notes text,
      reviewed_by_actor_id uuid references iam.users(id),
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version >= 1),

      unique (organization_id, purchase_id, product_id),
      unique (organization_id, id),

      foreign key (organization_id, purchase_id)
        references procurement.purchases (organization_id, id)
        on delete restrict,
      foreign key (organization_id, product_id)
        references catalog.products (organization_id, id)
        on delete restrict,
      foreign key (proposed_size_guide_id, organization_id)
        references sizing.size_guides (id, organization_id)
        on delete restrict,

      check (
        (decision = 'KEEP_CURRENT' and proposed_size_guide_id is null)
        or decision <> 'KEEP_CURRENT'
      ),
      check (
        (decision = 'APPLIED_TO_PRODUCT' and proposed_size_guide_id is not null)
        or decision <> 'APPLIED_TO_PRODUCT'
      )
    );
    create index supply_purchase_fit_evidence_purchase
      on sizing.supply_purchase_fit_evidence (organization_id, purchase_id, decision, product_id);
    create index supply_purchase_fit_evidence_product
      on sizing.supply_purchase_fit_evidence (organization_id, product_id, updated_at desc, id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('procurement.view', 'procurement', 'View suppliers and purchase records.', 'INTERNAL'),
      ('procurement.manage', 'procurement', 'Create and place supplier purchases.', 'HIGH'),
      ('sizing.supply_review', 'sizing', 'Review supplier fit evidence and apply sizing to Products.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('procurement.view'), ('procurement.manage'), ('sizing.supply_review')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Procurement records are operational history and have no automatic down migration.',
  );
}
