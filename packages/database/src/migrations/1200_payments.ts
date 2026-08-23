import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Financial collection is deliberately separate from commercial Order state.
 * A Payment represents verified money only; pending wallet claims remain
 * payment attempts until an authorised verifier posts a Payment.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists payments;

    create table payments.payment_methods (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      code text not null check (code in ('COD', 'BKASH_MANUAL', 'NAGAD_MANUAL')),
      name text not null,
      method_type text not null check (method_type in ('COD', 'MOBILE_WALLET')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
      public_instructions jsonb not null default '{}'::jsonb check (jsonb_typeof(public_instructions) = 'object'),
      display_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, code),
      unique (organization_id, id)
    );
    create index payment_methods_checkout on payments.payment_methods (organization_id, display_order, id)
      where status = 'ACTIVE';
    insert into payments.payment_methods (organization_id, code, name, method_type, status, public_instructions, display_order)
      select organization.id, method.code, method.name, method.method_type, method.status, '{}'::jsonb, method.display_order
      from platform.organizations organization
      cross join (values
        ('COD', 'Cash on Delivery', 'COD', 'ACTIVE', 10),
        ('BKASH_MANUAL', 'bKash Manual', 'MOBILE_WALLET', 'DISABLED', 20),
        ('NAGAD_MANUAL', 'Nagad Manual', 'MOBILE_WALLET', 'DISABLED', 30)
      ) as method(code, name, method_type, status, display_order)
    on conflict (organization_id, code) do nothing;

    create table payments.payment_intents (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      order_id uuid not null references orders.orders(id),
      order_number_snapshot text not null,
      payment_method_id uuid not null references payments.payment_methods(id),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      expected_amount numeric(20,4) not null check (expected_amount >= 0),
      status text not null check (status in ('READY', 'SATISFIED', 'EXPIRED', 'CANCELLED')),
      instructions_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(instructions_snapshot) = 'object'),
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id),
      foreign key (organization_id, payment_method_id) references payments.payment_methods(organization_id, id)
    );
    create index payment_intents_order on payments.payment_intents (organization_id, order_id, created_at desc);
    create unique index payment_intents_one_active_method_per_order on payments.payment_intents (order_id, payment_method_id)
      where status = 'READY';

    create table payments.payment_attempts (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      payment_intent_id uuid not null references payments.payment_intents(id),
      customer_reference text not null,
      normalized_reference text not null,
      payer_reference text,
      claimed_amount numeric(20,4),
      status text not null default 'PENDING_VERIFICATION' check (status in ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
      rejection_reason_code text,
      reviewer_note text,
      submitted_at timestamptz not null default now(),
      resolved_at timestamptz,
      reviewed_by_actor_id uuid,
      created_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      foreign key (organization_id, payment_intent_id) references payments.payment_intents(organization_id, id)
    );
    create index payment_attempts_pending on payments.payment_attempts (organization_id, submitted_at, id)
      where status = 'PENDING_VERIFICATION';
    create index payment_attempts_intent on payments.payment_attempts (payment_intent_id, submitted_at desc);

    create table payments.payments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      payment_number text not null,
      payment_method_id uuid not null references payments.payment_methods(id),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      amount numeric(20,4) not null check (amount > 0),
      external_reference text not null,
      normalized_external_reference text not null,
      status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'VOIDED', 'REVERSED')),
      source_attempt_id uuid unique references payments.payment_attempts(id),
      confirmed_at timestamptz not null default now(),
      confirmed_by_actor_id uuid,
      created_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, payment_number),
      unique (organization_id, id),
      foreign key (organization_id, payment_method_id) references payments.payment_methods(organization_id, id)
    );
    create unique index payments_verified_external_reference on payments.payments (organization_id, payment_method_id, normalized_external_reference)
      where status = 'CONFIRMED';
    create index payments_list on payments.payments (organization_id, confirmed_at desc, id desc);

    create table payments.payment_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      payment_id uuid not null references payments.payments(id),
      order_id uuid not null references orders.orders(id),
      order_number_snapshot text not null,
      amount numeric(20,4) not null check (amount > 0),
      created_at timestamptz not null default now(),
      unique (organization_id, payment_id, order_id),
      foreign key (organization_id, payment_id) references payments.payments(organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id)
    );
    create index payment_allocations_order on payments.payment_allocations (organization_id, order_id);

    create table payments.refunds (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      refund_number text not null,
      order_id uuid not null references orders.orders(id),
      payment_id uuid not null references payments.payments(id),
      payment_method_id uuid not null references payments.payment_methods(id),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      amount numeric(20,4) not null check (amount > 0),
      status text not null default 'REQUESTED' check (status in ('REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME', 'COMPLETED', 'FAILED', 'CANCELLED_BEFORE_PROCESSING')),
      reason_code text not null,
      reason_text text,
      external_reference text,
      normalized_external_reference text,
      requested_at timestamptz not null default now(),
      completed_at timestamptz,
      requested_by_actor_id uuid,
      completed_by_actor_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, refund_number),
      unique (organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id),
      foreign key (organization_id, payment_id) references payments.payments(organization_id, id),
      foreign key (organization_id, payment_method_id) references payments.payment_methods(organization_id, id)
    );
    create index refunds_payment on payments.refunds (organization_id, payment_id, requested_at desc);
    create index refunds_order on payments.refunds (organization_id, order_id, requested_at desc);

    alter table orders.checkout_sessions drop constraint checkout_sessions_payment_method_check;
    alter table orders.checkout_sessions alter column payment_method drop default;
    alter table orders.checkout_sessions add constraint checkout_sessions_payment_method_check
      check (payment_method in ('COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'));
    alter table orders.orders drop constraint orders_payment_method_check;
    alter table orders.orders add constraint orders_payment_method_check
      check (payment_method in ('COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'));

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('payments.view', 'payments', 'View payment methods, payment attempts, payments, and payment summaries.', 'INTERNAL'),
      ('payments.verify', 'payments', 'Verify or reject manual payment submissions.', 'HIGH'),
      ('payments.manage', 'payments', 'Configure available payment methods.', 'HIGH'),
      ('refunds.view', 'payments', 'View refunds and refundable balances.', 'INTERNAL'),
      ('refunds.manage', 'payments', 'Create and complete manual refunds.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('payments.view'), ('payments.verify'), ('payments.manage'), ('refunds.view'), ('refunds.manage')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Payment and Refund records are financial history and have no automatic down migration.',
  );
}
