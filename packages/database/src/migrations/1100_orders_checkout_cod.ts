import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Checkout remains provisional; Orders and their snapshots become immutable
 * commercial history only after the PlaceOrder transaction commits.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists orders;

    create table orders.checkout_sessions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      cart_id uuid not null references cart.carts(id),
      public_token_hash text not null unique,
      customer_id uuid references customers.customers(id),
      customer_name text,
      customer_phone text,
      customer_email text,
      recipient_name text,
      delivery_phone text,
      address_line_1 text,
      address_line_2 text,
      geography_node_id uuid references geography.nodes(id),
      area text,
      city text,
      district text,
      postal_code text,
      country_code text,
      payment_method text not null default 'COD' check (payment_method = 'COD'),
      cart_version bigint not null,
      calculation_version bigint not null,
      calculation_fingerprint text not null,
      calculated_totals jsonb not null check (jsonb_typeof(calculated_totals) = 'object'),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CHANGED', 'ORDER_PLACED', 'EXPIRED')),
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id)
    );
    create index checkout_sessions_active_lookup on orders.checkout_sessions (organization_id, expires_at)
      where status in ('ACTIVE', 'CHANGED');

    create table orders.orders (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_number text not null,
      checkout_session_id uuid unique references orders.checkout_sessions(id),
      customer_id uuid references customers.customers(id),
      source text not null default 'STOREFRONT' check (source in ('STOREFRONT', 'MANUAL')),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      order_status text not null default 'PENDING' check (order_status in ('PENDING', 'CONFIRMED', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
      payment_method text not null check (payment_method in ('COD', 'BKASH_MANUAL', 'NAGAD_MANUAL')),
      subtotal_amount numeric(20,4) not null check (subtotal_amount >= 0),
      discount_amount numeric(20,4) not null check (discount_amount >= 0),
      delivery_amount numeric(20,4) not null default 0 check (delivery_amount >= 0),
      tax_amount numeric(20,4) not null default 0 check (tax_amount = 0),
      total_amount numeric(20,4) not null check (total_amount >= 0),
      confirmed_at timestamptz,
      completed_at timestamptz,
      cancelled_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, order_number),
      unique (organization_id, id),
      check (total_amount = subtotal_amount - discount_amount + delivery_amount + tax_amount)
    );
    alter table orders.checkout_sessions
      add column resulting_order_id uuid unique references orders.orders(id);
    create index orders_orders_list on orders.orders (organization_id, created_at desc, id desc);
    create index orders_orders_customer on orders.orders (organization_id, customer_id, created_at desc);

    create table orders.order_customer_snapshots (
      order_id uuid primary key references orders.orders(id),
      organization_id uuid not null references platform.organizations(id),
      customer_id uuid references customers.customers(id),
      display_name text not null,
      phone text not null,
      email text,
      created_at timestamptz not null default now(),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );

    create table orders.order_addresses (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null references orders.orders(id),
      address_type text not null default 'DELIVERY' check (address_type in ('DELIVERY', 'BILLING')),
      source_customer_address_id uuid references customers.customer_addresses(id),
      geography_node_id uuid references geography.nodes(id),
      recipient_name text not null,
      phone text not null,
      address_line_1 text not null,
      address_line_2 text,
      area text,
      city text,
      district text,
      postal_code text,
      country_code text not null check (country_code ~ '^[A-Z]{2}$'),
      created_at timestamptz not null default now(),
      unique (order_id, address_type),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );

    create table orders.order_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null references orders.orders(id),
      product_id uuid references catalog.products(id),
      variant_id uuid references catalog.product_variants(id),
      inventory_item_id uuid references inventory.inventory_items(id),
      quantity numeric(20,6) not null check (quantity > 0),
      sku_snapshot text not null,
      product_title_snapshot text not null,
      variant_title_snapshot text,
      option_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(option_snapshot) = 'array'),
      unit_price numeric(20,4) not null check (unit_price >= 0),
      gross_amount numeric(20,4) not null check (gross_amount >= 0),
      discount_amount numeric(20,4) not null check (discount_amount >= 0),
      net_amount numeric(20,4) not null check (net_amount >= 0),
      created_at timestamptz not null default now(),
      check (net_amount = gross_amount - discount_amount),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );
    create index order_lines_order on orders.order_lines (order_id, id);

    create table orders.order_discount_applications (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null references orders.orders(id),
      promotion_id uuid references promotions.promotions(id),
      promotion_revision_id uuid references promotions.promotion_revisions(id),
      coupon_code_id uuid references promotions.coupon_codes(id),
      promotion_name_snapshot text not null,
      coupon_code_snapshot text,
      benefit_type_snapshot text not null,
      benefit_value_snapshot numeric(20,4) not null,
      discount_amount numeric(20,4) not null check (discount_amount >= 0),
      created_at timestamptz not null default now(),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );
    create table orders.order_discount_allocations (
      organization_id uuid not null references platform.organizations(id),
      discount_application_id uuid not null references orders.order_discount_applications(id) on delete cascade,
      order_line_id uuid not null references orders.order_lines(id),
      discount_amount numeric(20,4) not null check (discount_amount >= 0),
      primary key (discount_application_id, order_line_id)
    );

    create table orders.order_inventory_reservations (
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null references orders.orders(id),
      order_line_id uuid not null references orders.order_lines(id),
      reservation_id uuid not null unique references inventory.inventory_reservations(id),
      created_at timestamptz not null default now(),
      primary key (order_line_id, reservation_id)
    );

    create table orders.order_cancellations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null unique references orders.orders(id),
      reason_code text not null,
      reason_text text,
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );

    alter table promotions.promotion_usage
      add constraint promotion_usage_order_fk foreign key (order_id) references orders.orders(id);
    create unique index promotion_usage_committed_coupon_customer_once
      on promotions.promotion_usage (coupon_code_id, customer_id, order_id)
      where status = 'COMMITTED' and coupon_code_id is not null;

    -- Internal and customer-visible notes on an order.
    -- Distinct from the audit log: notes are operator-authored commentary.
    create table orders.order_notes (
      id              uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id        uuid not null references orders.orders(id),
      author_actor_id uuid not null,
      note_type       text not null default 'INTERNAL'
                        check (note_type in ('INTERNAL', 'CUSTOMER_VISIBLE')),
      body            text not null check (length(trim(body)) > 0),
      created_at      timestamptz not null default now(),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );
    create index order_notes_order_idx on orders.order_notes (order_id, created_at desc);

    -- Traceability record linking order completion to the triggering event.
    -- trigger_outbox_event_id is null when an admin manually completes an order.
    create table orders.order_completion_events (
      order_id                uuid primary key references orders.orders(id),
      organization_id         uuid not null references platform.organizations(id),
      trigger_outbox_event_id uuid,
      completed_by_actor_id   uuid,
      created_at              timestamptz not null default now()
    );

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('orders.view',   'orders', 'View Orders and historical commercial snapshots.', 'INTERNAL'),
      ('orders.manage', 'orders', 'Confirm, hold, resume, cancel, complete, and annotate eligible Orders.', 'HIGH'),
      ('orders.create', 'orders', 'Create manual Orders from the admin panel.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('orders.view'), ('orders.manage'), ('orders.create')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Checkout and Order records are commercial history and have no automatic down migration.',
  );
}
