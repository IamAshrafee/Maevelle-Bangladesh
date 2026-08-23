import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Delivery, courier booking, and customer outcome remain separate physical facts. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists delivery;

    create table delivery.delivery_methods (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null check (code in ('HOME_DELIVERY')),
      name text not null,
      method_type text not null check (method_type in ('HOME_DELIVERY')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
      customer_visibility boolean not null default true,
      configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, code),
      unique (organization_id, id)
    );
    insert into delivery.delivery_methods (organization_id, code, name, method_type)
      select id, 'HOME_DELIVERY', 'Home delivery', 'HOME_DELIVERY' from platform.organizations
    on conflict (organization_id, code) do nothing;

    create table delivery.deliveries (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_number text not null,
      order_id uuid not null references orders.orders(id),
      fulfillment_id uuid not null unique references fulfillment.fulfillments(id),
      delivery_method_id uuid not null references delivery.delivery_methods(id),
      operational_status text not null default 'READY' check (operational_status in ('READY', 'BOOKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
      outcome_status text not null default 'PENDING' check (outcome_status in ('PENDING', 'DELIVERED', 'FAILED', 'CANCELLED_BEFORE_HANDOVER', 'LOST', 'DAMAGED')),
      recipient_name text not null,
      recipient_phone text not null,
      address_snapshot jsonb not null check (jsonb_typeof(address_snapshot) = 'object'),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      cod_required boolean not null default false,
      cod_expected_amount numeric(20,4) not null default 0 check (cod_expected_amount >= 0),
      manual_carrier_name text,
      tracking_reference text,
      created_by_actor_id uuid,
      ready_at timestamptz not null default now(),
      handed_over_at timestamptz,
      delivered_at timestamptz,
      failed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, delivery_number),
      unique (organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id),
      foreign key (organization_id, fulfillment_id) references fulfillment.fulfillments(organization_id, id),
      foreign key (organization_id, delivery_method_id) references delivery.delivery_methods(organization_id, id)
    );
    create index deliveries_queue on delivery.deliveries (organization_id, operational_status, created_at asc, id asc);
    create index deliveries_order on delivery.deliveries (organization_id, order_id, created_at desc, id desc);

    create table delivery.delivery_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id) on delete restrict,
      fulfillment_line_id uuid not null references fulfillment.fulfillment_lines(id),
      order_line_id uuid not null references orders.order_lines(id),
      quantity numeric(20,6) not null check (quantity > 0),
      delivered_quantity numeric(20,6) not null default 0 check (delivered_quantity >= 0),
      failed_quantity numeric(20,6) not null default 0 check (failed_quantity >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (delivery_id, fulfillment_line_id),
      unique (organization_id, id),
      check (delivered_quantity + failed_quantity <= quantity),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );

    create table delivery.delivery_packages (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      package_number integer not null default 1 check (package_number > 0),
      weight_value numeric(20,6),
      weight_unit text not null default 'KG',
      weight_source text not null default 'MANUAL' check (weight_source in ('ESTIMATED_FROM_PRODUCTS', 'MANUAL', 'MEASURED')),
      declared_value numeric(20,4),
      currency_code text,
      status text not null default 'READY' check (status in ('READY', 'HANDED_OVER', 'DELIVERED', 'FAILED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (delivery_id, package_number),
      unique (organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );
    create table delivery.delivery_package_lines (
      package_id uuid not null references delivery.delivery_packages(id) on delete restrict,
      delivery_line_id uuid not null references delivery.delivery_lines(id) on delete restrict,
      quantity numeric(20,6) not null check (quantity > 0),
      primary key (package_id, delivery_line_id)
    );

    create table delivery.courier_bookings (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      provider_code text not null default 'MANUAL',
      booking_sequence integer not null check (booking_sequence > 0),
      status text not null default 'PENDING' check (status in ('PENDING', 'BOOKED', 'REJECTED', 'CANCELLED', 'UNKNOWN_OUTCOME')),
      merchant_reference text not null,
      external_consignment_id text,
      tracking_number text,
      requested_cod_amount numeric(20,4) not null default 0 check (requested_cod_amount >= 0),
      provider_confirmed_cod_amount numeric(20,4),
      package_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(package_snapshot) = 'object'),
      address_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(address_snapshot) = 'object'),
      created_at timestamptz not null default now(),
      booked_at timestamptz,
      cancelled_at timestamptz,
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (delivery_id, booking_sequence),
      unique (organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );
    create unique index courier_bookings_one_active_per_delivery on delivery.courier_bookings (delivery_id)
      where status in ('PENDING', 'BOOKED', 'UNKNOWN_OUTCOME');

    create table delivery.delivery_events (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      courier_booking_id uuid references delivery.courier_bookings(id),
      event_type text not null,
      provider_status_raw text,
      provider_event_id text,
      occurred_at timestamptz not null default now(),
      received_at timestamptz not null default now(),
      source text not null check (source in ('MANUAL', 'SYSTEM', 'PROVIDER')),
      metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );
    create unique index delivery_events_provider_dedupe on delivery.delivery_events (courier_booking_id, provider_event_id)
      where courier_booking_id is not null and provider_event_id is not null;
    create index delivery_events_timeline on delivery.delivery_events (organization_id, delivery_id, occurred_at asc, id asc);

    create table delivery.delivery_attempts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      courier_booking_id uuid references delivery.courier_bookings(id),
      attempt_number integer not null check (attempt_number > 0),
      attempted_at timestamptz not null default now(),
      outcome text not null check (outcome in ('DELIVERED', 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'ADDRESS_NOT_FOUND', 'RESCHEDULE_REQUESTED', 'PHONE_UNREACHABLE', 'PROVIDER_FAILURE', 'OTHER_FAILED')),
      reason_code text,
      notes text,
      created_at timestamptz not null default now(),
      unique (delivery_id, attempt_number),
      unique (organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );

    create table delivery.cod_collection_instructions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      version_number integer not null check (version_number > 0),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      expected_amount numeric(20,4) not null check (expected_amount >= 0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED', 'CANCELLED')),
      source_payment_state_version bigint,
      created_at timestamptz not null default now(),
      provider_synced_at timestamptz,
      unique (delivery_id, version_number),
      unique (organization_id, id),
      foreign key (organization_id, delivery_id) references delivery.deliveries(organization_id, id)
    );

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('delivery.view', 'delivery', 'View delivery, manual courier, and tracking history.', 'INTERNAL'),
      ('delivery.manage', 'delivery', 'Create deliveries and record manual courier bookings.', 'HIGH'),
      ('delivery.dispatch', 'delivery', 'Record physical handover and customer delivery outcomes.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('delivery.view'), ('delivery.manage'), ('delivery.dispatch')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Delivery and courier records are operational history and have no automatic down migration.',
  );
}
